import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeBrief, createProject, validateProject } from '../public/planner.mjs';
import { kaiPlanningRules } from '../public/kai-brand.mjs';
import { adapterError, atomicJson, checkAbort, codexEnvironment, findCodex, hash, readJson, redactDiagnostics, runCommand } from './common.mjs';

let readinessCache;
export async function getReadiness({ refresh = false } = {}) {
  if (!refresh && readinessCache && Date.now() - readinessCache.at < 60000) return readinessCache.value;
  let value;
  try {
    const executable = await findCodex();
    const status = await runCommand(executable, ['login', 'status'], { env: await codexEnvironment(), timeoutMs: 12000 });
    const authenticated = /logged in|authenticated|signed in/i.test(status.stdout + status.stderr);
    value = { ready: authenticated, detail: authenticated ? 'Codex CLI terpasang dan login ChatGPT terverifikasi. Model mengikuti default akun.' : 'Codex CLI tersedia, tetapi login belum terverifikasi. Jalankan codex login.', code: authenticated ? null : 'LOGIN_REQUIRED' };
  } catch (error) { value = { ready: false, detail: error.message, code: error.code === 'SETUP_REQUIRED' ? 'SETUP_REQUIRED' : 'LOGIN_REQUIRED' }; }
  readinessCache = { at: Date.now(), value }; return value;
}

const text = { type: 'string' };
export function projectSchema(sceneCount, clipDuration = 8) {
  return {
    type: 'object', additionalProperties: false,
    required: ['version', 'id', 'title', 'createdAt', 'brief', 'scenes', 'publishing'],
    properties: {
      version: { type: 'integer', const: 1 }, id: text, title: text, createdAt: text,
      brief: { type: 'object', additionalProperties: false, required: ['topic', 'audience', 'tone', 'style', 'duration', 'aspectRatio', 'fps', 'clipDuration', 'accent'], properties: {
        topic: text, audience: text, tone: text, style: { type: 'string', enum: ['kai', 'kinetic', 'cinematic', 'editorial', 'stickman'] }, duration: { type: 'number' }, aspectRatio: { type: 'string', const: '9:16' }, fps: { type: 'integer', const: 30 }, clipDuration: { type: 'integer', const: clipDuration }, accent: text,
      } },
      scenes: { type: 'array', minItems: sceneCount, maxItems: sceneCount, items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'duration', 'headline', 'voiceover', 'visual', 'motion', 'transition', 'assetId', 'trimStart'], properties: {
        id: text, label: text, duration: { type: 'number', minimum: .25, maximum: clipDuration }, headline: text, voiceover: text, visual: text, motion: text, transition: { type: 'string', enum: ['cut', 'wipe', 'iris', 'dissolve'] }, assetId: { type: 'null' }, trimStart: { type: 'number', const: 0 },
      } } },
      publishing: { type: 'object', additionalProperties: false, required: ['titles', 'description', 'hashtags', 'thumbnailPrompt'], properties: { titles: { type: 'array', items: text }, description: text, hashtags: { type: 'array', items: text }, thumbnailPrompt: text } },
    },
  };
}

export function assertAutomaticPlan(project, brief) {
  const errors = validateProject(project);
  const clipDuration = brief.clipDuration || 8, count = Math.ceil(brief.duration / clipDuration);
  if (errors.length) throw adapterError(`Rencana Codex tidak valid: ${errors.slice(0, 5).join(' ')}`, 'INVALID_PLAN');
  if (project.brief.aspectRatio !== '9:16' || project.brief.fps !== 30 || project.brief.clipDuration !== clipDuration) throw adapterError(`Rencana otomatis wajib 9:16, 30 fps, dan klip Flow ${clipDuration} detik.`, 'INVALID_PLAN');
  if (project.scenes.length !== count) throw adapterError(`Rencana membutuhkan tepat ${count} adegan agar sesuai anggaran generasi Flow.`, 'INVALID_PLAN');
  if (project.brief.duration !== brief.duration || project.brief.style !== brief.style) throw adapterError('Durasi atau gaya rencana tidak cocok dengan brief.', 'INVALID_PLAN');
  for (const scene of project.scenes) {
    if (scene.duration > clipDuration || scene.assetId !== null || scene.trimStart !== 0) throw adapterError(`Setiap adegan awal harus memakai satu klip Flow maksimal ${clipDuration} detik, tanpa aset palsu.`, 'INVALID_PLAN');
    if (/voiceover|narasi|dialog|lip[- ]?sync|subtitle|suara|audio|narrat|speak|talk|caption|berbicara|berucap|mengucap/i.test(`${scene.visual}\n${scene.motion}`)) throw adapterError(`Arahan visual/gerak ${scene.id} memuat instruksi suara/teks. Pisahkan dari prompt visual.`, 'INVALID_PLAN');
  }
  return project;
}

export async function planWithCodex({ brief: input = {}, jobDir, signal, executable: injectedExecutable, run = runCommand } = {}) {
  checkAbort(signal);
  if (!jobDir || typeof jobDir !== 'string') throw adapterError('Folder job diperlukan untuk perencanaan.');
  if (input.aspectRatio && input.aspectRatio !== '9:16') throw adapterError('Produksi otomatis hanya mendukung video vertikal 9:16.', 'INVALID_PLAN');
  const brief = normalizeBrief({ ...input, aspectRatio: '9:16', fps: 30, clipDuration: input.clipDuration || 8 });
  const count = Math.ceil(brief.duration / brief.clipDuration), signature = hash(brief);
  await fs.mkdir(jobDir, { recursive: true });
  const resultPath = path.join(jobDir, 'codex-project.json'), markerPath = path.join(jobDir, 'codex-request.json');
  const marker = await readJson(markerPath), cached = await readJson(resultPath);
  if (marker?.signature === signature && cached) { try { return assertAutomaticPlan(cached, brief); } catch { /* An invalid/incomplete cached answer never replaces a real call. */ } }
  const schedule = createProject(brief).scenes.map(scene => scene.duration);
  const prompt = `You are the creative planner for ${brief.style === 'kai' ? 'Kai Makes Do, a silent everyday home DIY short-video studio' : 'MOTIF, an Indonesian motivational short-video studio'}. Return ONLY JSON matching the schema. Do not inspect files, run commands, call tools, generate assets, or change the workspace. Think through several angles internally and write fresh actions for this idea.\nBRIEF DATA:\n${JSON.stringify(brief, null, 2)}\nPRODUCTION RULES:\n- Exactly ${count} scenes with this editorial schedule: ${JSON.stringify(schedule)}. Sum exactly ${brief.duration} seconds; each receives one real ${brief.clipDuration}-second Flow clip.\n- Set brief exactly to the supplied brief. version:1, safe unique ASCII IDs, createdAt:${new Date().toISOString()}, assetId:null, trimStart:0.\n- visual and motion contain only visible action, composition, expression, camera, light and end pose. No dialogue/narration/audio/lip-sync/caption instructions in those fields, even negative ones. Typography is added locally.\n- Keep identity, clothing, material count and object state consistent. Every practical transformation needs visible intermediate steps and a useful outcome. Use cuts for a change of time.\n${brief.style === 'kai' ? kaiPlanningRules(brief) : '- Write natural Indonesian narration, 1.8–2.25 words/sec, a specific hook, useful reframe and achievable action. Separate headline and voiceover. Avoid invented statistics or guaranteed outcomes. Use the selected visual style.'}\n- Publishing: three distinct titles, description, hashtags, thumbnailPrompt. Never claim footage or a finished build was already produced/tested.\n`;
  const schemaPath = path.join(jobDir, 'codex-schema.json');
  await atomicJson(schemaPath, projectSchema(count, brief.clipDuration));
  await fs.writeFile(path.join(jobDir, 'codex-prompt.txt'), prompt);
  await atomicJson(markerPath, { signature, brief, createdAt: new Date().toISOString() });
  // Remove a previous invalid answer so it cannot be confused with this attempt.
  await fs.unlink(resultPath).catch(() => {});
  try {
    const result = await run(injectedExecutable || await findCodex(), ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--output-schema', schemaPath, '-o', resultPath, '-'], { cwd: jobDir, env: await codexEnvironment(), input: prompt, signal, timeoutMs: 240000 });
    await fs.writeFile(path.join(jobDir, 'codex-diagnostics.txt'), redactDiagnostics(result.stderr || '').slice(-12000));
  } catch (error) {
    if (/login|authenticate|unauthorized|401|Could not find home directory/i.test(error.message)) error.code = 'LOGIN_REQUIRED';
    throw error;
  }
  const project = await readJson(resultPath);
  if (!project) throw adapterError('Codex tidak menghasilkan JSON project yang dapat dibaca. Tidak ada fallback template.', 'INVALID_PLAN');
  assertAutomaticPlan(project, brief);
  project.captions = brief.style !== 'kai';
  if (brief.style === 'kai') project.musicVolume = 0;
  await atomicJson(resultPath, project);
  return project;
}
