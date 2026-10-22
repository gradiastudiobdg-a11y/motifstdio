import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { studioDir, runCommand, atomicJson, readJson, adapterError } from './common.mjs';
import { within } from '../render.mjs';
import { parseMediaMetadata } from './finish-video-core.mjs';
import { setTimeout as delay } from 'node:timers/promises';

export const FLOW_AGENT_COMMIT = '7d7abdd4da1a43954e49603dc2b9214229d891c6';
export const FLOW_AGENT_BINARY_SHA256 = 'c59d15e93df23e59078f0ebe91f9f2ade3ae460b0afecbc5b5be4f0c35c98000';
export const FLOW_GO_COMMIT = '70ec73861091267dd1f57184bcf809a922bea85b';
export const agentRoot = path.join(studioDir, '.studio/vendor/flow-agent/flow-agent');
export const agentBinary = path.join(agentRoot, 'bin/flow-motif-windows.exe');
export const singleAccountEnvironment = () => ({ ...process.env, FLOW_AUTO_RETRY: 'false', ACCOUNT_SCAN_LIMIT: '1', ACCOUNT_INDEX: '0', FLOW_RECAPTCHA: 'broker', FLOW_LOG_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null' });
export function resultJson(stdout) {
  const lines = stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    try { const value = JSON.parse(lines.slice(i).join('\n')); if (value && !Array.isArray(value) && typeof value === 'object') return value; } catch {}
  }
  throw adapterError('Flow-agent tidak memberi receipt JSON yang valid. Jangan kirim generasi ulang.', 'FLOW_OUTCOME_UNCERTAIN');
}
export class FlowAgent {
  constructor({ root = agentRoot, binary = agentBinary, execute = runCommand, quoteReader = root === agentRoot ? async duration => (await import('./flow-agent-inspect.mjs')).readFlowQuote({ root, duration }) : null } = {}) { this.root = root; this.binary = binary; this.execute = execute; this.quoteReader = quoteReader; this.busy = false; }
  async readiness() {
    const installed = await fs.stat(this.binary).then(s => s.isFile()).catch(() => false);
    const verified = installed && (this.binary !== agentBinary || createHash('sha256').update(await fs.readFile(this.binary)).digest('hex') === FLOW_AGENT_BINARY_SHA256);
    const sessions = (await fs.readdir(path.join(this.root, 'cookies')).catch(() => [])).filter(n => /^account_[a-zA-Z0-9_-]+\.json$/.test(n));
    return { ready: verified && sessions.length === 1, installed, verified, sessions: sessions.length, rotation: false, extensionPath: path.resolve(this.root, '../flow-extension'), detail: !verified ? 'Binary flow-agent belum tersedia atau hash berbeda dari versi yang ditinjau.' : sessions.length !== 1 ? 'Pasang Flow Bridge di satu profil Brave dan buka project Flow; tepat satu sesi diperlukan.' : 'Satu sesi tersimpan. Harga live dan koneksi browser diperiksa sebelum submit.' };
  }
  async generate({ jobDir, scene, quote, reserve, signal, ffmpegPath }) {
    if (this.busy) throw adapterError('Flow-agent sedang mengerjakan scene lain.', 'SETUP_REQUIRED');
    this.busy = true;
    try {
      const receiptPath = path.join(jobDir, `${scene.id}-flow-agent.json`);
      const prior = await readJson(receiptPath);
      if (prior?.state === 'complete' && prior.promptHash === scene.promptHash) return { path: within(jobDir, prior.path), receipt: prior };
      if (prior || scene.persistedIntentId) throw adapterError('Receipt Flow-agent sudah ada. Hasil perlu dipulihkan; submit ulang diblokir.', 'FLOW_OUTCOME_UNCERTAIN');
      const ready = await this.readiness();
      if (!ready.ready) throw adapterError(ready.detail, 'SETUP_REQUIRED');
      const validateQuote = value => { if (!value || !['flow-ui', 'flow-catalog'].includes(value.source) || value.model !== 'omni' || value.duration !== scene.duration || value.quality !== '720p' || value.aspectRatio !== '9:16' || value.outputs !== 1 || !Number.isInteger(value.credits) || value.credits < 0 || !Number.isFinite(Date.parse(value.observedAt)) || Date.now() - Date.parse(value.observedAt) > 60 * 60 * 1000 || Date.parse(value.observedAt) > Date.now()) throw adapterError('Periksa harga live Omni 720p, 9:16, satu output untuk durasi scene di Flow dahulu.', 'SETUP_REQUIRED'); };
      if (!this.quoteReader) validateQuote(quote);
      const sessions = (await fs.readdir(path.join(this.root, 'cookies'))).filter(n => /^account_[a-zA-Z0-9_-]+\.json$/.test(n));
      const cookies = path.join(this.root, 'cookies', sessions[0]);
      // Keep upstream diagnostics in memory: they may contain account identity.
      let doctor;
      for (let readAttempt = 0; readAttempt < 3; readAttempt++) {
        let diagnosis;
        try { diagnosis = await this.execute(this.binary, ['doctor', '--json', '--probe=true', '--timeout', '60s', '--cookies', cookies], { cwd: this.root, env: singleAccountEnvironment(), signal, timeoutMs: 70000 }); }
        catch { throw adapterError('Flow-agent belum siap. Periksa koneksi extension/login di Brave; belum ada generasi dikirim.', 'SETUP_REQUIRED'); }
        doctor = resultJson(diagnosis.stdout);
        const browserCheck = doctor.checks?.find(check => check.name === 'browser');
        const browserState = /no extension attached/i.test(browserCheck?.detail || '') ? 'not_attached' : /Flow extensions attached|close all but one|could not be assembled/i.test(browserCheck?.detail || '') ? 'conflicting_or_unavailable' : browserCheck?.ok ? 'connected' : 'unknown';
        await atomicJson(path.join(jobDir, 'flow-preflight.json'), { observedAt: new Date().toISOString(), ready: doctor.ready, browserState, checks: (doctor.checks || []).filter(check => ['cookies', 'browser', 'session', 'database'].includes(check.name)).map(check => ({ name: check.name, ok: check.ok === true })), readAttempt: readAttempt + 1, generationCalled: false });
        if (doctor.checks?.some(check => check.name === 'browser' && check.ok === true) || doctor.ready !== true) break;
        // Only retry a read-only diagnosis while the extension reconnects.
        if (readAttempt < 2) await delay(1600, undefined, { signal });
      }
      if (doctor.ready !== true || !doctor.checks?.some(check => check.name === 'browser' && check.ok === true)) throw adapterError('Flow-agent harus terhubung langsung ke extension. Hentikan listener bridge yang memakai port yang sama; generasi belum dikirim.', 'SETUP_REQUIRED');
      if (this.quoteReader) quote = await this.quoteReader(scene.duration);
      validateQuote(quote);
      const intentId = `flow-agent-${scene.id}-${scene.promptHash.slice(0, 24)}`;
      await atomicJson(receiptPath, { state: 'intent', promptHash: scene.promptHash, intentId });
      await reserve({ persistedIntentId: intentId, observedCreditCost: quote.credits });
      // From this point any failure is uncertain. Never invoke generate twice.
      let result;
      try {
        const response = await this.execute(this.binary, ['generate', '--prompt', scene.prompt, '--aspect', '9:16', '--duration', String(scene.duration), '--quality', '720p', '--count', '1', '--cookies', cookies], { cwd: this.root, env: singleAccountEnvironment(), signal, timeoutMs: 900000 });
        result = resultJson(response.stdout);
      } catch (error) {
        const diagnostics = String(error.stderr || '');
        // Keep only a closed set of error codes, never upstream cookies/URLs/identity.
        const reason = diagnostics.match(/PUBLIC_ERROR_[A-Z_]+/)?.[0] || (/empty|no media|nothing submitted/i.test(diagnostics) ? 'EMPTY_RESPONSE' : 'OUTCOME_UNCERTAIN');
        let upstream = {};
        try { const outcome = resultJson(error.stdout || ''); upstream = { upstreamJobId: outcome.job_id, mediaIds: Array.isArray(outcome.media_ids) ? outcome.media_ids : [], upstreamStatus: outcome.status, model: outcome.model, quality: outcome.quality }; } catch {}
        await atomicJson(receiptPath, { state: 'uncertain', promptHash: scene.promptHash, intentId, reason, ...upstream });
        throw adapterError(`Flow-agent sudah dipanggil (${reason}). Periksa hasil yang sama sebelum melanjutkan; tidak ada retry otomatis.`, 'FLOW_OUTCOME_UNCERTAIN');
      }
      const files = result.files;
      if (result.status !== 'ready' || !Array.isArray(files) || files.length !== 1 || result.model !== `abra_t2v_${scene.duration}s` || result.quality !== '720p' || !result.job_id || !Array.isArray(result.media_ids) || result.media_ids.length !== 1) throw adapterError('Hasil Flow-agent belum cocok dengan satu video Omni yang diminta. Jangan generate ulang.', 'FLOW_OUTCOME_UNCERTAIN');
      const source = within(this.root, path.resolve(this.root, files[0].path));
      const metadata = await this.execute(ffmpegPath, ['-hide_banner', '-i', source, '-t', '0', '-f', 'null', '-'], { signal });
      const video = parseMediaMetadata(metadata.stderr);
      if (!video.width || Math.abs(video.width / video.height - 9 / 16) > 0.015 || video.duration + 0.1 < scene.duration) throw adapterError('Klip Flow tidak memenuhi rasio atau durasi; pemulihan hasil diperlukan.', 'FLOW_OUTCOME_UNCERTAIN');
      const destination = path.join(jobDir, `${scene.id}-flow.mp4`);
      const targetDuration = scene.timelineDuration || scene.duration;
      if (targetDuration > video.duration + 0.1) {
        if (targetDuration / video.duration > 1.3) throw adapterError('Requested slow motion exceeds the supported 1.3× duration.', 'FLOW_OUTCOME_UNCERTAIN');
        await this.execute(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-an', '-vf', `setpts=${targetDuration / video.duration}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=duration=${targetDuration},setsar=1`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', destination], { signal, timeoutMs: 120000 });
      } else await fs.copyFile(source, destination);
      const receipt = { state: 'complete', promptHash: scene.promptHash, intentId, path: destination, upstreamJobId: result.job_id, mediaId: result.media_ids[0], model: result.model, quality: result.quality, width: video.width, height: video.height, duration: targetDuration, sourceDuration: video.duration, timeScale: targetDuration > video.duration + 0.1 ? targetDuration / video.duration : 1, sha256: createHash('sha256').update(await fs.readFile(destination)).digest('hex') };
      await atomicJson(receiptPath, receipt);
      return { path: destination, receipt };
    } finally { this.busy = false; }
  }
}
