import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server.mjs';
import { findFfmpeg, jpegDimensions } from '../render.mjs';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = { version: 1, title: 'Backend smoke test', brief: { duration: 0.5, fps: 2, aspectRatio: '1:1', topic: 'Start small', style: 'kinetic', accent: '#ff833e' }, scenes: [{ id: 'scene-1', label: 'Hook', duration: 0.5, headline: 'One step.', voiceover: 'Start today.', visual: 'kinetic', motion: 'spring', transition: 'cut', assetId: null, trimStart: 0 }], publishing: {} };
function run(executable, args) {
  return new Promise((resolve, reject) => {
    const process = spawn(executable, args, { windowsHide: true, shell: false });
    const chunks = []; let errors = '';
    process.stdout.on('data', (chunk) => chunks.push(chunk)); process.stderr.on('data', (chunk) => { errors += chunk; });
    process.once('error', reject); process.once('close', (code) => code === 0 ? resolve({ data: Buffer.concat(chunks), errors }) : reject(new Error(errors)));
  });
}
test('local studio stores projects, checks uploads/ranges, rejects unsafe requests, and encodes MP4', { timeout: 45000 }, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-studio-test-'));
  const app = await startServer({ port: 0, dataDir });
  t.after(async () => { app.renders.close(); app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  const jsonPost = (route, value, extra = {}) => fetch(app.url + route, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(value) });
  const health = await (await fetch(app.url + '/api/health')).json(); assert.equal(health.ok, true);
  assert.equal((await jsonPost('/api/projects', project, { origin: 'https://outside.example' })).status, 403);
  assert.equal((await jsonPost('/api/projects', { ...project, scenes: [] })).status, 400);
  const saveResponse = await jsonPost('/api/projects', project); assert.equal(saveResponse.status, 200);
  const saved = (await saveResponse.json()).project; assert.ok(saved.id);
  assert.equal((await (await fetch(app.url + `/api/projects/${saved.id}`)).json()).project.title, project.title);
  assert.equal((await (await fetch(app.url + '/api/projects')).json()).projects.length, 1);
  const updated = await jsonPost('/api/projects', { ...saved, title: 'Updated' }); assert.equal(updated.status, 200);
  assert.equal((await jsonPost('/api/projects', { ...project, id: '../../escape' })).status, 400);
  assert.equal((await jsonPost('/api/projects', { ...project, captions: 'yes' })).status, 400);
  assert.equal((await jsonPost('/api/projects', { ...project, assets: [{ id: 'foreign', name: 'remote.png', type: 'image/png', url: 'https://outside.example/image.png', size: 100 }] })).status, 400);
  assert.equal((await jsonPost('/api/projects', { ...project, voiceoverAssetId: 'missing-audio' })).status, 400);
  assert.equal((await fetch(app.url + '/api/assets', { method: 'POST', headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' })).status, 415);
  const media = Buffer.from('0123456789');
  const upload = await fetch(app.url + '/api/assets?name=example.mp3', { method: 'POST', headers: { 'content-type': 'audio/mpeg' }, body: media });
  assert.equal(upload.status, 201); const asset = await upload.json(); assert.equal(asset.size, 10); assert.equal(asset.name, 'example.mp3');
  const range = await fetch(app.url + asset.url, { headers: { range: 'bytes=2-5' } }); assert.equal(range.status, 206); assert.equal(await range.text(), '2345');
  assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
  const suffix = await fetch(app.url + asset.url, { headers: { range: 'bytes=-3' } }); assert.equal(await suffix.text(), '789');
  assert.equal((await fetch(app.url + asset.url, { headers: { range: 'bytes=999-1000' } })).status, 416);
  assert.equal((await fetch(app.url + '/api/assets/..%5csecret')).status, 404);
  assert.equal((await fetch(app.url + '/.studio/projects/secret.json')).status, 403);
  const ffmpeg = await findFfmpeg(studioDir);
  if (!ffmpeg) { t.diagnostic('FFmpeg unavailable; HTTP storage/security checks passed, encoding check skipped.'); return; }
  const generated = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x151b2c:s=64x64:d=1', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2pipe', 'pipe:1']);
  assert.deepEqual(jpegDimensions(generated.data), { width: 64, height: 64 });
  const audio = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-f', 'wav', 'pipe:1']);
  const audioAsset = await (await fetch(app.url + '/api/assets?name=voice.wav', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: audio.data })).json();
  const renderResponse = await jsonPost('/api/renders', { project: { ...project, voiceoverAssetId: audioAsset.id, musicAssetId: audioAsset.id }, width: 64, height: 64, fps: 2 });
  assert.equal(renderResponse.status, 201); const job = await renderResponse.json(); assert.equal(job.totalFrames, 1);
  assert.equal((await jsonPost(`/api/renders/${job.id}/finish`, {})).status, 400);
  assert.equal((await fetch(app.url + `/api/renders/${job.id}/frame?index=1`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: generated.data })).status, 400);
  const frame = await fetch(app.url + `/api/renders/${job.id}/frame?index=0`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: generated.data }); assert.equal(frame.status, 200);
  assert.equal((await jsonPost(`/api/renders/${job.id}/finish`, {})).status, 202);
  let result;
  for (let i = 0; i < 150; i++) { result = await (await fetch(app.url + `/api/renders/${job.id}`)).json(); if (!['capturing', 'encoding'].includes(result.status)) break; await delay(100); }
  assert.equal(result.status, 'complete', result.error); assert.equal(result.progress, 1);
  const download = await fetch(app.url + result.url); assert.equal(download.status, 200); assert.match(download.headers.get('content-type'), /video\/mp4/);
  const movie = Buffer.from(await download.arrayBuffer()); assert.ok(movie.length > 1000); assert.equal(movie.subarray(4, 8).toString(), 'ftyp');
  const output = path.join(dataDir, 'renders', job.id, 'output.mp4');
  const decoded = await run(ffmpeg, ['-hide_banner', '-i', output, '-f', 'null', '-']); assert.match(decoded.errors, /Video: h264/); assert.match(decoded.errors, /Audio: aac/);
  assert.equal((await fs.readdir(path.dirname(output))).filter((name) => name.endsWith('.jpg')).length, 0);
  const restored = await startServer({ port: 0, dataDir });
  try {
    assert.equal((await (await fetch(restored.url + `/api/renders/${job.id}`)).json()).status, 'complete');
    assert.equal((await fetch(restored.url + result.url, { method: 'HEAD' })).status, 200);
  } finally { restored.server.closeAllConnections(); await new Promise((resolve) => restored.server.close(resolve)); }
  const cancelled = await (await jsonPost('/api/renders', { project, width: 64, height: 64, fps: 2 })).json();
  await fetch(app.url + `/api/renders/${cancelled.id}/frame?index=0`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: generated.data });
  assert.equal((await (await jsonPost(`/api/renders/${cancelled.id}/cancel`, {})).json()).status, 'cancelled');
  assert.equal((await fs.readdir(path.join(dataDir, 'renders', cancelled.id))).filter((name) => name.endsWith('.jpg')).length, 0);
  t.diagnostic(`Actual H.264 + AAC export decoded successfully (${movie.length} bytes).`);
});
