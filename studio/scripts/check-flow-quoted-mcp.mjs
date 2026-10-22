import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlowQuotedMcp } from '../automation/flow-quoted-mcp.mjs';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcp = new FlowQuotedMcp(studioDir);
try {
  const status = await mcp.call('flow_status');
  const models = await mcp.call('flow_list_models', { mode: 'text', family: 'omni' });
  console.log(JSON.stringify({ status, models }, null, 2));
} catch (error) { console.log(JSON.stringify({ code: error.code, detail: error.message })); process.exitCode = 1; }
finally { await mcp.close(); }
