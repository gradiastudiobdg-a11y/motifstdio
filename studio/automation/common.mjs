import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const automationDir = path.dirname(fileURLToPath(import.meta.url));
export const studioDir = path.resolve(automationDir, '..');
export const pythonDepsDir = path.join(studioDir, '.studio', 'python-deps');
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function adapterError(message, code = 'ADAPTER_FAILED') { return Object.assign(new Error(message), { code }); }
export function redactDiagnostics(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|pairing[_-]?token|account(?:[_-]?(?:id|identity|email|login))?|user[_-]?(?:id|email))\s*["']?\s*[:=]\s*)(["'])[^"'\r\n]*\2/gi, '$1"[redacted]"')
    .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|pairing[_-]?token|account[_-]?(?:id|identity|email|login)|user[_-]?(?:id|email))\s*["']?\s*[:=]\s*["']?)[^\s,}"']+/gi, '$1[redacted]');
}
export function checkAbort(signal) { if (signal?.aborted) throw adapterError('Produksi dibatalkan.', 'ABORT_ERR'); }
export async function exists(filename) { try { return (await fs.stat(filename)).isFile(); } catch { return false; } }
export async function atomicJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, filename);
}
export async function readJson(filename) { try { return JSON.parse(await fs.readFile(filename, 'utf8')); } catch { return null; } }

/** No shell, no command interpolation, no silent retry of a remote operation. */
export function runCommand(executable, args = [], { cwd, env = process.env, input, signal, timeoutMs = 120000, maxOutput = 4 * 1024 * 1024 } = {}) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let child, stdout = '', stderr = '', settled = false, timer;
    const settle = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => { child?.kill(); settle(adapterError('Produksi dibatalkan.', 'ABORT_ERR')); };
    try { child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { settle(adapterError(`Tidak dapat menjalankan ${path.basename(executable)}: ${error.message}`, 'SETUP_REQUIRED')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { child.kill(); settle(adapterError(`${path.basename(executable)} melewati batas waktu. Periksa koneksi atau setup, lalu lanjutkan job.`, 'ADAPTER_TIMEOUT')); }, timeoutMs);
    timer.unref?.();
    child.stdout.on('data', data => { stdout = (stdout + data.toString('utf8')).slice(-maxOutput); });
    child.stderr.on('data', data => { stderr = (stderr + data.toString('utf8')).slice(-maxOutput); });
    child.once('error', error => settle(adapterError(`Tidak dapat menjalankan ${path.basename(executable)}: ${error.message}`, error.code === 'ENOENT' ? 'SETUP_REQUIRED' : 'ADAPTER_FAILED')));
    child.once('close', (code, terminationSignal) => {
      if (code !== 0) {
        const detail = redactDiagnostics(stderr || stdout || terminationSignal || `exit ${code}`).trim().slice(-3000);
        settle(Object.assign(adapterError(`${path.basename(executable)} gagal: ${detail}`), { exitCode: code, stdout, stderr }));
      } else settle(null, { stdout, stderr, code });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? undefined : input);
  });
}

export async function findOnPath(name) {
  const suffixes = process.platform === 'win32' && !path.extname(name) ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) for (const suffix of suffixes) {
    const filename = path.join(dir, `${name}${suffix}`); if (await exists(filename)) return filename;
  }
  return null;
}
export async function findPython() {
  for (const candidate of [process.env.MOTIF_PYTHON, path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'), await findOnPath('python3'), await findOnPath('python')].filter(Boolean)) if (await exists(candidate)) return candidate;
  throw adapterError('Python belum ditemukan. Set MOTIF_PYTHON ke executable Python, lalu jalankan setup automation.', 'SETUP_REQUIRED');
}
export function pythonEnvironment() {
  return { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONPATH: [pythonDepsDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
}
export async function findCodex() {
  const direct = process.env.MOTIF_CODEX || await findOnPath('codex');
  if (direct && await exists(direct) && !/\.(cmd|bat)$/i.test(direct)) return direct;
  const bin = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  const candidates = [];
  for (const entry of await fs.readdir(bin, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) {
    const filename = path.join(bin, entry.name, 'codex.exe');
    if (await exists(filename)) candidates.push({ filename, modified: (await fs.stat(filename)).mtimeMs });
  }
  candidates.sort((a, b) => b.modified - a.modified);
  if (candidates[0]) return candidates[0].filename;
  throw adapterError('Codex CLI belum ditemukan. Instal Codex atau set MOTIF_CODEX ke executable Codex.', 'SETUP_REQUIRED');
}
export async function codexEnvironment() {
  const env = { ...process.env };
  if (!env.CODEX_HOME) {
    const realCodexHome = path.join(os.homedir(), '.codex');
    if ((await fs.stat(realCodexHome).catch(() => null))?.isDirectory()) env.CODEX_HOME = realCodexHome;
  }
  return env;
}
export function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw adapterError('File suara bukan WAV yang valid.');
  let rate, channels, bits, data;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (id === 'fmt ' && size >= 16) { if (buffer.readUInt16LE(start) !== 1) throw adapterError('WAV harus berupa PCM.'); channels = buffer.readUInt16LE(start + 2); rate = buffer.readUInt32LE(start + 4); bits = buffer.readUInt16LE(start + 14); }
    if (id === 'data') data = buffer.subarray(start, Math.min(start + size, buffer.length));
    offset = start + size + size % 2;
  }
  if (!rate || !channels || bits !== 16 || !data?.length) throw adapterError('WAV PCM 16-bit tidak lengkap.');
  return { sampleRate: rate, channels, bits, data, duration: data.length / (rate * channels * bits / 8) };
}
export function encodeWav(data, sampleRate = 48000, channels = 1) {
  const out = Buffer.alloc(44 + data.length);
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); out.writeUInt16LE(channels, 22); out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * channels * 2, 28); out.writeUInt16LE(channels * 2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(data.length, 40); data.copy(out, 44); return out;
}
