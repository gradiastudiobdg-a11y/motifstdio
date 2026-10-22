// Recover only the metadata of the profile the user just connected. Never
// invent verified access: flow_inspect_account must verify it through MCP.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { GoogleFlowMcp } from '../automation/google-flow-mcp.mjs';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(studioDir, '.studio');
const mcp = new GoogleFlowMcp({ studioDir, dataDir });
const { FlowStore } = await import(pathToFileURL(path.join(mcp.repo, 'dist/store.js')).href);
const store = new FlowStore(mcp.dataDir);
const accounts = await store.listAccounts();
if (accounts.accounts.length === 0) {
  await access(path.join(mcp.dataDir, 'profiles/motif/Default'));
  await access(path.join(mcp.dataDir, 'browser-sessions/motif.json'));
  await store.ensureAccount('motif', 'MOTIF', { browserMode: 'extension' });
}
try {
  const client = await mcp.connect();
  const response = await client.callTool({ name: 'flow_inspect_account', arguments: { accountId: 'motif' } }, undefined, { timeout: 60000 });
  const raw = response.content?.filter(x => x.type === 'text').map(x => x.text).join('\n') || '';
  if (response.isError) {
    console.log(JSON.stringify({ ok: false, code: raw.match(/Error \((\w+)\)/)?.[1] || 'unknown',
      projectControlMissing: /Could not find a Flow project|New project control/.test(raw),
      settingsMissing: /settings could not be opened|AUTO_APPROVE option/.test(raw),
      timedOut: /Timeout|timed out/.test(raw),
      operation: raw.match(/(?:locator|page)\.\w+: [^\n]+/)?.[0],
      control: raw.match(/waiting for ([^\n]+)/)?.[1]?.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+/g, '[private]'),
    }));
    process.exitCode = 1;
  } else {
    const value = JSON.parse(raw);
    console.log(JSON.stringify({ ok: true, workspaceAvailable: value.workspaceAvailable, signedIn: value.signedIn,
      pageKind: value.pageKind, models: value.models, ratios: value.aspectRatiosByMedia,
      controls: value.controlDiagnostics,
      settings: value.settingsDiagnostics,
      durations: value.visibleDurations, outputs: value.outputCountsByMedia,
      explicitCreditLines: (value.pageTextExcerpt || '').split('\n').filter(line => /\d+\s*(?:credits?|kredit)|(?:credits?|kredit)\s*:?\s*\d+/i.test(line)).map(line => line.replace(/[\w.+-]+@[\w.-]+/g, '[account]').replace(/https?:\/\/\S+/g, '[url]')),
    }, null, 2));
  }
} finally { await mcp.close(); }
