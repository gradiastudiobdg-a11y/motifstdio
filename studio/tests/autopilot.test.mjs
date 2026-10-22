import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server.mjs';

const brief = { topic: 'Mulai kecil setiap hari', audience: 'Anak muda', tone: 'Hangat', style: 'kinetic', duration: 8, aspectRatio: '9:16', fps: 30, clipDuration: 4 };
const project = { version: 1, id: 'test-plan', title: 'Satu langkah', brief, scenes: [0, 1].map((i) => ({ id: `scene-${i}`, label: `Beat ${i}`, duration: 4, headline: 'Mulai kecil.', voiceover: 'Mulai dari satu langkah kecil hari ini.', visual: 'A small seed grows into a young tree.', motion: 'Slow upward camera movement.', transition: 'cut', assetId: null, trimStart: 0 })), publishing: { titles: ['Mulai kecil'], description: 'Satu tindakan kecil.', hashtags: ['#motivasi'], thumbnailPrompt: 'Seed grows.' } };
// These fixtures exercise orchestration only; actual media encoding is separately
// verified by server.test.mjs and the production adapter's own media checks.
const videoFixture = () => { const data = Buffer.alloc(1024); data.writeUInt32BE(24, 0); data.write('ftypisom', 4); return data; };
function adapters(calls, overrides = {}) {
  return {
    readiness: async () => ({ codex: { ready: true }, voice: { ready: true }, finish: { ready: true } }),
    plan: async () => { calls.push('plan'); return structuredClone(project); },
    synthesizeVoiceover: async ({ jobDir }) => { calls.push('voice'); const filename = path.join(jobDir, 'voice.wav'); await fs.writeFile(filename, Buffer.alloc(128)); return { path: filename, type: 'audio/wav' }; },
    finishVideo: async ({ jobDir, project: final, getAsset }) => { calls.push('finish'); assert.ok(final.voiceoverAssetId); for (const scene of final.scenes) assert.equal((await getAsset(scene.assetId)).source.provider, 'google-flow'); const filename = path.join(jobDir, 'assembled.mp4'); await fs.writeFile(filename, videoFixture()); return { path: filename, hasVoiceover: true, hasMusic: true, captionsBurned: true }; },
    ...overrides,
  };
}
async function waitUntil(fetchJob, predicate, explanation) {
  for (let i = 0; i < 250; i++) { const job = await fetchJob(); if (predicate(job)) return job; await delay(15); }
  throw new Error(`Timeout waiting for ${explanation}`);
}
async function stop(app) { app.autopilot.close(); app.renders.close(); app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); }

test('autopilot persists budget receipts, refuses missing scene receipts, resumes after restart and finishes once', { timeout: 25000 }, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-auto-test-')), calls = [];
  let app = await startServer({ port: 0, dataDir, autopilotAdapters: adapters(calls) });
  t.after(async () => { await stop(app); await fs.rm(dataDir, { force: true, recursive: true }); });
  const request = (route, options) => fetch(app.url + route, options);
  const post = (route, data, token) => request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
  assert.equal((await request('/api/bridge/task')).status, 401);
  assert.equal((await post('/api/autopilot/pair', {}, undefined)).status, 200);
  assert.equal((await request('/api/autopilot/pair', { method: 'POST', headers: { origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const { token } = await (await post('/api/autopilot/pair', {})).json();
  const setup = await (await request('/api/autopilot/setup')).json(); assert.equal(setup.bridge.paired, true); assert.equal(setup.readiness.voiceover.ready, true); assert.ok(!JSON.stringify(setup).includes(token));
  const extensionOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const preflight = await request('/api/bridge/event', { method: 'OPTIONS', headers: { Origin: extensionOrigin, 'Access-Control-Request-Headers': 'authorization,content-type' } }); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), extensionOrigin);
  assert.equal((await request('/api/bridge/task', { headers: { Origin: extensionOrigin, Authorization: 'Bearer wrong' } })).status, 401);
  await post('/api/bridge/heartbeat', { state: 'ready', enabled: true, version: 'test', detail: 'account@example.com ready' }, token);
  assert.ok(!JSON.stringify(await (await request('/api/autopilot/setup')).json()).includes('account@example.com'));
  assert.equal((await post('/api/autopilot/jobs', { brief: { ...brief, aspectRatio: '16:9' }, options: {} })).status, 400);
  const created = await (await post('/api/autopilot/jobs', { brief, options: { allowPaid: false, maxGenerations: 2, creditBudget: 20 } })).json();
  const jobRoute = `/api/autopilot/jobs/${created.id}`, getJob = async () => (await request(jobRoute)).json();
  const budgetWait = await waitUntil(getJob, (job) => job.status === 'waiting_setup' && job.waitingReason === 'budget', 'budget permission');
  assert.equal(budgetWait.generations, 0); assert.equal((await (await request('/api/bridge/task', { headers: { Authorization: `Bearer ${token}` } })).json()).task, null); assert.deepEqual(calls, ['plan']);
  await post(jobRoute + '/resume', { options: { allowPaid: true } });
  await waitUntil(getJob, (job) => job.status === 'waiting_flow', 'Flow queue');
  assert.equal((await request(jobRoute + '/download')).status, 409);
  const task1 = (await (await request('/api/bridge/task', { headers: { Authorization: `Bearer ${token}` } })).json()).task; assert.equal(task1.aspectRatio, '9:16'); assert.equal(task1.budgetGranted, true);
  assert.match(task1.prompt, /PALETTE LOCK:/); assert.match(task1.prompt, /STYLE LOCK:/);
  await post('/api/bridge/heartbeat', { state: 'preparing', version: 'test' }, token);
  assert.equal((await (await request('/api/autopilot/setup')).json()).bridge.enabled, true, 'The real worker preparing heartbeat must keep reservations enabled.');
  const receipt1 = { jobId: created.id, sceneId: task1.sceneId, status: 'submitted', persistedIntentId: 'persistent-intent-one', observedCreditCost: 25 };
  assert.equal((await post('/api/bridge/event', receipt1, token)).status, 400, 'Budget overflow must stop before Generate.');
  const unreservedQuery = new URLSearchParams({ jobId: created.id, sceneId: task1.sceneId, persistedIntentId: receipt1.persistedIntentId });
  assert.equal((await (await request('/api/bridge/task?' + unreservedQuery, { headers: { Authorization: `Bearer ${token}` } })).json()).flightStatus, 'not_reserved');
  assert.equal((await post('/api/bridge/event', { ...receipt1, observedCreditCost: null }, token)).status, 400, 'Unknown visible credit cost must stop.');
  receipt1.observedCreditCost = 5;
  const simultaneous = await Promise.all([post('/api/bridge/event', receipt1, token), post('/api/bridge/event', receipt1, token)]);
  for (const response of simultaneous) assert.equal(response.status, 200);
  assert.equal((await Promise.all(simultaneous.map((response) => response.json()))).filter((value) => value.duplicate).length, 1);
  const durable = JSON.parse(await fs.readFile(path.join(dataDir, 'jobs', created.id, 'job.json'), 'utf8'));
  assert.equal(durable.scenes[0].persistedIntentId, receipt1.persistedIntentId, 'A successful paid reservation must already be written to disk.'); assert.equal(durable.generations, 1);
  const duplicate = await (await post('/api/bridge/event', receipt1, token)).json(); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.job.generations, 1); assert.equal(duplicate.job.spentCredits, 5);
  assert.equal((await post('/api/bridge/event', { ...receipt1, persistedIntentId: 'different-retry-intent' }, token)).status, 400);
  await stop(app);
  app = await startServer({ port: 0, dataDir, autopilotAdapters: adapters(calls) });
  const recovered = (await (await request('/api/bridge/task', { headers: { Authorization: `Bearer ${token}` } })).json()).task;
  assert.equal(recovered.status, 'submitted'); assert.equal(recovered.persistedIntentId, receipt1.persistedIntentId); assert.equal(recovered.remainingCredits, 15); assert.deepEqual(calls, ['plan']);
  const upload = async (sceneId) => request(`/api/bridge/result?jobId=${created.id}&sceneId=${sceneId}&source=flow&name=clip.mp4`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' }, body: videoFixture() });
  assert.equal((await upload(task1.sceneId)).status, 201);
  const repeatedUpload = await (await upload(task1.sceneId)).json(); assert.equal(repeatedUpload.duplicate, true); assert.equal(repeatedUpload.job.scenes.filter((scene) => scene.assetId).length, 1);
  const query = new URLSearchParams({ jobId: created.id, sceneId: task1.sceneId, persistedIntentId: receipt1.persistedIntentId });
  assert.equal((await (await request('/api/bridge/task?' + query, { headers: { Authorization: `Bearer ${token}` } })).json()).flightStatus, 'complete');
  assert.equal((await getJob()).voiceoverAssetId, undefined); assert.deepEqual(calls, ['plan'], 'A missing Flow scene must prevent TTS/finalization.');
  await waitUntil(getJob, (job) => job.status === 'waiting_flow', 'second Flow scene');
  const task2 = (await (await request('/api/bridge/task', { headers: { Authorization: `Bearer ${token}` } })).json()).task; assert.notEqual(task2.sceneId, task1.sceneId);
  assert.notEqual(task1.prompt.slice(0, 64), task2.prompt.slice(0, 64), 'The Flow result matching prefix must identify the individual shot.');
  await post('/api/bridge/event', { jobId: created.id, sceneId: task2.sceneId, status: 'submitted', persistedIntentId: 'persistent-intent-two', observedCreditCost: 5 }, token);
  assert.equal((await upload(task2.sceneId)).status, 201);
  const final = await waitUntil(getJob, (job) => job.status === 'complete' || job.status === 'error', 'final MP4');
  assert.equal(final.status, 'complete', final.error); assert.deepEqual(calls, ['plan', 'voice', 'finish']); assert.equal(final.generations, 2); assert.equal(final.spentCredits, 10); assert.equal(final.artifacts.actualMusic, true);
  assert.equal((await request(final.url)).status, 200);
  assert.ok(final.events.some((event) => event.stage === 'voiceover')); assert.ok(final.events.some((event) => event.stage === 'finishing'));
  await stop(app); app = await startServer({ port: 0, dataDir, autopilotAdapters: adapters(calls) });
  assert.equal((await getJob()).status, 'complete'); assert.equal((await request(final.url, { method: 'HEAD' })).status, 200);
});

test('missing real adapters block setup; cancellation aborts planning without synthetic completion', { timeout: 10000 }, async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-auto-setup-')), calls = [];
  let probes = 0;
  let app = await startServer({ port: 0, dataDir, autopilotAdapters: adapters(calls, { readiness: async () => { probes++; await delay(10); return { codex: { ready: false, detail: 'Log in locally.' }, voice: { ready: true }, finish: { ready: true } }; } }) });
  try {
    await Promise.all([app.autopilot.setup(), app.autopilot.setup(), app.autopilot.setup()]); assert.equal(probes, 1, 'Setup polls must share expensive readiness probes.');
    const created = await app.autopilot.create({ brief, options: {} });
    const job = await waitUntil(async () => app.autopilot.describe(created), (value) => value.status === 'waiting_setup', 'real setup'); assert.equal(job.project, null); assert.deepEqual(calls, []);
    await app.autopilot.setup(); assert.equal(probes, 1, 'Three-second UI polling must use cached readiness.');
    await stop(app);
    app = await startServer({ port: 0, dataDir, autopilotAdapters: adapters(calls, { plan: async ({ signal }) => new Promise((resolve, reject) => { calls.push('planning-started'); signal.addEventListener('abort', () => reject(new Error('Stopped.')), { once: true }); }) }) });
    const cancelled = await app.autopilot.create({ brief, options: {} }); await waitUntil(async () => calls, (value) => value.includes('planning-started'), 'running plan');
    await app.autopilot.cancel(cancelled); await delay(20); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.project, null); assert.equal(cancelled.artifacts, undefined);
  } finally { await stop(app); await fs.rm(dataDir, { recursive: true, force: true }); }
});

test('a failed production can revise narration without changing or regenerating any received Flow clip', { timeout: 15000 }, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-auto-revision-')), calls = [];
  const base = adapters(calls); let finishes = 0;
  const app = await startServer({ port: 0, dataDir, autopilotAdapters: { ...base, finishVideo: async (input) => { if (++finishes === 1) throw new Error('Finishing needs a script revision.'); return base.finishVideo(input); } } });
  let releaseCheckpoint;
  const checkpointGate = new Promise((resolve) => { releaseCheckpoint = resolve; }), persist = app.autopilot.persist.bind(app.autopilot);
  app.autopilot.persist = async (job) => { await persist(job); if (job.status === 'error') await checkpointGate; };
  t.after(async () => { await stop(app); await fs.rm(dataDir, { recursive: true, force: true }); });
  const post = (route, data, token) => fetch(app.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
  const { token } = await (await post('/api/autopilot/pair', {})).json(); await post('/api/bridge/heartbeat', { state: 'ready' }, token);
  const created = await (await post('/api/autopilot/jobs', { brief, options: { allowPaid: true, maxGenerations: 2, creditBudget: 20 } })).json(), route = `/api/autopilot/jobs/${created.id}`;
  const getJob = async () => (await fetch(app.url + route)).json();
  await waitUntil(getJob, (job) => job.status === 'waiting_flow', 'Flow scene');
  for (let i = 0; i < 2; i++) {
    const task = (await (await fetch(app.url + '/api/bridge/task', { headers: { Authorization: `Bearer ${token}` } })).json()).task;
    await post('/api/bridge/event', { jobId: created.id, sceneId: task.sceneId, status: 'submitted', persistedIntentId: `revision-intent-${i}`, observedCreditCost: 5 }, token);
    assert.equal((await fetch(app.url + `/api/bridge/result?jobId=${created.id}&sceneId=${task.sceneId}&source=flow`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' }, body: videoFixture() })).status, 201);
    if (i === 0) await waitUntil(getJob, (job) => job.status === 'waiting_flow', 'second scene');
  }
  const failed = await waitUntil(getJob, (job) => job.status === 'error', 'finishing failure'), oldVoice = failed.voiceoverAssetId;
  assert.ok(oldVoice); const flowBefore = failed.scenes.map(({ id, assetId, promptHash, persistedIntentId }) => ({ id, assetId, promptHash, persistedIntentId }));
  const id = failed.project.scenes[0].id;
  assert.equal(app.autopilot.running.has(created.id), true, 'The failed checkpoint is intentionally held open to reproduce the revision race.');
  const forbidden = post(route + '/revise', { scenes: [{ id, assetId: 'replacement' }] });
  const revision = post(route + '/revise', { scenes: [{ id, headline: 'MULAI HARI INI.', voiceover: 'Mulai dari satu hal kecil.' }] });
  await delay(20); releaseCheckpoint();
  assert.equal((await forbidden).status, 400, 'Received footage is locked during a script revision.');
  const revisionResponse = await revision, revised = await revisionResponse.json(); assert.equal(revisionResponse.status, 200, revised.error);
  assert.equal(revised.status, 'waiting_setup'); assert.equal(revised.waitingReason, 'revision'); assert.equal(revised.project.voiceoverAssetId, null); assert.equal(revised.artifactHistory[0].assetId, oldVoice);
  assert.equal((await fetch(app.url + `/api/assets/${oldVoice}`, { method: 'HEAD' })).status, 200, 'The previous actual audio file remains in local history.');
  assert.deepEqual(revised.scenes.map(({ id, assetId, promptHash, persistedIntentId }) => ({ id, assetId, promptHash, persistedIntentId })), flowBefore);
  assert.deepEqual(revised.project.scenes.map((scene) => scene.duration), failed.project.scenes.map((scene) => scene.duration));
  await post(route + '/resume', { options: { allowPaid: false } });
  const complete = await waitUntil(getJob, (job) => ['complete', 'error'].includes(job.status), 'local revised finish');
  assert.equal(complete.status, 'complete', complete.error); assert.equal(complete.generations, failed.generations); assert.equal(complete.spentCredits, failed.spentCredits); assert.equal(calls.filter((call) => call === 'plan').length, 1); assert.equal(calls.filter((call) => call === 'voice').length, 2); assert.equal(complete.options.allowPaid, false);
});
