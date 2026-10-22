import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FlowAgent, singleAccountEnvironment } from '../flow-agent.mjs';
import { Autopilot } from '../../autopilot.mjs';
import { catalogQuote } from '../flow-agent-inspect.mjs';

async function fixture(t, execute) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-flow-agent-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const binary = path.join(root, 'test-engine'); await fs.writeFile(binary, 'local fixture');
  await fs.mkdir(path.join(root, 'cookies')); await fs.writeFile(path.join(root, 'cookies/account_test.json'), '[]');
  const jobDir = path.join(root, 'job'); await fs.mkdir(jobDir);
  return { root, jobDir, agent: new FlowAgent({ root, binary, execute }), scene: { id: 'scene-01', duration: 8, prompt: 'Visual fixture only', promptHash: 'a'.repeat(64) }, quote: { source: 'flow-ui', model: 'omni', quality: '720p', aspectRatio: '9:16', outputs: 1, duration: 8, credits: 25, observedAt: new Date().toISOString() }, ffmpegPath: 'fixture-ffmpeg' };
}
test('Flow-agent refuses unknown price and multiple sessions without an upstream call', async t => {
  let calls = 0; const f = await fixture(t, async () => { calls++; });
  await assert.rejects(f.agent.generate({ ...f, quote: null }), /harga live/);
  await assert.rejects(f.agent.generate({ ...f, quote: { ...f.quote, observedAt: 'invalid' } }), /harga live/);
  await fs.writeFile(path.join(f.root, 'cookies/account_second.json'), '[]');
  await assert.rejects(f.agent.generate(f), /tepat satu sesi/); assert.equal(calls, 0);
});
test('live catalog pricing refuses tier ambiguity, missing rows and stale model shapes', () => {
  const row = ['abra_t2v_10s', null, null, null, [[1, [[null, 15]]], [2, [[null, 15]]], [3, [[null, 15]]]]]; row[16] = 10;
  const report = { requestedModelRows: [row], observedAt: new Date().toISOString() };
  assert.equal(catalogQuote(report, 10).credits, 15);
  const different = structuredClone(report); different.requestedModelRows[0][4][1][1][0][1] = 100;
  assert.throws(() => catalogQuote(different, 10), /unambiguous cost/);
  assert.throws(() => catalogQuote({ ...report, requestedModelRows: [] }, 10), /catalog shape/);
  assert.throws(() => catalogQuote(report, 8), /catalog shape/);
});
test('uncertain upstream submission keeps durable intent and is never retried', async t => {
  let generations = 0, reserved = false;
  const f = await fixture(t, async (_exe, args, options) => {
    assert.equal(options.env.FLOW_AUTO_RETRY, 'false'); assert.equal(options.env.ACCOUNT_SCAN_LIMIT, '1');
    if (args[0] === 'doctor') return { stdout: '{"ready":true,"checks":[{"name":"browser","ok":true}]}' };
    assert.equal(reserved, true); generations++; throw Error('network disconnected');
  });
  const reserve = async () => { const disk = JSON.parse(await fs.readFile(path.join(f.jobDir, 'scene-01-flow-agent.json'))); assert.equal(disk.state, 'intent'); reserved = true; };
  await assert.rejects(f.agent.generate({ ...f, reserve }), /tidak ada retry/);
  await assert.rejects(f.agent.generate({ ...f, reserve }), /submit ulang diblokir/); assert.equal(generations, 1);
});
test('a ready cookie session cannot spend without the live browser broker', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return { stdout: '{"ready":true,"checks":[{"name":"browser","ok":false}]}' }; });
  await assert.rejects(f.agent.generate({ ...f, reserve: async () => assert.fail('must not reserve') }), /terhubung langsung/);
  assert.equal(calls, 3); assert.equal(await fs.stat(path.join(f.jobDir, 'scene-01-flow-agent.json')).then(() => true).catch(() => false), false);
});
test('Flow-agent validates portrait media, saves a recovery receipt, and reuses its bytes', async t => {
  let calls = 0; let f;
  f = await fixture(t, async (_exe, args) => {
    calls++;
    if (args[0] === 'doctor') return { stdout: '{"ready":true,"checks":[{"name":"browser","ok":true}]}' };
    if (args[0] === 'generate') {
      assert.equal(args[args.indexOf('--aspect') + 1], '9:16'); assert.equal(args[args.indexOf('--count') + 1], '1'); assert.ok(!args.includes('--all'));
      const video = path.join(f.root, 'fixture.mp4'); await fs.writeFile(video, 'local media fixture');
      return { stdout: JSON.stringify({ status: 'ready', job_id: 'fixture-job', model: 'abra_t2v_8s', quality: '720p', media_ids: ['fixture-media'], files: [{ path: video }] }) };
    }
    return { stderr: 'Duration: 00:00:08.00\n Video: h264, yuv420p, 720x1280, 24 fps' };
  });
  const result = await f.agent.generate({ ...f, reserve: async () => {} });
  assert.equal(result.receipt.width, 720); assert.equal(result.receipt.sha256.length, 64);
  assert.equal((await f.agent.generate({ ...f, scene: { ...f.scene, persistedIntentId: result.receipt.intentId } })).path, result.path); assert.equal(calls, 3);
  assert.equal(singleAccountEnvironment().FLOW_AUTO_RETRY, 'false');
});
test('MOTIF enforces 100-credit and 4-generation caps for Flow-agent and isolates the old bridge', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-agent-budget-')); t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const auto = new Autopilot({ dataDir, adapters: {} }); await auto.init();
  const job = { id: 'budget-test', status: 'waiting_flow', options: { flowProvider: 'flow-agent', allowPaid: true, creditBudget: 100, maxGenerations: 4 }, generations: 0, spentCredits: 0, scenes: Array.from({ length: 5 }, (_, i) => ({ id: `scene-${i}`, promptHash: 'fixture', duration: 8 })) };
  await fs.mkdir(auto.dir(job), { recursive: true }); auto.jobs.set(job.id, job);
  const input = i => ({ jobId: job.id, sceneId: job.scenes[i].id, status: 'submitted', persistedIntentId: `intent-fixture-${i}`, observedCreditCost: 25 });
  await assert.rejects(auto.event(input(0)), /another Flow transport/); assert.equal(auto.task(), null);
  for (let i = 0; i < 4; i++) { await auto.event(input(i), { provider: 'flow-agent' }); job.scenes[i].assetId = `fixture-${i}`; }
  assert.equal(job.spentCredits, 100); assert.equal(job.generations, 4);
  await assert.rejects(auto.event(input(4), { provider: 'flow-agent' }), /limit or credit budget/); assert.equal(job.generations, 4);
});
