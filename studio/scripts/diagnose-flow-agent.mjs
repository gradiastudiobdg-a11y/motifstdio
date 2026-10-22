import { promises as fs } from 'node:fs';
import path from 'node:path';
import { agentRoot, agentBinary, singleAccountEnvironment, resultJson } from '../automation/flow-agent.mjs';
import { runCommand } from '../automation/common.mjs';
const sessions = (await fs.readdir(path.join(agentRoot, 'cookies'))).filter(n => /^account_[a-zA-Z0-9_-]+\.json$/.test(n));
if (sessions.length !== 1) throw Error('Exactly one session is required.');
try {
  const response = await runCommand(agentBinary, ['doctor', '--json', '--probe=true', '--timeout', '60s', '--cookies', path.join(agentRoot, 'cookies', sessions[0])], { cwd: agentRoot, env: singleAccountEnvironment(), timeoutMs: 70000 });
  const report = resultJson(response.stdout);
  console.log(JSON.stringify({ ready: report.ready, browser: report.checks.find(c => c.name === 'browser')?.detail.replace(/https?:\S+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]'), checks: report.checks.map(c => ({ name: c.name, ok: c.ok, fatal: Boolean(c.fatal) })) }, null, 2));
} catch (error) {
  try { const report = resultJson(error.stdout); console.log(JSON.stringify({ ready: report.ready, checks: report.checks.map(c => ({ name: c.name, ok: c.ok, fatal: Boolean(c.fatal) })) }, null, 2)); }
  catch { console.error('Read-only diagnosis failed; no generation called.'); }
  process.exitCode = 1;
}
