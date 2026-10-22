import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { FlowAgent, agentRoot, agentBinary, singleAccountEnvironment } from '../automation/flow-agent.mjs';

await fs.access(agentBinary);
if (!(await new FlowAgent().readiness()).verified) throw Error('Hash binary flow-agent tidak cocok dengan versi yang ditinjau.');
// Upstream can print account/session details. Do not persist or forward them.
const child = spawn(agentBinary, ['bridge'], { cwd: agentRoot, env: singleAccountEnvironment(), stdio: 'ignore', shell: false, windowsHide: true });
console.log('Flow-agent bridge lokal berjalan. Hubungkan satu Flow Bridge di Brave. Tidak ada generasi dari launcher ini.');
child.on('error', () => { console.error('Bridge tidak dapat dimulai.'); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
