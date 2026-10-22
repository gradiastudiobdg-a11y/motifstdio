import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createProject } from '../public/planner.mjs';
import { parseWav, studioDir } from './common.mjs';
import { planWithCodex, getReadiness as codexReady } from './codex-plan.mjs';
import { synthesizeVoiceover, getReadiness as voiceReady } from './voiceover.mjs';

const args = new Set(process.argv.slice(2));
const jobDir = path.join(studioDir, '.studio', 'automation-smoke');
await fs.mkdir(jobDir, { recursive: true });
if (args.has('--check')) console.log(JSON.stringify({ codex: await codexReady({ refresh: true }), voice: await voiceReady({ refresh: true }) }, null, 2));
if (args.has('--codex')) {
  const project = await planWithCodex({ brief: { topic: 'Istirahat tanpa rasa bersalah', audience: 'Anak muda yang merasa harus selalu produktif', tone: 'Tenang dan hangat', style: 'editorial', duration: 8, aspectRatio: '9:16' }, jobDir: path.join(jobDir, 'codex') });
  console.log(JSON.stringify({ test: 'actual-codex-cli-plan', title: project.title, scenes: project.scenes.length, duration: project.brief.duration, aspectRatio: project.brief.aspectRatio, footageGenerated: false }));
}
if (args.has('--voice')) {
  const project = createProject({ topic: 'Istirahat', duration: 8, clipDuration: 8, style: 'editorial', aspectRatio: '9:16' });
  project.scenes[0].headline = 'Beri dirimu jeda';
  project.scenes[0].voiceover = 'Berhenti sebentar. Tarik napas, minum air, dan beri dirimu waktu untuk beristirahat.';
  const result = await synthesizeVoiceover({ project, jobDir: path.join(jobDir, 'voice'), voice: 'id-ID-ArdiNeural' });
  const wav = parseWav(await fs.readFile(result.path));
  let energy = 0;
  for (let offset = 0; offset < wav.data.length; offset += 2) energy += (wav.data.readInt16LE(offset) / 32768) ** 2;
  const rms = Math.sqrt(energy / (wav.data.length / 2));
  if (rms < .001 || wav.duration !== 8 || !project.scenes[0].wordTimings.length) throw new Error('Actual TTS smoke failed.');
  await fs.writeFile(path.join(jobDir, 'voice', 'project-with-word-timings.json'), JSON.stringify(project, null, 2));
  console.log(JSON.stringify({ test: 'actual-Indonesian-tts', path: result.path, duration: wav.duration, rms, wordBoundaries: project.scenes[0].wordTimings.length, voice: result.voice, resumed: Boolean(result.resumed), note: 'Real speech test only; no Flow footage or finished production is claimed.' }));
}
