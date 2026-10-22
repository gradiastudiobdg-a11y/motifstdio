import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { flowMcpEnvironment } from './flow-mcp-environment.mjs';

export class FlowQuotedMcp {
  constructor(studioDir,{prepareBrowser}={}) { this.studioDir = studioDir; this.prepareBrowser=prepareBrowser;this.repo = path.join(studioDir, '.studio/vendor/google-flow-mcp-reference'); }
  async connect() {
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async open() {
    if (this.client) return this.client;
    await this.prepareBrowser?.();
    const sdk = path.join(this.repo, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client');
    const [{ Client }, { StdioClientTransport }] = await Promise.all([import(pathToFileURL(path.join(sdk, 'index.js')).href), import(pathToFileURL(path.join(sdk, 'stdio.js')).href)]);
    this.transport = new StdioClientTransport({ command: process.execPath, args: [path.join(this.repo, 'dist/index.js')], cwd: this.repo, stderr: 'pipe', env: await flowMcpEnvironment(this.studioDir) });
    this.transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'motif-budgeted-production', version: '1.0.0' });
    await client.connect(this.transport);
    this.client = client;
    return client;
  }
  call(name, args = {}, timeout = 60000) {
    const run = () => this.invoke(name,args,timeout);
    const next = (this.queue || Promise.resolve()).then(run,run);
    this.queue = next.catch(() => {}); return next;
  }
  async invoke(name, args, timeout) {
    const client = await this.connect();
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout });
    const raw = result.content?.filter(x => x.type === 'text').map(x => x.text).join('\n') || '';
    if (result.isError) {
      const error = Error(raw.replace(/[\w.+-]+@[\w.-]+|https?:\/\/\S+/g, '[private]').slice(0, 1000));
      error.code = raw.match(/PUBLIC_ERROR_[A-Z_]+/)?.[0] || 'FLOW_MCP_ERROR'; throw error;
    }
    return JSON.parse(raw);
  }
  async close() { await this.client?.close(); this.client = null; }
}
