import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleFlowMcp } from '../automation/google-flow-mcp.mjs';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcp = new GoogleFlowMcp({ studioDir, dataDir: path.join(studioDir, '.studio') });
try {
  await mcp.connect();
  const help = await mcp.call('flow_help');
  const status = await mcp.status();
  console.log(JSON.stringify({ ...status, helpVerified: help.product === 'Google Flow MCP' }, null, 2));
  if (!status.discovered) process.exitCode = 1;
} finally { await mcp.close(); }
