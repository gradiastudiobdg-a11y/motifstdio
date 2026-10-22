import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { finishVideo, finishVideoFixture, getReadiness, parseMediaMetadata } from '../finish-video-core.mjs';
import { findFfmpeg } from '../../render.mjs';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
function run(executable, args) {
  return new Promise((resolve, reject) => { const child = spawn(executable, args, { shell: false, windowsHide: true }); let errors = ''; child.stderr.on('data', (chunk) => { errors += chunk; }); child.stdout.resume(); child.once('error', reject); child.once('close', (code) => code === 0 ? resolve(errors) : reject(new Error(errors))); });
}
test('8s local fixture validates the actual 1080×1920 canvas finishing pipeline, audio mix, captions and completion gate', { timeout: 180000 }, async (t) => {
  const ffmpegPath = await findFfmpeg(studioDir), readiness = await getReadiness();
  if (!ffmpegPath || !readiness.ready) { t.skip('Install local FFmpeg/native canvas to run actual rendering integration.'); return; }
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-finish-fixture-'));
  t.after(() => fs.rm(jobDir, { recursive: true, force: true }));
  const footage = path.join(jobDir, 'LOCAL-TEST-FIXTURE-not-Flow.mp4'), voice = path.join(jobDir, 'LOCAL-audio-fixture-not-spoken.wav');
  // A conspicuous color change distinguishes actual footage from the studio's
  // background gradient, and catches reuse of a stale decoded native Image.
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xE02090:s=270x480:r=30:d=4[first];color=c=0x20E0B0:s=270x480:r=30:d=4[second];[first][second]concat=n=2:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', footage]);
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=8', '-af', 'volume=0.4', '-y', voice]);
  const assets = { footage: { id: 'footage', path: footage, type: 'video/mp4', source: { provider: 'test-fixture', testFixture: true } }, voice: { id: 'voice', path: voice, type: 'audio/wav', source: { provider: 'test-fixture', testFixture: true } } };
  const project = { version: 1, id: 'fixture-only', title: 'Local renderer fixture — not a Flow production', brief: { topic: 'Test only', style: 'kinetic', accent: '#D6FF63', duration: 8, aspectRatio: '9:16', fps: 30 }, captions: true, voiceoverAssetId: 'voice', musicVolume: 0.16, scenes: [{ id: 'scene-01', label: 'Fixture', duration: 8, headline: 'SATU LANGKAH.', voiceover: 'Satu langkah kecil hari ini.', visual: 'Local test image only.', motion: 'Fixture.', transition: 'cut', assetId: 'footage', trimStart: 0, wordTimings: [{ text: 'Satu', start: 0.3, end: 0.9 }, { text: 'langkah', start: 1, end: 1.7 }, { text: 'kecil', start: 1.8, end: 2.4 }, { text: 'hari', start: 2.5, end: 3 }, { text: 'ini.', start: 3.1, end: 3.6 }] }] };
  const input = { project, jobDir, ffmpegPath, getAsset: async (id) => assets[id] };
  await assert.rejects(finishVideo(input), /actual Google Flow/);
  const silentVoice = path.join(jobDir, 'SILENT-test-fixture.wav');
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '8', '-c:a', 'pcm_s16le', '-y', silentVoice]);
  await assert.rejects(finishVideoFixture({ ...input, getAsset: async (id) => id === 'voice' ? { ...assets.voice, path: silentVoice } : assets[id] }), /voiceover track is silent/, 'Music must never conceal a missing spoken-audio track.');
  const output = await finishVideoFixture(input);
  assert.equal(output.hasVoiceover, true); assert.equal(output.hasMusic, true); assert.equal(output.captionsBurned, true);
  assert.equal(output.validation.testFixture, true); assert.equal(output.validation.sourceChecks[0].provider, 'test-fixture');
  assert.equal(output.validation.frames, 240); assert.equal(output.validation.width, 1080); assert.equal(output.validation.height, 1920);
  assert.ok((await fs.stat(output.path)).size > 10000);
  const decoded = await run(ffmpegPath, ['-hide_banner', '-i', output.path, '-af', 'volumedetect', '-f', 'null', '-']);
  const metadata = parseMediaMetadata(decoded); assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1920); assert.equal(metadata.fps, 30); assert.ok(Math.abs(metadata.duration - 8) <= 0.08); assert.equal(metadata.audio, true); assert.ok(metadata.meanVolume > -45);
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  async function finalPixelAt(time) {
    const filename = path.join(jobDir, `qa-final-${time}.png`);
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', output.path, '-frames:v', '1', '-y', filename]);
    const decodedImage = await loadImage(filename); await decodedImage.decode();
    const inspection = createCanvas(1080, 1920), context = inspection.getContext('2d'); context.drawImage(decodedImage, 0, 0);
    // The center stays away from typography, captions, guides and motion accents.
    return [...context.getImageData(540, 960, 1, 1).data];
  }
  const firstPixel = await finalPixelAt(2), secondPixel = await finalPixelAt(6);
  assert.ok(firstPixel[0] > 120 && firstPixel[1] < 60 && firstPixel[2] > 60, `Early final frame must retain magenta source footage, received RGBA ${firstPixel}.`);
  assert.ok(secondPixel[1] > 120 && secondPixel[0] < 60 && secondPixel[2] > 60, `Later final frame must retain the changed mint footage, received RGBA ${secondPixel}.`);
  assert.ok(Math.abs(firstPixel[0] - secondPixel[0]) > 100 && Math.abs(firstPixel[1] - secondPixel[1]) > 100, 'The decoded footage must update across time instead of displaying a stale native Image.');
  const kai=structuredClone(project);kai.brief.style='kai';kai.captions=false;kai.voiceoverAssetId=null;kai.musicVolume=0;
  kai.scenes[0].voiceover='';kai.scenes[0].visual='Kai places paper and taps the box.';delete kai.scenes[0].wordTimings;
  const kaiInput={...input,project:kai,jobDir:path.join(jobDir,'kai-local-fixture')};
  await assert.rejects(finishVideo(kaiInput),/actual Google Flow/);
  const kaiOutput=await finishVideoFixture(kaiInput);
  assert.equal(kaiOutput.hasVoiceover,false);assert.equal(kaiOutput.hasSoundDesign,true);assert.equal(kaiOutput.captionsBurned,false);assert.equal(kaiOutput.hasMusic,false);
  assert.equal(kaiOutput.validation.testFixture,true);assert.equal(kaiOutput.validation.voiceover,null);
  assert.ok(kaiOutput.validation.soundDesign.cues.length>0);assert.ok(kaiOutput.validation.output.meanVolume>-45);
  assert.equal((await fs.readdir(jobDir)).filter((name) => name.startsWith('finish-') && name !== 'finish-validation.json').length, 0, 'Only validated generated frames should be cleaned.');
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(finishVideoFixture({ ...input, signal: aborted.signal }), /cancelled/);
  const duringRender = new AbortController(), timer = setTimeout(() => duringRender.abort(), 250);
  try { await assert.rejects(finishVideoFixture({ ...input, jobDir: path.join(jobDir, 'cancelled-render'), signal: duringRender.signal }), /cancelled/); } finally { clearTimeout(timer); }
  await assert.rejects(fs.stat(path.join(jobDir, 'cancelled-render', 'final.mp4')), /ENOENT/);
  const tooLong = structuredClone(project); tooLong.scenes[0].trimStart = 2; await assert.rejects(finishVideoFixture({ ...input, project: tooLong }), /shorter than its scene/);
  const noTiming = structuredClone(project); delete noTiming.scenes[0].wordTimings; await assert.rejects(finishVideoFixture({ ...input, project: noTiming }), /word timings/);
  t.diagnostic(`Final MP4 retained changing source pixels: magenta RGBA ${firstPixel}, mint RGBA ${secondPixel}.`);
  t.diagnostic('Real local H.264/AAC output decoded with audible test audio and original music. This fixture does not test Flow or spoken TTS.');
});
