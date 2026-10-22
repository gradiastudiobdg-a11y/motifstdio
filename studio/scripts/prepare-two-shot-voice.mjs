import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { synthesizeVoiceover } from '../automation/voiceover.mjs';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prepDir = path.join(studioDir, '.studio/first-flow-test-prep');
const job = JSON.parse(await readFile(path.join(studioDir, '.studio/jobs/7cb9d178-b3ff-4ef4-a558-ce560151039c/job.json'), 'utf8'));
const project = structuredClone(job.project);
project.brief.clipDuration = 10;
project.scenes = [
  { ...project.scenes[0], id: 'mcp-1', duration: 15, headline: 'Mulai sebelum mood datang',
    voiceover: 'Buku sudah di meja, tapi tangan masih menggulir layar. Kamu nggak harus menunggu mood. Letakkan ponsel, buka bukunya, lalu mulai membaca selama dua menit saja.',
    motion: 'Close three-quarter camera, slow deliberate motion: look away from phone, place it face down, open the book and begin reading. A gentle continuous push in. Keep face and hands natural. No lettering, no dialogue, no music.' },
  { ...project.scenes[2], id: 'mcp-2', duration: 15, headline: 'Awal kecil tetap berarti',
    voiceover: 'Kalau perhatianmu melayang, tarik pelan kembali ke satu kalimat. Setelah dua menit, kamu boleh berhenti. Kamu nggak harus menuntaskan semuanya hari ini. Cukup buktikan: kamu bisa mulai.',
    motion: 'The same young man reads slowly, places the yellow bookmark between the pages, closes the book and exhales with a small relaxed smile. Gentle sideward camera drift. No lettering, no dialogue, no music.' },
];
for (const scene of project.scenes) { scene.assetId = null; scene.trimStart = 0; delete scene.wordTimings; }
project.assets = []; project.voiceoverAssetId = null; project.musicAssetId = null; delete project.voiceoverTimings;
const voiceDir = path.join(prepDir, 'two-shot-voice'); await mkdir(voiceDir, { recursive: true });
const result = await synthesizeVoiceover({ project, jobDir: voiceDir, voice: job.options.voice, ffmpegPath: path.join(studioDir, 'tools/ffmpeg.exe') });
await writeFile(path.join(prepDir, 'two-shot-project.json'), JSON.stringify(project, null, 2));
console.log(JSON.stringify({ prepared: true, duration: 30, scenes: 2, actualNarration: true, path: result.path, flowSubmitted: false }));
