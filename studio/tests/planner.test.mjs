import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STYLES, DEFAULT_TOPIC, normalizeBrief, generateIdeas, createProject,
  buildImagePrompt, buildAnimationPrompt, buildFlowPack, exportProjectMarkdown,
  buildCodexPrompt, toSrt, validateProject, generationPlan,
} from '../public/planner.mjs';

test('planning keeps Kai and the four legacy styles', () => {
  assert.deepEqual(STYLES.map(style => style.id), ['kai', 'kinetic', 'cinematic', 'editorial', 'stickman']);
  const brief = normalizeBrief({ duration: 900, style: 'unknown', fps: 60, clipDuration: 3, aspectRatio: '4:3', accent: 'bad' });
  assert.equal(brief.duration, 180);
  assert.equal(brief.fps, 30);
  assert.equal(brief.style, 'kinetic');
  assert.equal(brief.clipDuration, 6);
  assert.equal(brief.aspectRatio, '9:16');
  assert.equal(normalizeBrief({ duration: 3 }).duration, 8);
  assert.equal(normalizeBrief({ duration: 0 }).duration, 8);
  assert.equal(normalizeBrief({ duration: -100 }).duration, 8);
  assert.equal(normalizeBrief().topic, DEFAULT_TOPIC);
  assert.equal(normalizeBrief({ topic: 17 }).topic, DEFAULT_TOPIC);
});

test('offline ideas retain a custom topic and have distinct useful angles', () => {
  const ideas = generateIdeas({ topic: 'Berani belajar menggambar' });
  assert.equal(ideas.length, 10);
  assert.equal(new Set(ideas.map(idea => idea.id)).size, 10);
  assert.equal(new Set(ideas.map(idea => idea.angle)).size, 10);
  assert.ok(ideas.some(idea => `${idea.title} ${idea.angle}`.includes('menggambar')));
  assert.ok(ideas.every(idea => idea.title && idea.hook && idea.angle));
});

test('an eight-second one-shot story adapts its action to rest rather than generic productivity', () => {
  const project = createProject({ topic: 'Istirahat saat lelah', duration: 8, clipDuration: 8 });
  assert.equal(project.scenes.length, 1);
  assert.match(project.scenes[0].voiceover, /jeda/);
  assert.ok(!project.scenes[0].voiceover.includes('kerjakan'));
});

test('every supported duration and clip length sum exactly to target with speakable final scenes', () => {
  for (const duration of [8, 8.001, 8.1, 9, 13, 17.5, 30, 31, 47.125, 60, 90, 179, 180]) {
    for (const clipDuration of [4, 6, 8, 10]) {
      const project = createProject({ duration, clipDuration });
      assert.ok(Math.abs(project.scenes.reduce((sum, scene) => sum + scene.duration, 0) - duration) < 0.00001);
      assert.ok(project.scenes.every(scene => scene.duration <= clipDuration && scene.duration >= 2));
      assert.deepEqual(validateProject(project), [], JSON.stringify({ duration, clipDuration, errors: validateProject(project) }));
    }
  }
});

test('all aspect ratios and styles survive project creation and Flow export', () => {
  for (const aspectRatio of ['9:16', '1:1', '16:9']) {
    for (const style of STYLES.filter(style=>style.id!=='kai')) {
      const project = createProject({ aspectRatio, style: style.id, fps: 24, accent: '#eE5533' });
      assert.equal(project.brief.aspectRatio, aspectRatio);
      assert.equal(project.brief.accent, '#EE5533');
      assert.ok(buildFlowPack(project).includes(`${aspectRatio}, 24 fps`));
      assert.deepEqual(validateProject(project), []);
    }
  }
});

test('image and animation prompts keep narration and editor typography separate', () => {
  const project = createProject({ duration: 13, clipDuration: 8 });
  const scene = project.scenes[0];
  scene.voiceover = 'PRIVATE NARRATOR SENTENCE 9482';
  scene.headline = 'PRIVATE EDITOR HEADLINE 3710';
  for (const prompt of [buildImagePrompt(project, scene), buildAnimationPrompt(project, scene)]) {
    assert.ok(!prompt.includes(scene.voiceover));
    assert.ok(!prompt.includes(scene.headline));
    assert.ok(prompt.includes(scene.visual));
    assert.ok(prompt.includes('REFERENCE LOCK'));
  }
  const pack = buildFlowPack(project);
  assert.ok(pack.includes(scene.voiceover));
  assert.ok(pack.includes('8 detik = 8 detik bahan'));
  assert.ok(pack.includes('EDITORIAL: gunakan 5 detik'));
  assert.ok(pack.includes('Potong sisa 3 detik'));
  const animationOnly = pack.split('### Prompt animasi — salin bagian ini saja ke Flow')[1].split('### Suara terpisah')[0];
  assert.ok(!animationOnly.includes(scene.voiceover));
  assert.ok(!animationOnly.includes(scene.headline));
});

test('Flow pack distinguishes generated source, trim offset, and editorial timing after edits', () => {
  const project = createProject({ duration: 12, clipDuration: 6 });
  project.scenes[0].trimStart = 2;
  const pack = buildFlowPack(project);
  assert.ok(pack.includes('GENERASI: 2 klip × 6 detik = 12 detik bahan'));
  assert.ok(pack.includes('in 00:00:02.000, out 00:00:08.000'));
  assert.ok(pack.includes('timeline 00:00:06.000–00:00:12.000'));
  assert.deepEqual(generationPlan(project.scenes[0], project.brief), { clipDuration: 6, clips: 2, generated: 12, trimStart: 2, trimEnd: 8, editorial: 6 });
});

const srtMs = timestamp => {
  const [hours, minutes, seconds, ms] = timestamp.split(/[:,]/).map(Number);
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
};

test('SRT uses cumulative actual scene durations with precise endpoints and wrapped captions', () => {
  const project = createProject({ duration: 17.5, clipDuration: 6 });
  project.scenes[0].voiceover = 'Satu langkah kecil bisa dimulai hari ini tanpa harus menunggu keadaan yang sempurna.';
  const blocks = toSrt(project).trim().split('\n\n');
  let lastEnd = 0;
  for (const [index, block] of blocks.entries()) {
    const [number, timing, ...lines] = block.split('\n');
    const [start, end] = timing.split(' --> ').map(srtMs);
    assert.equal(Number(number), index + 1);
    assert.equal(start, lastEnd);
    assert.ok(end > start);
    assert.ok(lines.length <= 2);
    assert.ok(lines.every(line => line.length <= 42));
    lastEnd = end;
  }
  assert.equal(lastEnd, 17500);
  assert.match(toSrt(project), /00:00:17,500/);
});

test('SRT leaves silent scenes silent while preserving their timeline space', () => {
  const project = createProject({ duration: 12, clipDuration: 6 });
  project.scenes[0].voiceover = '';
  const srt = toSrt(project);
  assert.match(srt, /1\n00:00:06,000 --> /);
  assert.match(srt, /00:00:12,000/);
});

test('SRT prefers actual speech boundaries and retains silence between scenes', () => {
  const project = createProject({ duration: 12, clipDuration: 6 });
  project.scenes[0].wordTimings = [{ text: 'Istirahat', start: .25, end: .9 }, { text: 'dulu.', start: 1.1, end: 1.7 }];
  project.scenes[1].wordTimings = [{ text: 'Boleh', start: .4, end: .95 }, { text: 'kembali.', start: 1.2, end: 1.8 }];
  const srt = toSrt(project);
  assert.match(srt, /00:00:00,250 --> 00:00:01,700\nIstirahat dulu\./);
  assert.match(srt, /00:00:06,400 --> 00:00:07,800\nBoleh kembali\./);
  assert.ok(!srt.includes('00:00:12,000'), 'Silence after speech must not extend the actual subtitle.');
  project.scenes[0].wordTimings[0].end = 20;
  assert.throws(() => toSrt(project), /Timing kata/);
  assert.ok(validateProject(project).some(error => error.includes('timing kata')));
});

test('exports contain complete production handoff and Codex can return the import schema', () => {
  const project = createProject({ topic: 'Fokus saat belajar', duration: 30 });
  assert.ok(project.scenes.some(scene => scene.voiceover.toLowerCase().includes('fokus saat belajar')));
  const markdown = exportProjectMarkdown(project);
  for (const fragment of ['Naskah suara utuh', 'Prompt gambar', 'Prompt animasi visual', 'Prompt thumbnail', '## Judul', '## Deskripsi', '## Hashtag', 'Subtitle SRT', 'Draf template offline']) assert.ok(markdown.includes(fragment));
  const prompt = buildCodexPrompt(project.brief);
  for (const fragment of ['assetId:null', 'trimStart:0', 'publishing', 'voiceover', '30 detik', '2–2.5 kata per detik']) assert.ok(prompt.includes(fragment));
});

test('validator reports schema, content, duplicate IDs, dense narration, and timing errors', () => {
  assert.deepEqual(validateProject(null), ['Project harus berupa objek JSON.']);
  const project = createProject({ duration: 12 });
  project.scenes[0].headline = '';
  project.scenes[0].duration = 0;
  project.scenes[1].id = project.scenes[0].id;
  project.brief.aspectRatio = '4:3';
  let errors = validateProject(project).join('\n');
  for (const fragment of ['headline', 'durasi harus', 'dipakai lebih dari satu kali', 'Rasio']) assert.ok(errors.includes(fragment));
  const timingProject = createProject({ duration: 12 });
  timingProject.scenes[0].duration = 2;
  timingProject.scenes[0].voiceover = 'kata '.repeat(80);
  errors = validateProject(timingProject).join('\n');
  assert.ok(errors.includes('Jumlah durasi adegan'));
  assert.ok(errors.includes('terlalu padat'));
  timingProject.scenes[1] = [];
  assert.ok(validateProject(timingProject).some(error => error.includes('harus berupa objek')));
});

test('validator matches scene limits and rejects malformed imported media before UI use', () => {
  const project = createProject({ duration: 12 });
  const base = structuredClone(project.scenes[0]);
  project.scenes = Array.from({ length: 61 }, (_, i) => ({ ...base, id: `scene-${i}`, duration: 1 }));
  project.brief.duration = 61;
  assert.ok(validateProject(project).some(error => error.includes('60 adegan')));
  project.scenes = [{ ...base, duration: .1 }, { ...base, id: 'scene-2', duration: 11.9 }];
  project.brief.duration = 12;
  assert.ok(validateProject(project).some(error => error.includes('0.25')));
  const malformed = createProject();
  malformed.assets = {};
  malformed.musicVolume = 'loud';
  malformed.captions = 'yes';
  malformed.voiceoverAssetId = {};
  const errors = validateProject(malformed).join('\n');
  for (const fragment of ['Metadata media', 'Volume musik', 'captions', 'referensi']) assert.ok(errors.includes(fragment));
});

test('media metadata remains local, typed, and resolves scene/audio references', () => {
  const project = createProject();
  project.assets = [{ id: 'clip-1', name: 'footage.mp4', type: 'video/mp4', size: 1024, url: '/api/assets/clip-1' }];
  project.scenes[0].assetId = 'clip-1';
  assert.deepEqual(validateProject(project), []);
  project.assets[0].url = 'https://example.com/remote.mp4';
  assert.ok(validateProject(project).some(error => error.includes('URL')));
  project.assets[0].url = '/api/assets/clip-1';
  project.assets[0].type = 'audio/mpeg';
  assert.ok(validateProject(project).some(error => error.includes('gambar atau video')));
  project.scenes[0].assetId = null;
  project.voiceoverAssetId = 'clip-1';
  assert.deepEqual(validateProject(project), []);
  project.voiceoverAssetId = 'missing-file';
  assert.ok(validateProject(project).some(error => error.includes('metadata audio tidak ditemukan')));
});
