import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProject, normalizeBrief, buildAnimationPrompt } from '../../public/planner.mjs';
import { planWithCodex } from '../codex-plan.mjs';
import { fittedWordTimings, synthesizeVoiceover } from '../voiceover.mjs';
import { encodeWav, parseWav, hash } from '../common.mjs';

const brief = normalizeBrief({ topic: 'Berani memulai sebelum merasa siap', audience: 'Pelajar yang takut memulai', tone: 'Hangat & tegas', duration: 15, clipDuration: 8, aspectRatio: '9:16', fps: 30, style: 'editorial', accent: '#BADA55' });
function upstreamPlan() {
  const value = createProject(brief);
  value.id = 'upstream-contract-fixture'; value.createdAt = '2026-10-18T00:00:00.000Z'; value.title = 'Rencana dari respons CLI fixture';
  value.scenes.forEach((scene, index) => {
    scene.id = `upstream-shot-${index}`; scene.headline = index ? 'LANGKAHMU CUKUP.' : 'MULAI SEBELUM SIAP.';
    scene.voiceover = index ? 'Ulangi satu langkah kecil. Biarkan keberanianmu tumbuh bersama prosesnya.' : 'Kamu tidak perlu merasa siap untuk mencoba satu langkah kecil hari ini.';
    scene.visual = 'A folded paper bird on warm textured paper, one focal subject with generous empty space.';
    scene.motion = 'The paper bird unfolds one wing. Slow camera push, followed by a stable final pose.';
  });
  return value;
}
async function temporary(t, prefix) { const folder = await fs.mkdtemp(path.join(os.tmpdir(), prefix)); t.after(() => fs.rm(folder, { recursive: true, force: true })); return folder; }

test('Codex adapter uses the upstream creative response and resumes it without another remote call', async (t) => {
  const jobDir = await temporary(t, 'motif-codex-contract-'); let calls = 0;
  const run = async (executable, args, options) => {
    calls++; assert.equal(executable, 'fixture-codex'); assert.equal(options.cwd, jobDir);
    assert.ok(args.includes('read-only')); assert.ok(args.includes('--output-schema')); assert.equal(args.at(-1), '-');
    assert.match(options.input, /9:16/); assert.match(options.input, /exactly 15|Sum exactly 15/i); assert.ok(options.input.includes(brief.topic)); assert.ok(options.input.includes(brief.accent));
    const schema = JSON.parse(await fs.readFile(args[args.indexOf('--output-schema') + 1], 'utf8')); assert.equal(schema.properties.scenes.minItems, 2); assert.equal(schema.properties.brief.properties.aspectRatio.const, '9:16');
    await fs.writeFile(args[args.indexOf('-o') + 1], JSON.stringify(upstreamPlan()));
    return { stdout: '', stderr: 'Offline contract fixture: no actual model call.' };
  };
  const planned = await planWithCodex({ brief, jobDir, executable: 'fixture-codex', run });
  assert.equal(planned.title, 'Rencana dari respons CLI fixture'); assert.deepEqual(planned.scenes.map((scene) => scene.duration), [8, 7]); assert.equal(planned.brief.aspectRatio, '9:16');
  assert.equal(planned.scenes[0].headline, 'MULAI SEBELUM SIAP.');
  const visualPrompt = buildAnimationPrompt(planned, planned.scenes[0]);
  assert.match(visualPrompt, /STYLE LOCK:/); assert.ok(visualPrompt.includes('#BADA55')); assert.match(visualPrompt, /Warm paper|warm paper/); assert.ok(!visualPrompt.includes(planned.scenes[0].voiceover), 'The spoken script must not be inserted into the Flow visual prompt.');
  const resumed = await planWithCodex({ brief, jobDir, executable: 'fixture-codex', run: async () => { throw Error('An unchanged valid plan must resume without a model call.'); } });
  assert.equal(resumed.title, planned.title); assert.equal(calls, 1);
});

test('bad upstream planning responses stop production instead of silently using offline templates', async (t) => {
  const root = await temporary(t, 'motif-codex-invalid-');
  const cases = [
    ['malformed-json', () => '{not-json'],
    ['missing-output-file', () => undefined],
    ['landscape', () => { const value = upstreamPlan(); value.brief.aspectRatio = '16:9'; return value; }],
    ['wrong-total', () => { const value = upstreamPlan(); value.scenes[0].duration -= 1; return value; }],
    ['invented-asset', () => { const value = upstreamPlan(); value.scenes[0].assetId = 'invented-footage'; return value; }],
    ['audio-in-motion', () => { const value = upstreamPlan(); value.scenes[0].motion = 'Add spoken dialogue and synchronize the lips.'; return value; }],
    ['audio-in-visual', () => { const value = upstreamPlan(); value.scenes[0].visual = 'The subject speaks the narration with subtitles.'; return value; }],
  ];
  for (const [name, response] of cases) {
    let calls = 0;
    await assert.rejects(planWithCodex({ brief, jobDir: path.join(root, name), executable: 'fixture-codex', run: async (_executable, args) => { calls++; const value = response(); if (value !== undefined) await fs.writeFile(args[args.indexOf('-o') + 1], typeof value === 'string' ? value : JSON.stringify(value)); return { stdout: JSON.stringify(upstreamPlan()), stderr: 'Local fixture only.' }; } }), (error) => error.code === 'INVALID_PLAN', name);
    assert.equal(calls, 1, `${name}: invalid output must not trigger an automatic remote retry or a hidden fallback.`);
  }
  await assert.rejects(planWithCodex({ brief, jobDir: path.join(root, 'login'), executable: 'fixture-codex', run: async () => { throw Error('401 authentication required'); } }), (error) => error.code === 'LOGIN_REQUIRED');
});

test('Omni web planning uses three 10-second shots for 30 seconds and preserves its budget schedule',async t=>{
  const jobDir=await temporary(t,'motif-codex-omni-');
  const input={...brief,duration:30,clipDuration:10};
  const planned=await planWithCodex({brief:input,jobDir,executable:'fixture-codex',run:async(_exe,args,options)=>{
    const schema=JSON.parse(await fs.readFile(args[args.indexOf('--output-schema')+1],'utf8'));
    assert.equal(schema.properties.brief.properties.clipDuration.const,10);assert.equal(schema.properties.scenes.minItems,3);assert.equal(schema.properties.scenes.items.properties.duration.maximum,10);
    assert.match(options.input,/one real 10-second Flow clip/);assert.match(options.input,/\[10,10,10\]/);
    const value=createProject(input);value.scenes.forEach(s=>{s.visual='A seed on warm paper.';s.motion='A slow camera push.';});
    await fs.writeFile(args[args.indexOf('-o')+1],JSON.stringify(value));return {stdout:'',stderr:'Fixture, no actual model call.'};
  }});
  assert.equal(planned.brief.clipDuration,10);assert.deepEqual(planned.scenes.map(s=>s.duration),[10,10,10]);
});

test('word timing fitting preserves synchronization and rejects unusable upstream boundaries', () => {
  const words = [{ text: 'Mulai', start: 0.2, end: 0.8 }, { text: 'sekarang', start: 1, end: 1.6 }];
  assert.deepEqual(fittedWordTimings(words, 1.25, 0.1, 2), [{ text: 'Mulai', start: 0.26, end: 0.74 }, { text: 'sekarang', start: 0.9, end: 1.38 }]);
  const invalid = [
    [[], 1, 0.1, 2], [words, 0, 0.1, 2], [words, 1, -1, 2], [words, 1, NaN, 2], [words, 1, 0.1, 0],
    [[{ text: 'kata', start: -0.2, end: 0.4 }], 1, 0.1, 2],
    [[{ text: 'kata', start: 1, end: 0.5 }], 1, 0.1, 2],
    [[{ text: 'kata', start: 10, end: 11 }], 1, 0.1, 2],
    [[{ text: 'kedua', start: 1, end: 1.5 }, { text: 'pertama', start: 0.1, end: 0.4 }], 1, 0.1, 2],
  ];
  for (const args of invalid) assert.throws(() => fittedWordTimings(...args), 'Invalid or truncated words must not be disguised as accurate captions.');
});

test('an unchanged actual PCM cache restores timing offline; edits and corrupt artifacts never reuse old narration', async (t) => {
  const jobDir = await temporary(t, 'motif-voice-cache-'), project = createProject({ ...brief, duration: 8, clipDuration: 8 });
  project.scenes[0].voiceover = 'Mulai dari satu langkah kecil.';
  const voice = 'id-ID-ArdiNeural', sampleRate = 48000, pcm = Buffer.alloc(sampleRate * 8 * 2);
  for (let i = 0; i < sampleRate * 8; i++) pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / sampleRate) * 1200), i * 2);
  const wav = encodeWav(pcm, sampleRate, 1); assert.equal(parseWav(wav).duration, 8);
  const folder = path.join(jobDir, 'voice'); await fs.mkdir(folder);
  const filename = path.join(folder, 'voiceover.wav'), manifestFile = path.join(folder, 'manifest.json');
  const words = [{ text: 'Mulai', start: 0.1, end: 0.6 }, { text: 'dari', start: 0.7, end: 1 }, { text: 'satu', start: 1.1, end: 1.5 }, { text: 'langkah', start: 1.6, end: 2 }, { text: 'kecil.', start: 2.1, end: 2.6 }];
  const manifest = { signature: hash({ engine: 'edge-tts-wordboundary-v1', voice, scenes: project.scenes.map(({ id, voiceover, duration }) => ({ id, voiceover, duration })) }), voice, duration: 8, wordTimingsByScene: { [project.scenes[0].id]: words } };
  await fs.writeFile(filename, wav); await fs.writeFile(manifestFile, JSON.stringify(manifest));
  let calls = 0;
  const offline = async () => { calls++; throw Object.assign(new Error('Offline fixture: no TTS/network runner is allowed.'), { code: 'OFFLINE_FIXTURE' }); };
  const cached = await synthesizeVoiceover({ project, jobDir, voice, run: offline, python: 'fixture-python', ffmpegPath: 'fixture-ffmpeg' });
  assert.equal(cached.resumed, true); assert.equal(calls, 0); assert.deepEqual(project.scenes[0].wordTimings, words); assert.deepEqual(await fs.readFile(cached.path), wav);
  const edited = structuredClone(project); edited.scenes[0].voiceover = 'Mulai satu langkah lagi hari ini.';
  await assert.rejects(synthesizeVoiceover({ project: edited, jobDir, voice, run: offline, python: 'fixture-python', ffmpegPath: 'fixture-ffmpeg' }), (error) => error.code === 'OFFLINE_FIXTURE'); assert.equal(calls, 1);
  await fs.writeFile(filename, wav.subarray(0, 44));
  await assert.rejects(synthesizeVoiceover({ project, jobDir, voice, run: offline, python: 'fixture-python', ffmpegPath: 'fixture-ffmpeg' }), (error) => error.code === 'OFFLINE_FIXTURE'); assert.equal(calls, 2);
  await fs.writeFile(filename, wav); const invalidManifest = structuredClone(manifest); invalidManifest.wordTimingsByScene[project.scenes[0].id][0].end = 20; await fs.writeFile(manifestFile, JSON.stringify(invalidManifest));
  await assert.rejects(synthesizeVoiceover({ project, jobDir, voice, run: offline, python: 'fixture-python', ffmpegPath: 'fixture-ffmpeg' }), (error) => error.code === 'OFFLINE_FIXTURE'); assert.equal(calls, 3);
  t.diagnostic('The cached WAV contains a local tone fixture, not claimed spoken TTS. This test verifies artifact and resume behavior without network.');
});
