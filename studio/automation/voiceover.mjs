import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findFfmpeg } from '../render.mjs';
import { validateProject } from '../public/planner.mjs';
import { adapterError, atomicJson, automationDir, checkAbort, encodeWav, exists, findPython, hash, parseWav, pythonEnvironment, readJson, runCommand, studioDir } from './common.mjs';

const bridgePath = path.join(automationDir, 'edge-voice.py');
const sampleRate = 48000;
let readinessCache, readinessInFlight, voiceCache;
const voiceName = value => ({ ardi: 'id-ID-ArdiNeural', gadis: 'id-ID-GadisNeural', 'id-ID-ArdiNeural': 'id-ID-ArdiNeural', 'id-ID-GadisNeural': 'id-ID-GadisNeural' }[String(value || 'ardi').toLowerCase()] || (['id-ID-ArdiNeural', 'id-ID-GadisNeural'].includes(value) ? value : null));

async function pythonAction(request, { signal, run = runCommand, python } = {}) {
  const result = await run(python || await findPython(), [bridgePath], { env: pythonEnvironment(), input: JSON.stringify(request), signal, timeoutMs: request.action === 'synthesize' ? 90000 : 35000 });
  try { return JSON.parse(result.stdout); } catch { throw adapterError('Layanan TTS mengirim hasil yang tidak valid.', 'VOICE_FAILED'); }
}
async function availableVoices(options = {}) {
  if (voiceCache && Date.now() - voiceCache.at < 5 * 60000) return voiceCache.voices;
  const result = await pythonAction({ action: 'voices' }, options);
  if (!Array.isArray(result.voices) || !result.voices.some(item => item.locale === 'id-ID')) throw adapterError('Suara Bahasa Indonesia belum tersedia dari layanan TTS.', 'VOICE_UNAVAILABLE');
  voiceCache = { at: Date.now(), voices: result.voices }; return result.voices;
}
export async function getReadiness({ refresh = false } = {}) {
  if (!refresh && readinessCache && Date.now() - readinessCache.at < 60000) return readinessCache.value;
  if (readinessInFlight) return readinessInFlight;
  readinessInFlight = (async () => {
    let value;
    try {
      const python = await findPython();
      const dependency = await pythonAction({ action: 'probe' }, { python });
      const voices = await availableVoices({ python });
      value = { ready: true, detail: `edge-tts ${dependency.version}; ${voices.map(item => item.name).join(', ')} terverifikasi online.`, voices: voices.map(item => item.name) };
    } catch (error) { value = { ready: false, detail: `Narasi Indonesia belum siap: ${error.message}`, code: /No module named|Python belum/.test(error.message) ? 'SETUP_REQUIRED' : 'VOICE_UNAVAILABLE' }; }
    readinessCache = { at: Date.now(), value }; return value;
  })();
  try { return await readinessInFlight; } finally { readinessInFlight = null; }
}

export function fittedWordTimings(words, tempo, delay, duration) {
  if (!Array.isArray(words) || !words.length || !Number.isFinite(tempo) || tempo <= 0 || !Number.isFinite(delay) || delay < 0 || !Number.isFinite(duration) || duration <= 0) throw adapterError('Word timing TTS tidak lengkap.', 'VOICE_FAILED');
  let previous = 0, previousRawEnd = 0;
  return words.map(word => {
    if (!word || typeof word.text !== 'string' || !word.text.trim() || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start || word.start < previousRawEnd - .002) throw adapterError('Word boundary TTS tidak valid atau tidak berurutan.', 'VOICE_FAILED');
    const rawStart = word.start / tempo + delay, rawEnd = word.end / tempo + delay;
    if (rawStart >= duration || rawEnd > duration + .002) throw adapterError('Word boundary melewati akhir scene; narasi tidak boleh dipotong diam-diam.', 'VOICE_TIMING');
    const start = Math.round(Math.max(previous, rawStart) * 10000) / 10000;
    const end = Math.round(Math.min(duration, rawEnd) * 10000) / 10000;
    if (end <= start) throw adapterError('Word boundary terlalu pendek atau bertumpuk.', 'VOICE_TIMING');
    previous = end; previousRawEnd = word.end;
    return { text: word.text, start, end };
  });
}

export async function synthesizeVoiceover({ project, jobDir, signal, voice = 'id-ID-ArdiNeural', ffmpegPath, run = runCommand, python: injectedPython } = {}) {
  checkAbort(signal);
  const errors = validateProject(project);
  if (errors.length) throw adapterError(`Project narasi tidak valid: ${errors[0]}`, 'INVALID_PLAN');
  if (project.brief.aspectRatio !== '9:16') throw adapterError('Narasi produksi otomatis memerlukan project 9:16.', 'INVALID_PLAN');
  if (!jobDir) throw adapterError('Folder job diperlukan untuk membuat narasi.');
  const selectedVoice = voiceName(voice);
  if (!selectedVoice) throw adapterError('Pilih suara Indonesia id-ID-ArdiNeural atau id-ID-GadisNeural. Suara bahasa lain tidak digunakan.', 'VOICE_UNAVAILABLE');
  const signature = hash({ engine: 'edge-tts-wordboundary-v1', voice: selectedVoice, scenes: project.scenes.map(({ id, voiceover, duration }) => ({ id, voiceover, duration })) });
  const folder = path.join(jobDir, 'voice'), outputPath = path.join(folder, 'voiceover.wav'), manifestPath = path.join(folder, 'manifest.json');
  await fs.mkdir(folder, { recursive: true });
  const cached = await readJson(manifestPath);
  if (cached?.signature === signature && await exists(outputPath)) {
    try {
      const wav = parseWav(await fs.readFile(outputPath));
      if (Math.abs(wav.duration - project.brief.duration) < .001 && cached.wordTimingsByScene && project.scenes.every(scene => cached.wordTimingsByScene[scene.id]?.length)) {
        const restoredTimings = Object.fromEntries(project.scenes.map(scene => [scene.id, fittedWordTimings(cached.wordTimingsByScene[scene.id], 1, 0, scene.duration)]));
        for (const scene of project.scenes) scene.wordTimings = restoredTimings[scene.id];
        return { path: outputPath, type: 'audio/wav', name: `narasi-${selectedVoice}.wav`, voice: selectedVoice, hasSpeech: true, wordTimingsByScene: restoredTimings, resumed: true };
      }
    } catch { /* Recreate an incomplete or invalid audio file; never substitute silence. */ }
  }
  const python = injectedPython || await findPython();
  const voices = await availableVoices({ signal, run, python });
  if (!voices.some(item => item.name === selectedVoice && item.locale === 'id-ID')) throw adapterError(`Suara ${selectedVoice} tidak tersedia saat ini.`, 'VOICE_UNAVAILABLE');
  const ffmpeg = ffmpegPath || await findFfmpeg(studioDir);
  if (!ffmpeg) throw adapterError('FFmpeg diperlukan untuk menyusun narasi per scene.', 'SETUP_REQUIRED');
  const chunks = [], wordTimingsByScene = {};
  for (const [index, scene] of project.scenes.entries()) {
    checkAbort(signal);
    const prefix = path.join(folder, `scene-${String(index + 1).padStart(2, '0')}`);
    const source = `${prefix}.mp3`, metadataFile = `${prefix}.json`, rawWav = `${prefix}-raw.wav`, fittedWav = `${prefix}-fit.wav`;
    const sceneSignature = hash({ voice: selectedVoice, text: scene.voiceover, version: 1 });
    let metadata = await readJson(metadataFile);
    if (metadata?.signature !== sceneSignature || !Array.isArray(metadata.words) || !metadata.words.length || !await exists(source)) {
      await pythonAction({ action: 'synthesize', text: scene.voiceover, voice: selectedVoice, output: source, metadata: metadataFile }, { signal, run, python });
      metadata = await readJson(metadataFile);
      if (!metadata?.words?.length) throw adapterError(`TTS scene ${index + 1} tidak menyediakan timing kata.`, 'VOICE_FAILED');
      metadata.signature = sceneSignature; await atomicJson(metadataFile, metadata);
    }
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-vn', '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', rawWav], { signal, timeoutMs: 30000 });
    const raw = parseWav(await fs.readFile(rawWav));
    const lead = .10, usable = Math.max(.15, scene.duration - lead - .08), tempo = Math.max(1, raw.duration / usable);
    if (tempo > 1.28) throw adapterError(`Naskah scene ${index + 1} terlalu panjang untuk ${scene.duration} detik. Ringkas narasi sebelum melanjutkan.`, 'VOICE_TIMING');
    const targetSamples = Math.round(scene.duration * sampleRate);
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', rawWav, '-af', `atempo=${tempo.toFixed(8)},adelay=100,apad,atrim=end_sample=${targetSamples},asetpts=PTS-STARTPTS`, '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', fittedWav], { signal, timeoutMs: 30000 });
    const fitted = parseWav(await fs.readFile(fittedWav));
    if (fitted.data.length !== targetSamples * 2) throw adapterError(`Durasi WAV scene ${index + 1} tidak cocok dengan timeline.`, 'VOICE_TIMING');
    scene.wordTimings = fittedWordTimings(metadata.words, tempo, lead, scene.duration);
    wordTimingsByScene[scene.id] = scene.wordTimings;
    chunks.push(fitted.data);
  }
  // Concatenating PCM avoids per-file encoder delay and keeps scene boundaries exact.
  await fs.writeFile(outputPath, encodeWav(Buffer.concat(chunks), sampleRate, 1));
  const final = parseWav(await fs.readFile(outputPath));
  if (Math.abs(final.duration - project.brief.duration) > .002) throw adapterError('Narasi akhir tidak cocok dengan durasi project.', 'VOICE_TIMING');
  await atomicJson(manifestPath, { signature, voice: selectedVoice, duration: final.duration, wordTimingsByScene, createdAt: new Date().toISOString() });
  return { path: outputPath, type: 'audio/wav', name: `narasi-${selectedVoice}.wav`, voice: selectedVoice, hasSpeech: true, wordTimingsByScene };
}
