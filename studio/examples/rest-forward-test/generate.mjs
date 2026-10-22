import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createProject, buildFlowPack, exportProjectMarkdown, toSrt,
  buildCodexPrompt, buildAnimationPrompt, generationPlan, validateProject,
} from '../../public/planner.mjs';
import { validateProject as validateRenderProject } from '../../render.mjs';

// Forward test of .agents/skills/short-video-studio/SKILL.md.
// No Flow generation, external request, credentials, or paid service is used.
const request = 'Bikin short 30 detik tentang istirahat, editorial calm, Flow footage plus captions';
const brief = {
  topic: 'Istirahat tanpa rasa bersalah',
  audience: 'Anak muda yang merasa harus selalu produktif',
  tone: 'Tenang, hangat, dan tidak menggurui',
  style: 'editorial', duration: 30, aspectRatio: '9:16', fps: 30,
  clipDuration: 8, accent: '#D66042',
};
const project = createProject(brief);
project.id = 'example-rest-30s';
project.title = 'Kamu Boleh Istirahat';
project.captions = true;
project.assets = [];
const shots = [
  {
    headline: 'Boleh berhenti sebentar',
    voiceover: 'Kalau istirahat bikin kamu merasa bersalah, coba dengarkan ini: kamu tidak harus menunggu benar-benar habis.',
    visual: 'Satu cakram kertas warna terakota di atas latar kertas hangat, sedikit tertekan di antara dua bidang abu kehijauan. Tidak ada karakter manusia. Proporsi objek sederhana, bahan kertas matte, bayangan lembut dari cahaya kiri atas; ruang atas dan bawah lega.',
    motion: 'Pada awal shot, dua bidang bergerak pelan menjauh. Cakram kembali ke bentuk bundar dengan spring sangat teredam. Kamera mendekat sedikit selama separuh pertama lalu menahan komposisi yang terasa lapang. Akhiri dengan pose diam yang mudah dibaca.',
  },
  {
    headline: 'Tenagamu ada batasnya',
    voiceover: 'Kadang yang kamu butuhkan bukan dorongan baru, tetapi ruang untuk menyadari tubuh dan pikiranmu sedang lelah.',
    visual: 'Cakram kertas terakota yang sama dikelilingi beberapa kartu kosong abu kehijauan berjarak terlalu dekat. Latar kertas hangat dan cahaya kiri atas identik dengan frame referensi; tidak ada grafik angka atau karakter manusia.',
    motion: 'Kartu bergerak perlahan ke tepi dengan selang kecil yang teratur, menyisakan ruang luas di sekitar cakram. Cakram tetap stabil. Gunakan gerak kamera sangat halus dan tahan komposisi lapang pada akhir shot.',
  },
  {
    headline: 'Jeda yang sederhana',
    voiceover: 'Coba letakkan ponsel. Ambil air. Duduk dua menit tanpa target. Periksa apa yang kamu butuhkan sekarang.',
    visual: 'Meja minimal dari potongan kertas hangat, satu ponsel polos dengan layar menghadap bawah, satu gelas air bening bergaya ilustrasi kertas, dan cakram terakota kecil sebagai motif berulang. Cahaya kiri atas, bahan matte, ruang atas dan bawah tetap lapang.',
    motion: 'Ponsel bergeser lembut ke samping lalu berhenti. Gelas bergerak sedikit ke pusat tanpa berganti bentuk. Riak air sangat kecil mereda. Kamera tetap tenang; satu area kosong bertahan di pusat agar adegan terasa memiliki ruang untuk bernapas.',
  },
  {
    headline: 'Istirahat juga bagian perjalanan',
    voiceover: 'Kamu boleh kembali saat lebih siap. Untuk sekarang, beri dirimu izin beristirahat.',
    visual: 'Cakram kertas terakota yang sama berada di area kertas hangat yang luas dengan satu lengkung abu kehijauan sebagai alas. Bayangan lembut, cahaya kiri atas, tanpa karakter manusia, hanya dua bentuk utama dan ruang kosong yang lapang.',
    motion: 'Cakram turun beberapa piksel ke lengkung yang menopangnya lalu berhenti lembut. Kamera mundur sangat sedikit sehingga ruang kosong terasa lebih luas. Tahan pose akhir tanpa perubahan objek untuk penutup yang tenang.',
  },
];
project.scenes = project.scenes.map((scene, index) => ({
  ...scene, ...shots[index], label: ['HOOK', 'REFRAME', 'TINDAKAN', 'PENUTUP'][index],
  transition: index === 3 ? 'cut' : 'dissolve',
}));
project.publishing = {
  titles: ['Kamu Boleh Istirahat', 'Tidak Harus Menunggu Habis untuk Berhenti', 'Jeda Kecil, Tanpa Rasa Bersalah'],
  description: 'Kalau berhenti sebentar terasa seperti kesalahan, pengingat ini untukmu. Coba letakkan ponsel, ambil air, dan beri ruang untuk memeriksa kebutuhanmu hari ini. Simpan untuk saat kamu perlu diingatkan bahwa istirahat juga punya tempat.',
  hashtags: ['#Istirahat', '#JedaSejenak', '#PengingatDiri', '#YouTubeShorts'],
  thumbnailPrompt: 'Editorial calm, vertical 9:16. A single matte terracotta paper disc resting on a muted gray-green paper curve, spacious warm paper background #F2EEE6, charcoal #242C29 and terracotta #D66042. Soft top-left lighting, simple tactile cut-paper illustration, no human character. Leave upper third clear for a short editable title. Keep image free of generated lettering, logos, and watermarks.',
};

const flowPack = buildFlowPack(project);
const production = exportProjectMarkdown(project);
const srt = toSrt(project);
const errors = validateProject(project);
const renderValidation = validateRenderProject(project);
const plans = project.scenes.map(scene => ({ id: scene.id, ...generationPlan(scene, brief) }));
const counts = project.scenes.map(scene => scene.voiceover.trim().split(/\s+/).length);
const checks = {
  frontendSchema: errors.length === 0,
  backendSchema: renderValidation.duration === 30,
  exactEditorialDuration: project.scenes.reduce((sum, scene) => sum + scene.duration, 0) === 30,
  selectedStyle: project.brief.style === 'editorial',
  captionsEnabled: project.captions === true,
  vertical30fps: project.brief.aspectRatio === '9:16' && project.brief.fps === 30,
  eightSecondSourceShots: plans.every(plan => plan.clipDuration === 8 && plan.clips === 1),
  finalSceneTrim: plans.at(-1).editorial === 6 && plans.at(-1).generated === 8,
  narrationSeparated: project.scenes.every(scene => !buildAnimationPrompt(project, scene).includes(scene.voiceover)),
  consistentVisualLocks: project.scenes.every(scene => {
    const prompt = buildAnimationPrompt(project, scene);
    return ['STYLE LOCK:', 'PALETTE LOCK:', 'REFERENCE LOCK:', '#F2EEE6', '#242C29', '#D66042'].every(value => prompt.includes(value));
  }),
  spokenPace: project.scenes.every((scene, index) => counts[index] / scene.duration >= 1.6 && counts[index] / scene.duration <= 2.8),
  exactSubtitleEnd: srt.includes('--> 00:00:30,000'),
  noExternalMediaClaim: project.assets.length === 0 && project.scenes.every(scene => scene.assetId === null),
};
if (errors.length || Object.values(checks).some(result => result !== true)) {
  throw new Error(`Forward test failed: ${JSON.stringify({ errors, checks })}`);
}
const report = {
  request, skill: '.agents/skills/short-video-studio/SKILL.md',
  result: 'passed — editable project and production handoff; external footage pending',
  editorialSeconds: 30,
  generatedSourceSecondsPlanned: plans.reduce((sum, plan) => sum + plan.generated, 0),
  narrationWords: counts.reduce((sum, count) => sum + count, 0),
  scenePlans: plans,
  checks, errors,
  boundary: {
    externalCalls: 0, paidGenerations: 0,
    flowFootage: 'Not generated. Use the visual prompts in Flow, then import downloaded clips into matching scene IDs.',
    narration: 'Script only. No spoken-audio file has been generated.',
    mp4: 'Not rendered by this forward handoff test. This example is ready for JSON import and local preview/export.',
  },
};
const readme = `# Forward test: istirahat, 30 detik\n\nRequest: “${request}”.\n\nThe unified skill was read with its creative-direction, Flow-handoff, and render-contract references. Assumptions: Indonesian, vertical 9:16, 30 fps, warm paper editorial design, no recurring human character, four 8-second source clips. The edit uses 8 + 8 + 8 + 6 seconds; the last source is trimmed by two seconds.\n\nThe story reframes rest without demanding extra productivity: recognize guilt → allow space → put down the phone and take a simple break → give permission to rest. The 30-second project has ${report.narrationWords} narration words and editable captions.\n\n1. Import project.json using the studio's JSON import.\n2. Review the four scene headlines and narration.\n3. Generate the four image/animation pairs from flow-pack.md in a supported Flow model/mode. Approve the first frame as the recurring paper/material/palette reference.\n4. Import downloaded clips into scene-01 through scene-04. Keep trimStart at 0, with final scene at 6 seconds.\n5. Record/import voiceover.txt separately if desired; captions.srt contains estimated timing based on scene word proportions.\n6. Preview crop, captions, pacing, and final holds; export MP4 locally.\n\nFiles: project.json, flow-pack.md, production.md, voiceover.txt, captions.srt, codex-brief.txt, validation.json. Regenerate with node studio/examples/rest-forward-test/generate.mjs.\n\nValidation: ${Object.keys(checks).length} checks passed, including both project validators, exact timing, voiceover separation, palette/reference locks, and final subtitle endpoint. No external request or paid generation was made. Flow footage, spoken audio, and a finished MP4 are not claimed to exist in this example.\n`;
const outDir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(outDir, { recursive: true });
await Promise.all(Object.entries({
  'project.json': `${JSON.stringify(project, null, 2)}\n`,
  'flow-pack.md': flowPack,
  'production.md': production,
  'voiceover.txt': `${project.scenes.map(scene => scene.voiceover).join('\n\n')}\n`,
  'captions.srt': srt,
  'codex-brief.txt': buildCodexPrompt(brief),
  'validation.json': `${JSON.stringify(report, null, 2)}\n`,
  'README.md': readme,
}).map(([filename, content]) => writeFile(new URL(filename, import.meta.url), content)));
console.log(JSON.stringify({ outDir, checksPassed: Object.keys(checks).length, editorialSeconds: 30, plannedSourceSeconds: report.generatedSourceSecondsPlanned, narrationWords: report.narrationWords, errors }));
