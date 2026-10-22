import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { drawFrame, sceneAt } from '../public/motion.mjs';
import { validateProject, within } from '../render.mjs';
import { createMusicBed } from './finish-musicbed.mjs';
import { createFoleyTrack } from './finish-foley.mjs';
import { fileURLToPath } from 'node:url';

let canvasImport;
const canvasModule = () => canvasImport ||= import('@napi-rs/canvas').then(module => {
  for (const [file, family] of [['DMSans-Variable.ttf', 'DM Sans'], ['IBMPlexMono-Medium.ttf', 'IBM Plex Mono']]) {
    if (!module.GlobalFonts.registerFromPath(fileURLToPath(new URL(`../public/brand/fonts/${file}`, import.meta.url)), family)) throw new Error(`Missing brand font: ${family}`);
  }
  return module;
});
const MAX_FRAME_BYTES = 2 * 1024 ** 3;
const safeMessage = (message) => String(message || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[account]').slice(-3500);
function check(signal) { if (signal?.aborted) throw Object.assign(new Error('Video finishing was cancelled.'), { name: 'AbortError' }); }
export async function getReadiness() {
  try { await canvasModule(); return { ready: true, detail: 'Native canvas installed. The server checks FFmpeg separately.' }; }
  catch { return { ready: false, detail: 'Install the canvas dependency in studio/automation before automatic finishing.' }; }
}
function childProcess(executable, args, signal) {
  check(signal);
  const child = spawn(executable, ['-nostdin', ...args], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); if (stderr.length > 64000) stderr = stderr.slice(0, 16000) + '\n[progress truncated]\n' + stderr.slice(-32000); });
  const abort = () => child.kill(); signal?.addEventListener('abort', abort, { once: true });
  const completion = new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: -1, error, stderr }));
    child.once('close', (code) => resolve({ code, stderr }));
  }).finally(() => signal?.removeEventListener('abort', abort));
  return { child, completion };
}
async function execute(executable, args, signal) {
  const { child, completion } = childProcess(executable, args, signal); let stdout = '';
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-10000); });
  const result = await completion; check(signal);
  if (result.code !== 0) throw new Error(`FFmpeg failed: ${safeMessage(result.error?.message || result.stderr)}`);
  return { ...result, stdout };
}
export function parseMediaMetadata(stderr) {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const video = /Video:[^\r\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  const fps = /Video:[^\r\n]*?\b(\d+(?:\.\d+)?)\s+fps\b/.exec(stderr);
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?|-inf)\s*dB/.exec(stderr), max = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf)\s*dB/.exec(stderr);
  return { duration: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null, width: video ? Number(video[1]) : null, height: video ? Number(video[2]) : null, fps: fps ? Number(fps[1]) : null, audio: /Audio:/.test(stderr), meanVolume: mean ? Number(mean[1]) : null, maxVolume: max ? Number(max[1]) : null };
}
async function probe(ffmpegPath, filename, signal) {
  const result = await execute(ffmpegPath, ['-hide_banner', '-loglevel', 'info', '-i', filename, '-t', '0', '-f', 'null', '-'], signal);
  return parseMediaMetadata(result.stderr);
}
async function* decodeFrames(ffmpegPath, filename, start, count, { width, height, fps }, signal) {
  const { child, completion } = childProcess(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-i', filename, '-an', '-vf', `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`, '-frames:v', String(count), '-c:v', 'mjpeg', '-q:v', '2', '-f', 'image2pipe', 'pipe:1'], signal);
  let pending = Buffer.alloc(0), decoded = 0;
  try {
    for await (const chunk of child.stdout) {
      check(signal); pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      if (pending.length > 16 * 1024 * 1024) throw new Error('Decoded frame exceeds the safe image buffer limit.');
      let end;
      while ((end = pending.indexOf(Buffer.from([0xff, 0xd9]))) >= 0) {
        const image = pending.subarray(0, end + 2); pending = pending.subarray(end + 2);
        if (image[0] !== 0xff || image[1] !== 0xd8 || ++decoded > count) throw new Error('FFmpeg returned an unexpected JPEG frame sequence.');
        yield image;
      }
    }
    const result = await completion; check(signal);
    if (result.code !== 0) throw new Error(`Flow footage decoding failed: ${safeMessage(result.error?.message || result.stderr)}`);
    if (decoded !== count || pending.length) throw new Error(`Flow clip only yielded ${decoded}/${count} required frames; finishing stopped instead of holding a missing frame.`);
  } finally { if (child.exitCode === null) child.kill(); await completion; }
}
function validateTimings(project) {
  let sceneStart = 0, finalWordEnd = 0;
  for (const scene of project.scenes) {
    if (!Array.isArray(scene.wordTimings) || !scene.wordTimings.length) throw new Error('Every scene needs actual narration word timings before automatic finishing.');
    let last = 0;
    for (const word of scene.wordTimings) {
      if (typeof word.text !== 'string' || !word.text.trim() || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start || word.start < last - 0.05 || word.end > scene.duration + 0.06) throw new Error('Narration word timings do not fit the editable scene timeline.');
      last = word.start; finalWordEnd = Math.max(finalWordEnd, sceneStart + word.end);
    }
    sceneStart += scene.duration;
  }
  return finalWordEnd;
}
async function runFinish({ project, jobDir, signal, ffmpegPath, getAsset }, fixture = false) {
  check(signal);
  const { project: editable, duration } = validateProject(project);
  const kai = editable.brief?.style === 'kai';
  if (kai && (editable.scenes.some(s => s.voiceover?.trim()) || editable.voiceoverAssetId || editable.captions === true)) throw new Error('Kai productions use sound design without narration or narration captions.');
  if (editable.brief?.aspectRatio !== '9:16' || Math.abs(duration - editable.brief.duration) > 0.002) throw new Error('Automatic finishing requires exact-duration 9:16 production data.');
  if (!kai && editable.captions === false) throw new Error('Automatic finished productions require burned captions.');
  if (!ffmpegPath || typeof getAsset !== 'function') throw Object.assign(new Error('FFmpeg and the local asset store are required.'), { code: 'SETUP_REQUIRED' });
  const { createCanvas, Image } = await canvasModule();
  const finalWordEnd = kai ? duration : validateTimings(editable), width = 1080, height = 1920, fps = 30, totalFrames = Math.round(duration * fps);
  let soundDesign;
  let voice;
  if (kai) {
    await fs.mkdir(jobDir, { recursive: true }); soundDesign = createFoleyTrack(editable);
    const filename = within(jobDir, path.join(jobDir, 'kai-sound-design.wav'));
    await fs.writeFile(filename, soundDesign.wav); voice = { path: filename, type: 'audio/wav' };
  } else voice = await getAsset(editable.voiceoverAssetId);
  if (!voice?.path || !voice.type?.startsWith('audio/')) throw new Error('An actual uploaded/synthesized voiceover track is required.');
  const voiceDecoded = await execute(ffmpegPath, ['-hide_banner', '-loglevel', 'info', '-i', voice.path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], signal);
  const voiceInfo = parseMediaMetadata(voiceDecoded.stderr);
  if (!voiceInfo.audio || !Number.isFinite(voiceInfo.duration) || voiceInfo.duration + 0.08 < finalWordEnd) throw new Error('The voiceover audio is missing or shorter than its actual narration timings.');
  if (!Number.isFinite(voiceInfo.meanVolume) || !Number.isFinite(voiceInfo.maxVolume) || voiceInfo.meanVolume <= -65 || voiceInfo.maxVolume <= -55) throw new Error('The actual voiceover track is silent or inaudible. Music alone cannot complete a production.');
  const sources = [];
  for (const scene of editable.scenes) {
    const asset = await getAsset(scene.assetId);
    const permitted = fixture ? asset?.source?.provider === 'test-fixture' : asset?.source?.provider === 'google-flow' && asset.source.testFixture !== true;
    if (!asset?.path || !permitted || !asset.type?.startsWith('video/')) throw new Error('Every production scene must use actual Google Flow bridge footage; local fixtures are not a completed Flow production.');
    const metadata = await probe(ffmpegPath, asset.path, signal);
    if (!metadata.width || !metadata.height || Math.abs(metadata.width / metadata.height - 9 / 16) > 0.012) throw new Error('Every Flow source must be portrait 9:16 before finishing.');
    if (!Number.isFinite(metadata.duration) || metadata.duration + 0.035 < scene.duration + (scene.trimStart || 0)) throw new Error('A Flow source is shorter than its scene and trim. Generate sufficient footage before finishing.');
    sources.push({ asset, metadata });
  }
  const resolvedJob = path.resolve(jobDir); await fs.mkdir(resolvedJob, { recursive: true });
  const runDir = within(resolvedJob, path.join(resolvedJob, `finish-${randomUUID()}`)); await fs.mkdir(runDir);
  const assignments = editable.scenes.map(() => ({ start: null, count: 0, firstLocal: 0 }));
  for (let frame = 0; frame < totalFrames; frame++) { const active = sceneAt(editable, frame / fps), assignment = assignments[active.index]; if (assignment.start === null) { assignment.start = frame; assignment.firstLocal = active.local; } assignment.count++; }
  const canvas = createCanvas(width, height), image = new Image(); let workBytes = 0;
  for (const [index, scene] of editable.scenes.entries()) {
    const assignment = assignments[index]; let localFrame = 0;
    for await (const jpeg of decodeFrames(ffmpegPath, sources[index].asset.path, (scene.trimStart || 0) + assignment.firstLocal, assignment.count, { width, height, fps }, signal)) {
      check(signal); image.src = jpeg; await image.decode(); check(signal);
      if (!image.complete || !image.width || !image.height) throw new Error('The decoded Flow frame is not drawable; finishing stopped.');
      const frame = assignment.start + localFrame++, time = frame / fps;
      drawFrame(canvas, editable, time, { media: image, captions: !kai });
      const output = await canvas.encode('jpeg', 90); check(signal); workBytes += output.length;
      if (workBytes > MAX_FRAME_BYTES) throw new Error('Finishing frame storage reached 2 GB. Use a shorter production before retrying.');
      await fs.writeFile(within(runDir, path.join(runDir, `frame-${String(frame).padStart(6, '0')}.jpg`)), output, { flag: 'wx' });
    }
  }
  check(signal);
  let music = editable.musicAssetId ? await getAsset(editable.musicAssetId) : null;
  const musicOriginal = !music;
  if (music && (!music.path || !music.type?.startsWith('audio/'))) throw new Error('The music reference is not an audio asset.');
  if (!music) { const filename = within(resolvedJob, path.join(resolvedJob, 'original-music-bed.wav')); await fs.writeFile(filename, createMusicBed(duration)); music = { path: filename, type: 'audio/wav' }; }
  const volume = editable.musicVolume ?? (kai ? 0 : 0.16);
  if (!Number.isFinite(volume) || volume < 0 || (!kai && volume === 0) || volume > 1) throw new Error('Invalid music level; narrated legacy productions require music.');
  const candidate = within(runDir, path.join(runDir, 'output.mp4'));
  const audioFilter = kai ? `[1:a]loudnorm=I=-20:TP=-2:LRA=9,aresample=48000:ocl=stereo,apad,atrim=duration=${duration}[foley];[2:a]aresample=48000:ocl=stereo,volume=${volume},atrim=duration=${duration},afade=t=in:d=0.4,afade=t=out:st=${Math.max(0,duration-.8)}:d=0.8[music];[foley][music]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9:level=0,atrim=duration=${duration}[mix]` : `[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000:ocl=stereo,apad,atrim=duration=${duration},asplit=2[voice][side];[2:a]aresample=48000:ocl=stereo,volume=${volume},atrim=duration=${duration},afade=t=in:d=0.35,afade=t=out:st=${Math.max(0, duration - 0.8)}:d=0.8[music];[music][side]sidechaincompress=threshold=0.025:ratio=6:attack=20:release=500[bed];[voice][bed]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9:level=0,atrim=duration=${duration}[mix]`;
  await execute(ffmpegPath, ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps), '-start_number', '0', '-i', path.join(runDir, 'frame-%06d.jpg'), '-i', voice.path, '-stream_loop', '-1', '-i', music.path, '-filter_complex', audioFilter, '-map', '0:v:0', '-map', '[mix]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'setsar=1', '-r', String(fps), '-t', String(duration), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', candidate], signal);
  // Decode the whole real file, not just its container header, and measure the
  // actual mixed audio. A silent track or partial encode never becomes complete.
  const decoded = await execute(ffmpegPath, ['-hide_banner', '-loglevel', 'info', '-i', candidate, '-af', 'volumedetect', '-f', 'null', '-'], signal);
  const finalInfo = parseMediaMetadata(decoded.stderr);
  if (finalInfo.width !== width || finalInfo.height !== height || !finalInfo.audio || !Number.isFinite(finalInfo.duration) || Math.abs(finalInfo.duration - duration) > 0.08 || Math.abs(finalInfo.fps - fps) > 0.01 || !/Video:\s*h264/.test(decoded.stderr) || !/Audio:\s*aac/.test(decoded.stderr)) throw new Error('Final MP4 failed the H.264/AAC, duration, portrait, or frame-rate validation.');
  if (!Number.isFinite(finalInfo.meanVolume) || finalInfo.meanVolume <= -45 || !Number.isFinite(finalInfo.maxVolume) || finalInfo.maxVolume <= -30) throw new Error('The final MP4 mix is silent or too quiet; completion was refused.');
  check(signal);
  const finalPath = within(resolvedJob, path.join(resolvedJob, 'final.mp4')); await fs.rename(candidate, finalPath);
  const report = { version: 1, testFixture: fixture, duration, width, height, fps, frames: totalFrames, sourceChecks: sources.map(({ asset, metadata }, index) => ({ sceneId: editable.scenes[index].id, assetId: asset.id, provider: asset.source.provider, ...metadata })), voiceover: kai ? null : voiceInfo, soundDesign: kai ? { origin: soundDesign.origin, timing: soundDesign.timing, cues: soundDesign.cues, audio: voiceInfo } : null, output: finalInfo, originalMusic: musicOriginal && volume > 0, actualVoiceover: !kai, captionsBurned: !kai, canvas: 'shared public/motion.mjs drawFrame' };
  await fs.writeFile(within(resolvedJob, path.join(resolvedJob, 'finish-validation.json')), JSON.stringify(report, null, 2));
  // Only known generated JPEGs from this resolved run directory are removed.
  for (let frame = 0; frame < totalFrames; frame++) await fs.unlink(within(runDir, path.join(runDir, `frame-${String(frame).padStart(6, '0')}.jpg`)));
  await fs.rmdir(runDir);
  return { path: finalPath, hasVoiceover: !kai, hasSoundDesign: kai, hasMusic: volume > 0, captionsBurned: !kai, validation: report };
}
export const finishVideo = (input) => runFinish(input, false);
// Explicit local integration-test route. The production entry above always
// rejects these assets, and reports retain testFixture:true/provider:test-fixture.
export const finishVideoFixture = (input) => runFinish(input, true);
