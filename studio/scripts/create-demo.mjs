import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, buildFlowPack, exportProjectMarkdown, toSrt } from '../public/planner.mjs';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv.indexOf('--url');
const endpoint = new URL(argument >= 0 ? process.argv[argument + 1] : 'http://127.0.0.1:4317');
if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Demo creation requires the local studio HTTP URL.');
const projectId = 'demo-mulai-dua-menit';

// Original procedurally composed bed: 120 BPM, soft extended chords, a sparse
// bell figure and restrained drums. No recording, sample pack or generated voice.
function synthesizeBed(duration, sampleRate = 48000) {
  const length = Math.round(duration * sampleRate), channels = [new Float32Array(length), new Float32Array(length)];
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 69]];
  const frequency = (note) => 440 * 2 ** ((note - 69) / 12);
  const chordFrequencies = chords.map((chord) => chord.map(frequency));
  const melody = [0, 2, 1, 3, 2, 1, 3, 2];
  const tau = Math.PI * 2;
  let seed = 0x4d4f5449, previousNoise = 0, peak = 0;
  const tone = (frequencies, time, side) => frequencies.reduce((sum, f, note) => sum + Math.sin(tau * f * (1 + side * 0.0017) * time + note * 0.4) * 0.017, 0);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate, chordIndex = Math.floor(t / 4) % chords.length, chordLocal = t % 4;
    const blend = Math.min(1, chordLocal / 0.45), previousChord = (chordIndex + chords.length - 1) % chords.length;
    const beat = t % 0.5, eighth = t % 0.25, beatIndex = Math.floor(t / 0.5), eighthIndex = Math.floor(t / 0.25);
    const fade = Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (duration - t) / 1.6));
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 0xffffffff * 2 - 1, highNoise = noise - previousNoise; previousNoise = noise;
    const kick = Math.sin(tau * (48 * beat + 2.5 * (1 - Math.exp(-beat * 32)))) * Math.exp(-beat * 19) * 0.075;
    const snare = beatIndex % 4 === 1 || beatIndex % 4 === 3 ? noise * Math.exp(-beat * 34) * 0.018 : 0;
    const hat = highNoise * Math.exp(-eighth * 100) * (eighthIndex % 2 ? 0.004 : 0.0025);
    const bass = Math.sin(tau * frequency(chords[chordIndex][0] - 12) * t) * 0.032 * (1 - Math.exp(-beat * 70)) * Math.exp(-beat * 3.8);
    const note = frequency(chords[chordIndex][melody[Math.floor(t / 0.5) % melody.length]] + 12);
    const bellEnvelope = Math.exp(-beat * 7) * Math.min(1, beat / 0.005);
    const bell = (Math.sin(tau * note * beat) + Math.sin(tau * note * 2 * beat) * 0.15) * bellEnvelope * 0.018;
    for (let side = 0; side < 2; side++) {
      const pad = tone(chordFrequencies[chordIndex], t, side) * blend + tone(chordFrequencies[previousChord], t, side) * (1 - blend);
      const value = (pad + bass + kick + snare + hat + bell * (side ? 0.83 : 1)) * fade;
      channels[side][i] = value; peak = Math.max(peak, Math.abs(value));
    }
  }
  const wav = Buffer.alloc(44 + length * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 4, 40);
  const gain = 0.32 / (peak || 1);
  for (let i = 0; i < length; i++) for (let side = 0; side < 2; side++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[side][i] * gain)) * 32767), 44 + i * 4 + side * 2);
  return wav;
}
async function request(route, options) {
  const response = await fetch(new URL(route, endpoint), options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Studio request failed (${response.status}).`);
  return result;
}

await request('/api/health');
const project = createProject({ topic: 'Berhenti menunggu motivasi. Mulai dari dua menit.', audience: 'Anak muda yang ingin mulai konsisten', tone: 'Hangat & tegas', style: 'kinetic', duration: 30, aspectRatio: '9:16', fps: 30, clipDuration: 6 });
project.id = projectId;
project.title = 'Mulai dari Dua Menit';
project.captions = true;
project.musicVolume = 0.35;
const bed = synthesizeBed(project.brief.duration);
const music = await request('/api/assets?name=motif-original-ambient-120bpm.wav', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: bed });
project.musicAssetId = music.id;
project.voiceoverAssetId = null;
project.assets = [music];
const saved = await request('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
const exampleDir = path.join(studioDir, 'examples', 'mulai-dua-menit');
await fs.mkdir(exampleDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(exampleDir, 'project.json'), JSON.stringify(saved.project, null, 2) + '\n'),
  fs.writeFile(path.join(exampleDir, 'voiceover.txt'), project.scenes.map((scene) => scene.voiceover).join('\n\n') + '\n'),
  fs.writeFile(path.join(exampleDir, 'production.md'), exportProjectMarkdown(project) + '\n'),
  fs.writeFile(path.join(exampleDir, 'flow-prompts.md'), buildFlowPack(project) + '\n'),
  fs.writeFile(path.join(exampleDir, 'captions.srt'), toSrt(project)),
  fs.writeFile(path.join(exampleDir, 'ASSETS.md'), `# Example media\n\nThe original 30-second, 120 BPM music bed was synthesized by \`studio/scripts/create-demo.mjs\`. It uses no samples or recorded voice. The WAV is stored in this computer's local studio asset directory and referenced by \`project.json\`; the example folder does not duplicate that file.\n\nMusic asset ID: \`${music.id}\`.\n\nOpen the saved **Mulai dari Dua Menit** project in the studio to edit or export. The provided voiceover is a text script; this demo does not contain a spoken recording. To rebuild media on another computer, start its studio and run \`node scripts/create-demo.mjs\`. That command intentionally refreshes only the stable demo project \`${projectId}\`.\n`),
]);
console.log(JSON.stringify({ projectId, title: project.title, url: endpoint.origin, exampleDir, musicAssetId: music.id, musicBytes: bed.length, duration: project.brief.duration, scenes: project.scenes.length, note: 'Original music and captions included; narration supplied as editable text only.' }, null, 2));
