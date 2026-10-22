import path from 'node:path';
import { access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Upstream remains unmodified. MOTIF owns one long-lived stdio connection,
// including the in-memory login handoff; no session or account data is logged.
export class GoogleFlowMcp {
  constructor({ studioDir, dataDir, clientFactory } = {}) {
    const compat = path.join(studioDir, '.studio', 'google-flow-mcp-runtime');
    this.repo = existsSync(path.join(compat, 'motif-compat.json')) ? compat : path.join(studioDir, '.studio', 'vendor', 'google-flow-mcp');
    this.dataDir = path.join(dataDir, 'google-flow-mcp');
    this.extensionDirectory = path.join(this.repo, 'extension');
    this.clientFactory = clientFactory;
    this.connection = null;
    this.connecting = null;
    this.pending = null;
    this.completing = false;
  }

  async connect() {
    if (this.connection) return this.connection;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const entry = path.join(this.repo, 'dist', 'index.js');
      let connection;
      if (this.clientFactory) connection = await this.clientFactory();
      else {
        await access(entry);
        const sdk = path.join(this.repo, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', 'client');
        const [{ Client }, { StdioClientTransport }] = await Promise.all([
          import(pathToFileURL(path.join(sdk, 'index.js')).href),
          import(pathToFileURL(path.join(sdk, 'stdio.js')).href),
        ]);
        const transport = new StdioClientTransport({
          command: process.execPath, args: [entry], cwd: this.repo, stderr: 'pipe',
          env: { ...process.env, FLOW_MCP_DATA_DIR: this.dataDir, FLOW_MCP_HEADLESS: '0',
            FLOW_MCP_BROWSER_EXECUTABLE: process.env.FLOW_MCP_BROWSER_EXECUTABLE || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
        });
        transport.stderr?.on('data', () => {});
        const client = new Client({ name: 'motif-studio', version: '1.0.0' });
        try { await client.connect(transport); }
        catch (error) { await transport.close().catch(() => {}); throw error; }
        connection = client;
      }
      const tools = await connection.listTools();
      for (const name of ['flow_help', 'flow_list_accounts', 'flow_begin_account_connection', 'flow_complete_account_connection']) {
        if (!tools.tools.some(tool => tool.name === name)) {
          await connection.close(); throw Error('MCP_TOOL_MISSING');
        }
      }
      this.connection = connection;
      this.toolCount = tools.tools.length;
      return connection;
    })();
    try { return await this.connecting; }
    finally { this.connecting = null; }
  }

  async call(name, args = {}, timeout = 30000) {
    const client = await this.connect();
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout });
    const raw = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || '';
    if (result.isError) {
      // Never forward upstream diagnostics containing account identity or URLs.
      const error = Error('Flow MCP perlu diperiksa. Selesaikan login atau verifikasi di browser; generasi tidak diulang.');
      error.code = /flow_access_unavailable/.test(raw) ? 'FLOW_ACCESS_UNAVAILABLE' : /login_required/.test(raw) ? 'LOGIN_REQUIRED' : 'FLOW_MCP_ERROR';
      throw error;
    }
    try { return JSON.parse(raw); } catch { return { message: raw }; }
  }

  async status() {
    if (this.pending && Date.now() > this.pending.expires) this.pending = null;
    try {
      const result = await this.call('flow_list_accounts');
      const connected = (result.accounts || []).filter(account => account.connectionStatus === 'connected');
      const oneAccount = connected.length === 1;
      return { installed: true, discovered: true, toolCount: this.toolCount,
        connected: result.readyForGeneration === true && oneAccount,
        accountCount: connected.length, singleAccount: connected.length <= 1,
        extensionDirectory: this.extensionDirectory, completing: this.completing,
        connectionPending: Boolean(this.pending), provider: 'google-flow-mcp',
        detail: connected.length > 1 ? 'MOTIF memerlukan satu akun saja.' : oneAccount ? 'Sesi Flow terverifikasi. Generasi tetap mengikuti anggaran job.' : 'Connector aktif. Sambungkan satu akun melalui Flow Login Bridge.',
      };
    } catch {
      return { installed: false, discovered: false, connected: false, accountCount: 0,
        extensionDirectory: this.extensionDirectory, detail: 'Connector belum aktif. Periksa instalasi server MCP.' };
    }
  }

  // Reopen the previously authorized profile through the original session
  // broker. It launches a normal visible Brave process and publishes localhost
  // CDP for the production MCP; it does not automate Google sign-in.
  async openExisting() {
    if(this.openingBrowser)return this.openingBrowser;
    this.openingBrowser=(async()=>{
      process.env.FLOW_MCP_BROWSER_EXECUTABLE ||= 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
      const [{FlowStore},{BrowserManager}]=await Promise.all(['store.js','browser-manager.js'].map(name=>import(pathToFileURL(path.join(this.repo,'dist',name)).href)));
      const store=new FlowStore(this.dataDir);const saved=await store.listAccounts();
      if(saved.accounts.length!==1||saved.accounts[0].id!=='motif')throw Error('Sambungkan satu akun Flow melalui Flow Login Bridge terlebih dahulu.');
      await store.setHeadlessAfterLogin('motif',false);
      this.browserManager ||= new BrowserManager(store);
      await this.browserManager.pageFor('motif');
    })().finally(()=>{this.openingBrowser=null;});return this.openingBrowser;
  }

  async begin({ reconnect = false } = {}) {
    if (this.completing) throw Error('Pemilihan akun masih berjalan di browser.');
    let status = await this.status();
    if (!status.discovered) throw Error(status.detail);
    if(this.pending)return {...status,connectionPending:true,instructions:['Di Brave biasa buka Flow Login Bridge dan klik Connect Flow.','Setelah Session sent, klik Sesi sudah terkirim di MOTIF.']};
    if(reconnect&&status.accountCount===1){
      await this.browserManager?.reset('motif');
      const {FlowStore}=await import(pathToFileURL(path.join(this.repo,'dist/store.js')).href);
      await new FlowStore(this.dataDir).markAccountNeedsReconnect('motif','User requested reconnection of the same account.');
      status=await this.status();
    }
    if (status.accountCount > 0) return status;
    const result = await this.call('flow_begin_account_connection', { accountId: 'motif' });
    if (result.status !== 'USER_ACTION_REQUIRED' || !result.connectionId) throw Error('MCP tidak meminta sambungan baru.');
    this.pending = { id: result.connectionId, expires: Date.now() + 300000 };
    return { ...status, connectionPending: true,
      instructions: ['Di Brave buka Flow Login Bridge, lalu klik Connect Flow.', 'Setelah tertulis Session sent, kembali ke MOTIF dan pilih Sesi sudah terkirim.'],
    };
  }

  async complete({ userConfirmedSessionSent } = {}) {
    if (userConfirmedSessionSent !== true) throw Error('Konfirmasi Session sent diperlukan.');
    if (this.completing) throw Error('Pemilihan akun masih berjalan di browser.');
    if (!this.pending || Date.now() > this.pending.expires) throw Error('Permintaan sambungan kedaluwarsa. Klik Sambungkan akun lagi.');
    this.completing = true;
    try {
      await this.call('flow_complete_account_connection', {
        connectionId: this.pending.id, userConfirmedSessionSent: true, accountId: 'motif',
        chooseGoogleAccount: true, waitForAccountSelectionSeconds: 300,
      }, 330000);
      this.pending = null;
      return await this.status();
    } finally { this.completing = false; }
  }

  async close() {
    const current = this.connection;
    this.connection = null; this.pending = null;
    if (current) await current.close().catch(() => {});
    await this.browserManager?.closeAll();
  }
}
