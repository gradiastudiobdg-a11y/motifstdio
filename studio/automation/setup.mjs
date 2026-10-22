import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand, findPython, automationDir, pythonDepsDir, studioDir } from './common.mjs';

export async function setup({ checkOnly = false } = {}) {
  if (!checkOnly) {
    await fs.mkdir(pythonDepsDir, { recursive: true });
    const pipTemp = path.join(studioDir, '.studio', 'pip-temp');
    const pipCache = path.join(studioDir, '.studio', 'pip-cache');
    await Promise.all([pipTemp, pipCache].map(directory => fs.mkdir(directory, { recursive: true })));
    const python = await findPython();
    // Wheels are extracted inside the workspace before pip moves them to its
    // target. This preserves workspace ACL inheritance on Windows; global Temp
    // extraction can preserve unrelated sandbox permissions after a move.
    const pipEnv = { ...process.env, TMPDIR: pipTemp, TEMP: pipTemp, TMP: pipTemp, PIP_CACHE_DIR: pipCache };
    await runCommand(python, ['-m', 'pip', 'install', '--target', pythonDepsDir, '--upgrade', '--index-url', 'https://pypi.org/simple', '--disable-pip-version-check', 'edge-tts==7.3.1'], { cwd: studioDir, env: pipEnv, timeoutMs: 180000 });
    // npm is a JavaScript program; invoke it through Node with shell:false on Windows.
    const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')].filter(Boolean);
    let npmPath;
    for (const candidate of npmCli) if ((await fs.stat(candidate).catch(() => null))?.isFile()) { npmPath = candidate; break; }
    if (!npmPath) throw new Error('npm CLI belum ditemukan. Jalankan npm install dari studio/automation, lalu ulangi setup --check.');
    await runCommand(process.execPath, [npmPath, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(studioDir, '.studio', 'npm-cache')], { cwd: automationDir, timeoutMs: 180000 });
  }
  const [{ getReadiness: codexReady }, { getReadiness: voiceReady }, finish] = await Promise.all([import('./codex-plan.mjs'), import('./voiceover.mjs'), import('./finish-video.mjs').catch(() => null)]);
  const [codex, voice, renderer] = await Promise.all([codexReady({ refresh: true }), voiceReady({ refresh: true }), finish?.getReadiness ? finish.getReadiness() : { ready: false, detail: 'Renderer belum tersedia.' }]);
  const result = { codex, voice, renderer, flow: { ready: false, detail: 'Login Flow dan pairing Brave dilakukan terpisah saat kamu siap; setup ini tidak melakukan generasi.' } };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) setup({ checkOnly: process.argv.includes('--check') }).catch(error => { console.error(error.message); process.exitCode = 1; });
