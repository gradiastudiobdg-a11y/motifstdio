import path from 'node:path';
import { readFile } from 'node:fs/promises';
export async function flowMcpEnvironment(studioDir) {
  const env = { ...process.env, FLOW_PROFILE_DIR: path.join(studioDir, '.studio/google-flow-mcp/profiles/motif'),
    FLOW_CHROME_PATH: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    FLOW_HEADLESS: '0', FLOW_MAX_CREDITS_PER_CALL: '15', FLOW_OUTPUT_DIR: path.join(studioDir, '.studio/flow-downloads') };
  delete env.FLOW_CDP_URL;
  try {
    const session = JSON.parse(await readFile(path.join(studioDir, '.studio/google-flow-mcp/browser-sessions/motif.json'), 'utf8'));
    if (/^http:\/\/127\.0\.0\.1:\d+$/.test(session.endpoint)) {
      const response = await fetch(`${session.endpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) env.FLOW_CDP_URL = session.endpoint;
    }
  } catch { /* The MCP will open the same persistent Brave profile normally. */ }
  return env;
}
