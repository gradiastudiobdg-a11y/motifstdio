import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { validateProject, validId, within } from './render.mjs';
import { buildAnimationPrompt } from './public/planner.mjs';
import { FlowAgent } from './automation/flow-agent.mjs';
import { inspectFlowAgent } from './automation/flow-agent-inspect.mjs';
import { FlowMcpProduction } from './automation/flow-mcp-production.mjs';

const clean = (value, length = 1200) => String(value || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[account]').slice(0, length);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const activeStates = ['planning', 'voiceover', 'finishing'];
const bridgeActiveStates = ['ready', 'working', 'idle', 'preparing', 'generating', 'downloading'];
const defaultOptions = { allowPaid: false, maxGenerations: 12, creditBudget: 0, voice: 'id-ID-ArdiNeural' };
function normalizedBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A creative brief is required.');
  if (input.aspectRatio && input.aspectRatio !== '9:16') throw new Error('Autopilot produces 9:16 videos only.');
  if (typeof input.topic !== 'string' || !input.topic.trim()) throw new Error('A topic is required.');
  const duration = Number(input.duration ?? 30), fps = Number(input.fps ?? 30), clipDuration = Number(input.clipDuration ?? 6);
  if (!Number.isFinite(duration) || duration < 8 || duration > 180 || ![24, 30].includes(fps) || ![4, 6, 8, 10].includes(clipDuration)) throw new Error('Use 8–180 seconds, 24/30 fps and 4/6/8/10-second Flow clips.');
  return { topic: input.topic.trim().slice(0, 500), audience: clean(input.audience || 'International viewers who enjoy everyday home DIY', 180), tone: clean(input.tone || 'Calm, practical & warm', 120), style: ['kai', 'kinetic', 'cinematic', 'editorial', 'stickman'].includes(input.style) ? input.style : 'kai', duration, fps, clipDuration, aspectRatio: '9:16', ...(typeof input.accent === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent) ? { accent: input.accent } : {}) };
}
function normalizedOptions(input = {}, previous = defaultOptions) {
  const options = { ...previous };
  for (const key of ['allowPaid', 'maxGenerations', 'creditBudget', 'voice', 'flowProvider', 'flowQuote', 'flowProjectId']) if (input[key] !== undefined) options[key] = input[key];
  if (options.flowProjectId && !/^[a-f0-9-]{36}$/i.test(options.flowProjectId)) throw new Error('Invalid Flow project ID.');
  if (options.flowProvider && !['bridge', 'flow-agent', 'google-flow-mcp'].includes(options.flowProvider)) throw new Error('Unknown Flow provider.');
  if (options.flowQuote !== undefined && (!options.flowQuote || typeof options.flowQuote !== 'object' || Array.isArray(options.flowQuote))) throw new Error('Invalid Flow price observation.');
  if (options.flowQuote) options.flowQuote = Object.fromEntries(['source', 'model', 'quality', 'aspectRatio', 'outputs', 'duration', 'credits', 'observedAt'].map(key => [key, options.flowQuote[key]]));
  if (typeof options.allowPaid !== 'boolean' || !Number.isInteger(options.maxGenerations) || options.maxGenerations < 1 || options.maxGenerations > 60 || !Number.isFinite(options.creditBudget) || options.creditBudget < 0 || options.creditBudget > 100000) throw new Error('Set a generation limit (1–60), a numeric credit budget, and explicit paid-generation permission.');
  if (typeof options.voice !== 'string' || options.voice.length > 120) throw new Error('Invalid voice selection.');
  return options;
}
async function atomicJson(filename, value) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx');
    await handle.writeFile(JSON.stringify(value, null, 2));
    // A paid Flow click is allowed only after the receipt reaches disk.
    await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temporary, filename);
  } catch (error) { await handle?.close().catch(() => {}); await fs.unlink(temporary).catch(() => {}); throw error; }
}
export async function loadProductionAdapters() {
  const modules = await Promise.allSettled([import('./automation/codex-plan.mjs'), import('./automation/voiceover.mjs'), import('./automation/finish-video.mjs')]);
  const names = ['codex', 'voice', 'finish'];
  const loaded = Object.fromEntries(modules.map((result, index) => [names[index], result.status === 'fulfilled' ? result.value : null]));
  return {
    plan: loaded.codex?.planWithCodex,
    synthesizeVoiceover: loaded.voice?.synthesizeVoiceover,
    finishVideo: loaded.finish?.finishVideo,
    async readiness() {
      const entries = await Promise.all(names.map(async (name) => {
        const module = loaded[name];
        try { return [name, module ? (typeof module.getReadiness === 'function' ? await module.getReadiness() : { ready: true, detail: 'Adapter installed.' }) : { ready: false, detail: `${name} adapter is not installed.` }]; }
        catch (error) { return [name, { ready: false, detail: clean(error.message) }]; }
      }));
      return Object.fromEntries(entries);
    },
  };
}

export class Autopilot {
  constructor({ dataDir, adapters, ffmpegPath, getAsset, importAssetFile, saveProject, flowMcp }) {
    this.dataDir = path.resolve(dataDir); this.root = path.join(this.dataDir, 'jobs');
    this.configPath = path.join(this.dataDir, 'autopilot-config.json');
    this.adapters = adapters; this.ffmpegPath = ffmpegPath; this.getAsset = getAsset; this.importAssetFile = importAssetFile; this.saveProject = saveProject;
    this.jobs = new Map(); this.running = new Map(); this.completions = new Map(); this.pending = new Set(); this.writes = new Map(); this.config = {}; this.configWrite = Promise.resolve(); this.closed = false; this.readinessCache = null; this.readinessInFlight = null;
    this.flowAgent = new FlowAgent();
    this.flowMcp = flowMcp || new FlowMcpProduction();
  }
  dir(job) { return within(this.root, path.join(this.root, job.id)); }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    try { this.config = JSON.parse(await fs.readFile(this.configPath, 'utf8')); } catch { this.config = {}; }
    for (const id of await fs.readdir(this.root)) {
      if (!validId(id)) continue;
      try {
        const job = JSON.parse(await fs.readFile(path.join(this.root, id, 'job.json'), 'utf8'));
        if (job.id !== id) continue;
        if (activeStates.includes(job.status) || (job.options.flowProvider==='google-flow-mcp'&&['queued','waiting_flow'].includes(job.status))) { job.resumeStage = job.status; job.status = job.stage = 'waiting_setup'; job.waitingReason = 'interrupted'; job.message = 'Proses sebelumnya terputus. Checkpoint tersimpan; generasi tidak akan dikirim ulang.'; }
        this.jobs.set(id, job);
      } catch { /* Ignore incomplete or unrelated storage entries. */ }
    }
    this.adapters ||= await loadProductionAdapters();
    return this;
  }
  get(id) { return validId(id) ? this.jobs.get(id) : undefined; }
  describe(job) {
    return { ...job, outputPath: undefined, url: job.status === 'complete' ? `/api/autopilot/jobs/${job.id}/download` : null, remainingGenerations: Math.max(0, job.options.maxGenerations - job.generations), remainingCredits: Math.max(0, job.options.creditBudget - job.spentCredits) };
  }
  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((job) => this.describe(job)); }
  async persist(job) {
    job.updatedAt = new Date().toISOString();
    const snapshot = JSON.parse(JSON.stringify(job));
    const previous = this.writes.get(job.id) || Promise.resolve();
    const write = previous.catch(() => {}).then(() => atomicJson(path.join(this.dir(job), 'job.json'), snapshot));
    this.writes.set(job.id, write); await write;
  }
  async transition(job, status, message, reason) {
    if (job.status === 'cancelled' && status !== 'cancelled') return;
    job.status = job.stage = status; job.message = clean(message); job.waitingReason = reason || null;
    job.events ||= []; job.events.push({ at: new Date().toISOString(), stage: status, message: job.message }); job.events = job.events.slice(-100);
    await this.persist(job);
  }
  async saveConfig() {
    const snapshot = JSON.parse(JSON.stringify(this.config));
    this.configWrite = this.configWrite.catch(() => {}).then(() => atomicJson(this.configPath, snapshot));
    await this.configWrite;
  }
  authorized(header) {
    const expected = this.config.bridgeToken;
    if (!expected || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    const supplied = header.slice(7);
    return /^[a-f0-9]{64}$/.test(supplied) && supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  }
  async pair() {
    if (!this.config.bridgeToken) { this.config.bridgeToken = randomBytes(32).toString('hex'); await this.saveConfig(); }
    return { token: this.config.bridgeToken };
  }
  async probeReadiness() {
    if (this.readinessCache && Date.now() - this.readinessCache.at < 30000) return this.readinessCache.value;
    if (!this.readinessInFlight) this.readinessInFlight = (async () => {
      let value;
      try { value = await this.adapters.readiness?.() || { codex: { ready: Boolean(this.adapters.plan) }, voice: { ready: Boolean(this.adapters.synthesizeVoiceover) }, finish: { ready: Boolean(this.adapters.finishVideo) } }; }
      catch (error) { value = { codex: { ready: false, detail: clean(error.message) } }; }
      this.readinessCache = { at: Date.now(), value }; return value;
    })().finally(() => { this.readinessInFlight = null; });
    return this.readinessInFlight;
  }
  async setup() {
    const readiness = await this.probeReadiness();
    const heartbeat = this.config.heartbeat || {};
    const connected = Boolean(heartbeat.at && Date.now() - Date.parse(heartbeat.at) < 90000);
    const entry = (value) => ({ ready: value === true || value?.ready === true || value?.available === true, detail: clean(value?.detail || value?.message) });
    const codex = entry(readiness.codex), voice = entry(readiness.voice || readiness.voiceover), finish = entry(readiness.finish);
    if (!this.ffmpegPath) { finish.ready = false; finish.detail = 'FFmpeg belum tersedia. Pasang binary lokal sebelum finishing otomatis.'; }
    return { aspectRatio: '9:16', readiness: { codex, voiceover: voice, finish, ffmpeg: Boolean(this.ffmpegPath) }, codex, voice, finish, ffmpeg: { ready: Boolean(this.ffmpegPath) }, bridge: { paired: Boolean(this.config.bridgeToken), tokenHint: this.config.bridgeToken ? `••••${this.config.bridgeToken.slice(-4)}` : null, connected, state: heartbeat.state || 'not_connected', detail: heartbeat.detail || '', version: heartbeat.version || '', lastSeen: heartbeat.at || null, enabled: heartbeat.enabled === true, diagnostics: heartbeat.diagnostics || '' } };
  }
  async create({ brief, options }) {
    if (options?.flowProvider==='google-flow-mcp') brief={...brief,clipDuration:10,fps:30,aspectRatio:brief?.aspectRatio||'9:16'};
    const now = new Date().toISOString();
    const job = { id: randomUUID(), createdAt: now, updatedAt: now, status: 'planning', stage: 'planning', brief: normalizedBrief(brief), options: normalizedOptions(options), generations: 0, spentCredits: 0, scenes: [], project: null, message: 'Preparing a real Codex production plan.', events: [] };
    await fs.mkdir(this.dir(job), { recursive: true }); this.jobs.set(job.id, job); await this.persist(job); this.start(job); return job;
  }
  start(job) {
    if (this.closed || ['complete', 'cancelled'].includes(job.status)) return;
    if (this.running.has(job.id)) { this.pending.add(job.id); return; }
    if (this.running.size) { this.pending.add(job.id); void this.transition(job,'queued','Menunggu produksi sebelumnya. Satu akun Flow dipakai bergantian.'); return; }
    const controller = new AbortController();
    this.running.set(job.id, controller);
    const completion = this.run(job, controller.signal).catch(async (error) => {
      if(error.code==='FLOW_SUBMISSION_UNCERTAIN'){job.submissionUncertain=true;await this.persist(job);}
      if (job.status === 'cancelled' || controller.signal.aborted) return;
      job.error = clean(error.message); job.resumeStage = job.status;
      const code = error.code || error.kind;
      const state = ['SETUP_REQUIRED', 'CONFIG_REQUIRED', 'AUTH_REQUIRED'].includes(code) ? 'waiting_setup' : code === 'LOGIN_REQUIRED' ? 'waiting_login' : 'error';
      await this.transition(job, state, job.error, code==='FLOW_SUBMISSION_UNCERTAIN'?'submission_uncertain':state === 'waiting_setup' ? 'adapter' : null);
    }).finally(() => { this.running.delete(job.id); if (this.completions.get(job.id) === completion) this.completions.delete(job.id); const next=this.pending.values().next().value; if(next){this.pending.delete(next);const queued=this.get(next);if(queued)this.start(queued);} });
    this.completions.set(job.id, completion);
  }
  async savePlan(job) {
    await atomicJson(path.join(this.dir(job), 'project.json'), job.project);
    await this.saveProject?.(job.project);
    await this.persist(job);
  }
  async run(job, signal) {
    const kai = job.brief.style === 'kai';
    const check = () => { if (signal.aborted || job.status === 'cancelled') throw Object.assign(new Error('Cancelled.'), { name: 'AbortError' }); };
    const setup = await this.setup(); check();
    const required = ['finish', 'ffmpeg', ...(!job.project ? ['codex'] : []), ...(!kai && !job.voiceoverAssetId ? ['voice'] : [])];
    const missing = required.filter((name) => !setup[name]?.ready);
    if (missing.length) { job.resumeStage = job.project ? 'waiting_flow' : 'planning'; await this.transition(job, 'waiting_setup', `Setup required: ${missing.join(', ')}.`, 'adapter'); return; }
    if(job.options.flowProvider==='google-flow-mcp'&&[...this.jobs.values()].some(other=>other.id!==job.id&&(other.waitingReason==='submission_uncertain'||other.submissionUncertain)&&other.scenes.some(s=>s.persistedIntentId&&!s.assetId))){
      await this.transition(job,'waiting_setup','Pulihkan hasil generasi yang belum pasti pada job sebelumnya sebelum membuat klip baru.','submission_uncertain');return;
    }
    if (job.options.flowProvider==='google-flow-mcp' && job.scenes.every(s=>!s.assetId) && !job.scenes.some(s=>s.persistedIntentId)) {
      const live=await this.flowMcp.status();check();
      if(!live.connected){await this.transition(job,'waiting_login',live.detail,'login');return;}
    }
    if (!job.project) {
      await this.transition(job, 'planning', 'Codex is writing the script, shots and Flow prompts.');
      const result = await this.adapters.plan({ brief: job.brief, jobDir: this.dir(job), signal }); check();
      const { project, duration } = validateProject(result?.project || result);
      if (project.brief?.aspectRatio !== '9:16' || Math.abs(duration - job.brief.duration) > 0.05) throw new Error('Codex must return a 9:16 project whose scene durations match the brief.');
      if (project.brief.style !== job.brief.style) throw new Error('Planner changed the approved production style.');
      project.id = job.id; project.captions = !kai; project.assets = []; project.voiceoverAssetId = null; project.musicAssetId = null;
      if (kai) project.musicVolume = 0;
      for (const [index, scene] of project.scenes.entries()) { scene.id = `scene-${String(index + 1).padStart(2, '0')}`; scene.assetId = null; scene.trimStart = 0; if ((!kai && !scene.voiceover?.trim()) || (kai && scene.voiceover !== '') || !scene.visual?.trim() || !scene.motion?.trim()) throw new Error('Scenes require matching narration mode, visual direction and motion direction.'); }
      job.project = project;
      job.scenes = project.scenes.map((scene, index) => {
        const direction=buildAnimationPrompt(project,scene).split('\n').filter(line=>!line.startsWith('REFERENCE LOCK:')).join('\n');
        const prompt = `MOTIF shot ${job.id.slice(0, 8)}-${String(index + 1).padStart(2, '0')}. Create one vertical 9:16 video clip, ${job.brief.clipDuration} seconds.\n${direction}\nVisual action only. Keep the frame free of lettering and keep the subject's mouth at rest. No generated text, subtitles, speech, lip sync or music. End in a stable composition.`;
        return { id: scene.id, label: scene.label || scene.headline, duration: job.brief.clipDuration, timelineDuration: scene.duration, prompt, promptHash: hash(prompt), status: 'pending', assetId: null };
      });
      await this.savePlan(job);
    }
    check();
    if (job.scenes.some((scene) => !scene.assetId)) {
      if (!job.options.allowPaid || job.options.creditBudget <= 0 || job.options.maxGenerations < job.generations + job.scenes.filter((scene) => !scene.assetId && !scene.persistedIntentId).length) {
        job.resumeStage = 'waiting_flow'; await this.transition(job, 'waiting_setup', 'Enable the Flow worker and explicitly approve a sufficient generation limit and credit budget.', 'budget'); return;
      }
      job.resumeStage = 'waiting_flow';
      if (job.options.flowProvider === 'google-flow-mcp') {
        await this.transition(job, 'waiting_flow', 'Google Flow MCP menyiapkan footage dengan harga terverifikasi.');
        this.flowMcp.busy=true;
        try {
          if(!job.flowProjectId){job.flowProjectId=await this.flowMcp.ensureProject(job);await this.persist(job);}
          for (const scene of job.scenes.filter(item => !item.assetId)) {
            check();
            await this.transition(job,'waiting_flow',`Flow: klip ${job.scenes.indexOf(scene)+1} dari ${job.scenes.length}. ${job.generations}/${job.options.maxGenerations} generasi; ${job.spentCredits}/${job.options.creditBudget} kredit dicadangkan.`);
            const result = await this.flowMcp.generate({ jobDir: this.dir(job), scene, projectId: job.flowProjectId || job.options.flowProjectId, signal, ffmpegPath: this.ffmpegPath, availableCredits:job.options.creditBudget-job.spentCredits,remainingClips:job.scenes.filter(s=>!s.assetId&&!s.persistedIntentId).length, reserve: reservation => this.event({ jobId: job.id, sceneId: scene.id, status: 'submitted', ...reservation }, { provider: 'google-flow-mcp' }) });
            check();
            const asset = await this.importAssetFile(result.path, { type: 'video/mp4', name: `${scene.id}-flow.mp4`, source: { provider: 'google-flow', transport: 'google-flow-mcp', jobId: job.id, sceneId: scene.id, promptHash: scene.promptHash, persistedIntentId: scene.persistedIntentId, mediaId: result.receipt.mediaId, sha256: result.receipt.sha256 } });
            await this.acceptResult({ jobId: job.id, sceneId: scene.id }, asset, { continueRun: false });
          }
        } finally { this.flowMcp.busy=false;this.flowMcp.statusCache=null; }
        return this.run(job, signal);
      }
      if (job.options.flowProvider === 'flow-agent') {
        await this.transition(job, 'waiting_flow', 'Flow-agent menyiapkan footage dari satu akun.');
        for (const scene of job.scenes.filter(item => !item.assetId)) {
          check();
          const result = await this.flowAgent.generate({ jobDir: this.dir(job), scene, quote: job.options.flowQuote, signal, ffmpegPath: this.ffmpegPath, reserve: reservation => this.event({ jobId: job.id, sceneId: scene.id, status: 'submitted', ...reservation }, { provider: 'flow-agent' }) });
          check();
          const asset = await this.importAssetFile(result.path, { type: 'video/mp4', name: `${scene.id}-flow.mp4`, source: { provider: 'google-flow', transport: 'flow-agent', jobId: job.id, sceneId: scene.id, promptHash: scene.promptHash, persistedIntentId: scene.persistedIntentId, upstreamJobId: result.receipt.upstreamJobId, mediaId: result.receipt.mediaId, sha256: result.receipt.sha256 } });
          await this.acceptResult({ jobId: job.id, sceneId: scene.id }, asset, { continueRun: false });
        }
        return this.run(job, signal);
      }
      if (!setup.bridge.paired) await this.transition(job, 'waiting_setup', 'Pair the Brave Flow worker from the setup panel.', 'bridge');
      else if (['waiting_login', 'login_required'].includes(setup.bridge.state)) await this.transition(job, 'waiting_login', 'Sign in to the single Flow account in Brave, then enable the worker.');
      else await this.transition(job, 'waiting_flow', 'Waiting for the paired Brave worker to generate and return every Flow clip.');
      return;
    }
    for (const scene of job.scenes) {
      const asset = await this.getAsset(scene.assetId);
      if (!asset || asset.source?.provider !== 'google-flow' || asset.source.promptHash !== scene.promptHash || asset.source.jobId !== job.id || asset.source.sceneId !== scene.id) throw new Error('Every scene must have verified Flow bridge provenance before finishing.');
      await fs.stat(asset.path);
    }
    check();
    if (!kai && !job.voiceoverAssetId) {
      await this.transition(job, 'voiceover', 'Synthesizing the actual narration track.');
      const voice = await this.adapters.synthesizeVoiceover({ project: job.project, jobDir: this.dir(job), signal, ffmpegPath: this.ffmpegPath, voice: job.options.voice }); check();
      const voicePath = within(this.dir(job), voice.path);
      if (!(await fs.stat(voicePath)).isFile() || (await fs.stat(voicePath)).size < 45 || !String(voice.type).startsWith('audio/')) throw new Error('Narration synthesis did not produce a usable audio file.');
      const asset = await this.importAssetFile(voicePath, { type: voice.type, name: voice.name || path.basename(voicePath), source: { provider: 'local-tts', generatedAt: new Date().toISOString() } });
      job.voiceoverAssetId = asset.id; job.project.voiceoverAssetId = asset.id; job.project.assets.push(asset); if (voice.timings) job.project.voiceoverTimings = voice.timings;
      await this.savePlan(job);
    }
    if (!kai) { const voiceAsset = await this.getAsset(job.voiceoverAssetId); if (!voiceAsset || !(await fs.stat(voiceAsset.path)).isFile()) throw new Error('The actual voiceover asset is missing.'); }
    check();
    await this.transition(job, 'finishing', kai ? 'Finishing Kai: footage Flow, teks Inggris singkat, room tone dan sound design bahan.' : 'Combining Flow footage, motion graphics, actual narration, music and burned captions.');
    const finished = await this.adapters.finishVideo({ project: job.project, jobDir: this.dir(job), signal, ffmpegPath: this.ffmpegPath, getAsset: this.getAsset }); check();
    if (kai ? finished.hasSoundDesign !== true || finished.hasVoiceover !== false || finished.captionsBurned !== false : finished.hasVoiceover !== true || finished.hasMusic !== true || finished.captionsBurned !== true) throw new Error('The finishing adapter must confirm the actual audio and overlay mode for this brand.');
    const source = within(this.dir(job), finished.path), final = within(this.dir(job), path.join(this.dir(job), 'final.mp4'));
    if (!(await fs.stat(source)).isFile() || (await fs.stat(source)).size < 512) throw new Error('The final MP4 is missing or empty.');
    const file = await fs.open(source, 'r'); const header = Buffer.alloc(12); try { await file.read(header, 0, 12, 0); } finally { await file.close(); }
    if (header.subarray(4, 8).toString() !== 'ftyp') throw new Error('The finishing adapter did not produce an MP4 file.');
    if (source !== final) await fs.copyFile(source, final);
    job.outputPath = 'final.mp4'; job.artifacts = { flowScenes: job.scenes.length, actualVoiceover: !kai, actualMusic: finished.hasMusic === true, soundDesign: finished.hasSoundDesign === true, captionsBurned: !kai }; job.error = null;
    await this.savePlan(job); await this.transition(job, 'complete', 'The 9:16 MP4 is ready to upload.');
  }
  async resume(job, input = {}) {
    if (['complete', 'cancelled'].includes(job.status)) throw new Error('This job cannot be resumed.');
    if (this.running.has(job.id)) {
      if (['error', 'waiting_setup', 'waiting_login'].includes(job.status)) await this.completions.get(job.id);
      else return job;
    }
    if (['complete', 'cancelled'].includes(job.status)) throw new Error('This job cannot be resumed.');
    if (input.options) {
      const next = normalizedOptions(input.options, job.options);
      if ((next.flowProvider || 'bridge') !== (job.options.flowProvider || 'bridge') && job.scenes.some(scene => scene.persistedIntentId && !scene.assetId)) throw new Error('Recover the existing Flow submission before changing transport.');
      job.options = next;
    }
    this.readinessCache = null;
    job.error = null;
    await this.transition(job, job.project ? 'waiting_flow' : 'planning', 'Resuming with existing Flow receipts and assets preserved.');
    this.start(job); return job;
  }
  async revise(job, input = {}) {
    // Paused state can be visible while its final durable checkpoint is still
    // finishing. Wait for that worker instead of rejecting a valid UI revision.
    if (['error', 'waiting_setup', 'waiting_login'].includes(job.status) && this.running.has(job.id)) await this.completions.get(job.id);
    if (!['error', 'waiting_setup', 'waiting_login'].includes(job.status) || this.running.has(job.id)) throw new Error('Revisi tersedia setelah job berhenti dan perlu perhatian.');
    if (!job.project || !job.scenes.length || job.scenes.some((scene) => !scene.assetId)) throw new Error('Revisi tanpa generasi ulang tersedia setelah semua klip Flow diterima.');
    if (!Array.isArray(input.scenes) || !input.scenes.length || input.scenes.length > job.scenes.length) throw new Error('Kirim daftar scene yang ingin direvisi.');
    const edited = JSON.parse(JSON.stringify(job.project)), seen = new Set(); let narrationChanged = false;
    for (const change of input.scenes) {
      if (!change || typeof change !== 'object' || Object.keys(change).some((key) => !['id', 'headline', 'voiceover'].includes(key)) || seen.has(change.id)) throw new Error('Revisi hanya boleh mengubah headline dan narasi; ID, durasi, urutan, prompt, dan klip tetap terkunci.');
      const scene = edited.scenes.find((item) => item.id === change.id); if (!scene) throw new Error('ID scene revisi tidak ditemukan.'); seen.add(change.id);
      for (const field of ['headline', 'voiceover']) if (change[field] !== undefined) {
        const limit = field === 'headline' ? 140 : 12000;
        const kai = job.brief.style === 'kai';
        if (typeof change[field] !== 'string' || (!kai && !change[field].trim()) || (kai && field === 'voiceover' && change[field] !== '') || change[field].length > limit) throw new Error(`${field === 'headline' ? 'Headline' : 'Narasi'} tidak sesuai format brand atau melebihi ${limit} karakter.`);
        if (field === 'voiceover' && change[field].trim() !== scene.voiceover) narrationChanged = true;
        scene[field] = change[field].trim();
      }
    }
    const oldVoice = narrationChanged ? job.voiceoverAssetId || edited.voiceoverAssetId : null;
    if (narrationChanged) {
      edited.voiceoverAssetId = null; edited.assets = (edited.assets || []).filter((asset) => asset.id !== oldVoice);
      delete edited.voiceoverTimings; for (const scene of edited.scenes) delete scene.wordTimings;
    }
    validateProject(edited);
    if (narrationChanged) {
      if (oldVoice) { job.artifactHistory ||= []; job.artifactHistory.push({ type: 'voiceover', assetId: oldVoice, at: new Date().toISOString(), reason: 'script_revision' }); }
      delete job.voiceoverAssetId;
    }
    job.project = edited; job.error = null; job.resumeStage = job.brief.style === 'kai' ? 'finishing' : narrationChanged || !job.voiceoverAssetId ? 'voiceover' : 'finishing';
    job.outputPath = null; job.artifacts = null;
    await this.savePlan(job);
    await this.transition(job, 'waiting_setup', 'Revisi tersimpan. Semua klip Flow tetap dipakai. Klik Lanjutkan untuk membuat narasi dan finishing tanpa generasi Flow baru.', 'revision');
    return job;
  }
  async retake(job, input = {}) {
    if(this.running.has(job.id)||!['complete','error','waiting_setup'].includes(job.status)||job.brief.style!=='kai'||job.options.flowProvider!=='google-flow-mcp')throw new Error('Retake requires a stopped Kai MCP job.');
    if(job.scenes.some(s=>!s.assetId))throw new Error('Recover every existing submission before requesting a retake.');
    if(!job.options.allowPaid||job.generations>=job.options.maxGenerations||job.spentCredits+15>job.options.creditBudget)throw new Error('No generation or credit allowance remains for a retake.');
    const index=job.scenes.findIndex(s=>s.id===input.sceneId);if(index<0)throw new Error('Unknown retake scene.');
    for(const key of ['visual','motion','reason'])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>4000)throw new Error('Retake needs bounded visual, motion and reason fields.');
    const oldScene=structuredClone(job.scenes[index]),oldEditorial=structuredClone(job.project.scenes[index]);
    const sceneId=`scene-${String(job.generations+1).padStart(2,'0')}`;
    if(job.scenes.some(s=>s.id===sceneId))throw new Error('Retake identifier already exists.');
    const editorial={...oldEditorial,id:sceneId,assetId:null,trimStart:0,visual:input.visual.trim(),motion:input.motion.trim()};
    const prompt=`MOTIF shot ${job.id.slice(0,8)}-${sceneId}. One vertical 9:16 camera video, 10 seconds.\n${buildAnimationPrompt(job.project,editorial)}\nOnly unobstructed realistic camera footage of this home craft. No app interface, player controls, progress bars, social media screen, logos, captions, numbers, lettering, borders, watermark, speech or music. No graphics baked into the picture.`;
    const replacement={id:sceneId,label:oldScene.label,duration:10,timelineDuration:editorial.duration,prompt,promptHash:hash(prompt),status:'pending',assetId:null};
    job.retakeHistory||=[];job.retakeHistory.push({at:new Date().toISOString(),reason:input.reason.trim(),scene:oldScene,editorial:oldEditorial,replacedBy:sceneId,previousOutput:job.outputPath,generationsBefore:job.generations,creditsBefore:job.spentCredits});
    // Archive the validated previous output; all original media/receipts remain.
    if(job.outputPath){await fs.copyFile(path.join(this.dir(job),job.outputPath),path.join(this.dir(job),`before-${sceneId}-final.mp4`));}
    job.project.scenes[index]=editorial;job.scenes[index]=replacement;job.outputPath=null;job.artifacts=null;job.error=null;job.submissionUncertain=false;
    await this.savePlan(job);await this.transition(job,'waiting_setup','Retake tersimpan dengan batas kredit dan jumlah generasi sebelumnya tetap dihitung.','retake');
    return job;
  }
  async refinish(job,input={}) {
    if(this.running.has(job.id)||job.status!=='complete'||job.brief.style!=='kai'||job.scenes.some(s=>!s.assetId))throw new Error('Refinishing requires a completed Kai job with all original footage.');
    if(Object.keys(input).some(k=>!['kaiLayout','soundCues','publishing'].includes(k)))throw new Error('Refinishing can change only type layout, sound cues and publishing copy.');
    const edited=structuredClone(job.project);
    if(input.kaiLayout){const layout=input.kaiLayout;if(typeof layout!=='object'||Object.keys(layout).some(k=>!['openingFontSize','openingHookY','revealFontSize','revealHookY','showProcessNotes'].includes(k)))throw new Error('Invalid Kai layout.');for(const [key,value] of Object.entries(layout)){if(key==='showProcessNotes'){if(typeof value!=='boolean')throw new Error('Invalid process note visibility.');continue;}if(!Number.isFinite(value)||(/FontSize$/.test(key)?value<64||value>108:value<220||value>300))throw new Error('Kai type layout is outside the safe range.');}edited.kaiLayout=layout;}
    if(input.soundCues!==undefined){if(!Array.isArray(input.soundCues)||input.soundCues.length>200||input.soundCues.some(c=>!Number.isFinite(c.time)||c.time<0||c.time>=job.brief.duration||!['paper','cut','pencil','tap'].includes(c.kind)))throw new Error('Invalid sound cues.');edited.soundCues=input.soundCues;}
    if(input.publishing){const p=input.publishing;if(!Array.isArray(p.titles)||p.titles.some(t=>typeof t!=='string'||t.length>200)||typeof p.description!=='string'||p.description.length>5000||!Array.isArray(p.hashtags)||p.hashtags.some(t=>typeof t!=='string'||t.length>80)||typeof p.thumbnailPrompt!=='string'||p.thumbnailPrompt.length>5000)throw new Error('Invalid publishing copy.');edited.publishing=p;}
    validateProject(edited);
    await fs.copyFile(path.join(this.dir(job),'final.mp4'),path.join(this.dir(job),`before-refinish-${randomUUID()}.mp4`));
    job.project=edited;job.outputPath=null;job.artifacts=null;job.error=null;job.resumeStage='finishing';await this.savePlan(job);
    await this.transition(job,'waiting_setup','Teks dan sound design direvisi. Footage, kredit dan jumlah generasi tetap; lanjutkan finishing tanpa Flow.','finishing_revision');return job;
  }
  async resolveEmptyFlowAgent(job, input = {}) {
    if (this.running.has(job.id) || !['error', 'waiting_setup'].includes(job.status) || job.options.flowProvider !== 'flow-agent' || input.userConfirmedNoOutput !== true) throw new Error('Confirm no video or pending process before recovering a stopped Flow-agent job.');
    const scene = job.scenes.find(s => s.id === input.sceneId);
    if (!scene?.persistedIntentId || scene.assetId) throw new Error('No unresolved Flow-agent scene exists.');
    const verification = JSON.parse(await fs.readFile(path.join(this.dir(job), 'flow-live-verification.json'), 'utf8'));
    if (verification.jobId !== job.id || !Number.isInteger(verification.observedBalanceBefore)) throw new Error('The original live balance evidence is missing.');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path.join(this.flowAgent.root, 'data/flow.db'), { readOnly: true });
    let rows;
    try { rows = db.prepare('SELECT job_id,status,media_ids,credits_spent FROM generations WHERE prompt = ?').all(scene.prompt); } finally { db.close(); }
    if (rows.length !== 1 || rows[0].status !== 'empty' || JSON.parse(rows[0].media_ids || '[]').length || (rows[0].credits_spent !== null && rows[0].credits_spent !== 0)) throw new Error('Upstream does not prove one empty, uncharged attempt. Recovery stopped.');
    const live = await inspectFlowAgent({ root: this.flowAgent.root, marker: scene.prompt.split('\n')[0] });
    if (live.balance !== verification.observedBalanceBefore || live.matchingPromptNodes !== 0) throw new Error('The balance or matching assets changed. Recover the existing output instead of resubmitting.');
    const evidence = { sceneId: scene.id, promptHash: scene.promptHash, intentId: scene.persistedIntentId, upstreamJobId: rows[0].job_id, status: 'confirmed_empty', observedBalanceBefore: verification.observedBalanceBefore, observedBalanceAfter: live.balance, userConfirmedNoOutput: true, observedAt: live.observedAt, releasedCredits: scene.observedCreditCost, generationAttemptStillCounted: true };
    await atomicJson(path.join(this.dir(job), `${scene.id}-failed-attempt.json`), evidence);
    await fs.rename(path.join(this.dir(job), `${scene.id}-flow-agent.json`), path.join(this.dir(job), `${scene.id}-flow-agent-failed.json`));
    job.failedFlowAttempts ||= []; job.failedFlowAttempts.push(evidence);
    job.spentCredits = Math.max(0, job.spentCredits - scene.observedCreditCost);
    scene.persistedIntentId = null; scene.observedCreditCost = null; scene.status = 'confirmed_empty';
    await this.transition(job, 'waiting_setup', 'The empty attempt was confirmed with unchanged balance and no output. Its generation attempt remains counted; the uncharged credit reservation was released.', 'recovery');
    return job;
  }
  async reframeUnstartedFlowAgent(job, input = {}) {
    if (this.running.has(job.id) || job.status !== 'waiting_setup' || !job.failedFlowAttempts?.some(attempt => attempt.status === 'confirmed_empty') || job.scenes.some(s => s.assetId || s.persistedIntentId)) throw new Error('Reframing requires a recovered job with no existing media or pending submissions.');
    const { project, duration } = validateProject(input.project);
    const clipDuration = input.clipDuration ?? job.brief.clipDuration;
    if (![4, 6, 8, 10].includes(clipDuration)) throw new Error('Unsupported generation length.');
    if (project.id !== job.id || project.brief.aspectRatio !== '9:16' || duration !== job.brief.duration || project.scenes.length + job.generations > job.options.maxGenerations) throw new Error('Reframed shots must preserve job, duration, portrait ratio and remaining generation cap.');
    if (project.scenes.some(s => s.assetId || s.duration < clipDuration || s.duration > clipDuration * 1.3)) throw new Error('Reframing supports modest slow motion only.');
    const originalBackup = path.join(this.dir(job), 'project-before-recovery.json');
    const backup = await fs.stat(originalBackup).then(() => path.join(this.dir(job), `project-before-reframe-${randomUUID()}.json`)).catch(() => originalBackup);
    await atomicJson(backup, job.project);
    project.assets = []; project.captions = project.brief.style !== 'kai'; project.voiceoverAssetId = null; project.musicAssetId = null;
    job.brief.clipDuration = clipDuration;
    job.project = project;
    job.scenes = project.scenes.map((scene, index) => {
      const prompt = `MOTIF shot ${job.id.slice(0, 8)}-reframe-${index + 1}. Create one vertical 9:16 video clip, ${job.brief.clipDuration} seconds.\n${buildAnimationPrompt(project, scene)}\nVisual action only. Keep the frame free of lettering and keep the subject's mouth at rest. No generated text, subtitles, speech, lip sync or music. End in a stable composition.`;
      return { id: scene.id, label: scene.label, duration: job.brief.clipDuration, timelineDuration: scene.duration, prompt, promptHash: hash(prompt), status: 'pending', assetId: null };
    });
    delete job.voiceoverAssetId; await this.savePlan(job);
    return job;
  }
  async cancel(job) { this.pending.delete(job.id); this.running.get(job.id)?.abort(); await this.transition(job, 'cancelled', 'Dibatalkan. Klip yang sudah diunduh tetap disimpan.'); return job; }
  async heartbeat(input) {
    const states = [...bridgeActiveStates, 'paired', 'paused', 'disabled', 'waiting_login', 'login_required', 'waiting_setup', 'blocked', 'error'];
    const state = states.includes(input.state) ? input.state : 'blocked';
    const diagnostics = typeof input.diagnostics === 'string' ? clean(input.diagnostics, 5000) : this.config.heartbeat?.diagnostics || '';
    this.config.heartbeat = { state, detail: clean(input.detail), version: clean(input.version, 80), enabled: input.enabled === false ? false : input.enabled === true || bridgeActiveStates.includes(state), at: new Date().toISOString(), diagnostics };
    await this.saveConfig();
    for (const job of this.jobs.values()) {
      if (job.status === 'waiting_flow' && ['waiting_login', 'login_required'].includes(state)) { job.resumeStage = 'waiting_flow'; await this.transition(job, 'waiting_login', 'Sign in to Flow in Brave to continue.'); }
      else if (((job.status === 'waiting_login' && job.resumeStage === 'waiting_flow' && job.project) || (job.status === 'waiting_setup' && job.waitingReason === 'bridge')) && bridgeActiveStates.includes(state)) await this.resume(job);
    }
    return { ok: true };
  }
  taskFor(job, scene) {
    return { id: `${job.id}.${scene.id}`, jobId: job.id, sceneId: scene.id, prompt: scene.prompt, promptHash: scene.promptHash, duration: scene.duration, aspectRatio: '9:16', outputs: 1, status: scene.assetId ? 'complete' : scene.persistedIntentId ? 'submitted' : 'pending', persistedIntentId: scene.persistedIntentId || null, detail: scene.error || null, maxGenerations: job.options.maxGenerations, remainingGenerations: Math.max(0, job.options.maxGenerations - job.generations), creditBudget: job.options.creditBudget, spentCredits: job.spentCredits, remainingCredits: Math.max(0, job.options.creditBudget - job.spentCredits), budgetGranted: job.options.allowPaid === true };
  }
  task() {
    const heartbeat = this.config.heartbeat;
    if (!heartbeat || !heartbeat.enabled || Date.now() - Date.parse(heartbeat.at) > 90000 || !bridgeActiveStates.includes(heartbeat.state)) return null;
    for (const job of [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (job.status !== 'waiting_flow' || ['flow-agent', 'google-flow-mcp'].includes(job.options.flowProvider) || !job.options.allowPaid || job.options.creditBudget <= 0) continue;
      const scene = job.scenes.find((item) => !item.assetId); if (scene) return this.taskFor(job, scene);
    }
    return null;
  }
  flightStatus(input) {
    const job = this.get(input?.jobId), scene = job?.scenes.find((item) => item.id === input?.sceneId);
    if (!scene) return { flightStatus: 'unknown', lastCompleted: null };
    if (!scene.persistedIntentId && input.persistedIntentId) return { flightStatus: job.status === 'cancelled' ? 'cancelled' : 'not_reserved', lastCompleted: null };
    if (scene.persistedIntentId !== input.persistedIntentId) return { flightStatus: 'unknown', lastCompleted: null };
    if (job.status === 'cancelled') return { flightStatus: 'cancelled', lastCompleted: null };
    const complete = Boolean(scene.assetId);
    return { flightStatus: complete ? 'complete' : 'submitted', lastCompleted: complete ? { jobId: job.id, sceneId: scene.id, persistedIntentId: scene.persistedIntentId } : null };
  }
  findScene(input) { const job = this.get(input.jobId); const scene = job?.scenes.find((item) => item.id === input.sceneId); if (!job || !scene) throw new Error('Unknown Flow task.'); return { job, scene }; }
  async event(input, { provider = 'bridge' } = {}) {
    const { job, scene } = this.findScene(input);
    if ((job.options.flowProvider || 'bridge') !== provider) throw new Error('This task belongs to another Flow transport.');
    if (['complete', 'cancelled'].includes(job.status)) throw new Error('This job is no longer accepting Flow events.');
    if (input.status === 'submitted') {
      if (scene.persistedIntentId) {
        if (scene.persistedIntentId === input.persistedIntentId) { await this.writes.get(job.id); return { accepted: true, duplicate: true, task: this.taskFor(job, scene), job: this.describe(job) }; }
        throw new Error('A submission is already reserved for this scene. Never click Generate again.');
      }
      if (job.status !== 'waiting_flow' || !job.options.allowPaid) throw new Error('Paid Flow generation is not authorized for this job.');
      const firstMissing = job.scenes.find(item => !item.assetId);
      const activeTask = ['flow-agent', 'google-flow-mcp'].includes(provider) && firstMissing?.id === scene.id ? this.taskFor(job, scene) : this.task();
      if (!activeTask || activeTask.jobId !== job.id || activeTask.sceneId !== scene.id) throw new Error('Only the active task may be submitted by an enabled Flow worker.');
      if (typeof input.persistedIntentId !== 'string' || input.persistedIntentId.length < 8 || input.persistedIntentId.length > 160) throw new Error('Persist a submission intent ID before generating.');
      const cost = input.observedCreditCost;
      if (!Number.isFinite(cost) || cost < 0) throw new Error('Read the actual visible Flow credit cost before generating.');
      if (job.generations >= job.options.maxGenerations || job.spentCredits + cost > job.options.creditBudget) throw new Error('The approved generation limit or credit budget would be exceeded.');
      // Update synchronously before awaiting the durable write, so simultaneous
      // requests cannot reserve the same generation/credits twice.
      scene.persistedIntentId = input.persistedIntentId; scene.observedCreditCost = cost; scene.submittedAt = new Date().toISOString(); scene.status = 'submitted'; job.generations++; job.spentCredits += cost;
      await this.persist(job);
      return { accepted: true, duplicate: false, task: this.taskFor(job, scene), job: this.describe(job) };
    }
    if (!['blocked', 'error'].includes(input.status)) throw new Error('Unsupported Flow event.');
    scene.status = input.status; scene.error = clean(input.message); job.resumeStage = 'waiting_flow';
    const login = input.reason === 'login' || /sign.?in|log.?in|masuk akun/i.test(scene.error);
    await this.transition(job, input.status === 'error' ? 'error' : login ? 'waiting_login' : 'waiting_setup', scene.error || 'The Flow worker needs attention.', login ? 'login' : 'bridge');
    return { accepted: true, job: this.describe(job) };
  }
  async acceptResult(input, asset, { continueRun = true } = {}) {
    const { job, scene } = this.findScene(input);
    if (scene.assetId) { await this.persist(job); return { duplicate: true, asset: await this.getAsset(scene.assetId), job: this.describe(job) }; }
    if (!scene.persistedIntentId || ['cancelled', 'complete'].includes(job.status)) throw new Error('No active, durably reserved Flow submission exists for this scene.');
    if (asset.source?.provider !== 'google-flow' || asset.source.promptHash !== scene.promptHash) throw new Error('Missing Flow bridge provenance.');
    scene.assetId = asset.id; scene.status = 'complete'; scene.completedAt = new Date().toISOString(); scene.error = null;
    job.project.scenes.find((item) => item.id === scene.id).assetId = asset.id; job.project.assets.push(asset);
    await this.savePlan(job);
    await this.transition(job, 'waiting_flow', 'Flow clip received. Continuing the production.'); if (continueRun) this.start(job);
    return { duplicate: false, asset, job: this.describe(job) };
  }
  async downloadPath(job) {
    if (job.status !== 'complete' || job.outputPath !== 'final.mp4') throw new Error('The final video is not ready.');
    return within(this.root, path.join(this.dir(job), 'final.mp4'));
  }
  recoverJobs() { for(const job of this.jobs.values())if(job.options.flowProvider==='google-flow-mcp'&&job.waitingReason==='interrupted')this.start(job); }
  close() { this.closed = true; this.pending.clear(); for (const controller of this.running.values()) controller.abort(); void this.flowMcp.close(); }
}
