import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server.mjs';

test('extension background and real local HTTP API agree on reservations, rejected intents and cancellation recovery', { timeout: 15000 }, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-bridge-contract-'));
  const brief = { topic: 'Fixture orchestration only', duration: 8, aspectRatio: '9:16', fps: 30, clipDuration: 8, style: 'kinetic' };
  const adapters = { readiness: async () => ({ codex: { ready: true }, voice: { ready: true }, finish: { ready: true } }), plan: async () => ({ version: 1, id: 'fixture', title: 'No external generation is performed', brief, scenes: [{ id: 's1', duration: 8, headline: 'Test', voiceover: 'Test script.', visual: 'A test shape.', motion: 'One small movement.', transition: 'cut', trimStart: 0, assetId: null }], publishing: {} }), synthesizeVoiceover: async () => { throw Error('This contract test must not create media.'); }, finishVideo: async () => { throw Error('This contract test must not finish a production.'); } };
  const app = await startServer({ port: 0, dataDir, autopilotAdapters: adapters });
  const originalFetch = globalThis.fetch, originalChrome = globalThis.chrome;
  t.after(async () => { globalThis.fetch = originalFetch; globalThis.chrome = originalChrome; app.autopilot.close(); app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  const { token } = await app.autopilot.pair(), memory = { token, enabled: true }; let listener;
  globalThis.chrome = {
    storage: { local: { async get(keys) { return Object.fromEntries(keys.filter((key) => key in memory).map((key) => [key, structuredClone(memory[key])])); }, async set(value) { Object.assign(memory, structuredClone(value)); }, async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete memory[key]; } } },
    runtime: { id: 'fixture', getURL: (entry) => `chrome-extension://fixture/${entry}`, onMessage: { addListener: (callback) => { listener = callback; } }, onInstalled: { addListener() {} } }, alarms: { create() {}, onAlarm: { addListener() {} } },
  };
  globalThis.fetch = (url, options) => { const local = new URL(url); assert.equal(local.origin, 'http://127.0.0.1:4317', 'No external Flow/TTS network is used in this fixture.'); return originalFetch(app.url + local.pathname + local.search, options); };
  await import(`../flow-bridge/background.mjs?http-contract=${Date.now()}`);
  const sender = { id: 'fixture', url: 'https://flow.google.com/project/fixture', tab: { id: 7, url: 'https://flow.google.com/project/fixture', active: true } }, popup = { id: 'fixture', url: 'chrome-extension://fixture/popup.html' };
  const send = (message, from = sender) => new Promise((resolve) => listener(message, from, resolve));
  await send({ type: 'ENABLE', enabled: true }, popup);
  const job = await app.autopilot.create({ brief, options: { allowPaid: true, maxGenerations: 1, creditBudget: 10 } });
  for (let i = 0; i < 100 && job.status !== 'waiting_flow'; i++) await delay(10);
  const prepared = await send({ type: 'TICK', visible: true }); assert.equal(prepared.mode, 'prepare');
  assert.equal(app.autopilot.config.heartbeat.state, 'preparing'); assert.equal(app.autopilot.config.heartbeat.enabled, true);
  // A user reduced the approved budget after the worker inspected the task.
  await app.autopilot.resume(job, { options: { creditBudget: 1 } });
  for (let i = 0; i < 100 && app.autopilot.running.has(job.id); i++) await delay(10);
  const rejected = await send({ type: 'RESERVE', task: prepared.task, cost: 5, baseline: [] }); assert.match(rejected.error, /budget/); assert.equal(memory.flight.phase, 'intent'); assert.equal(job.generations, 0);
  await app.autopilot.resume(job, { options: { creditBudget: 10 } });
  for (let i = 0; i < 100 && app.autopilot.running.has(job.id); i++) await delay(10);
  await send({ type: 'ENABLE', enabled: true }, popup);
  const recovered = await send({ type: 'TICK', visible: true }); assert.equal(recovered.mode, 'prepare'); assert.equal(memory.flight, undefined); assert.equal(memory.lastReceipt.outcome, 'not_reserved');
  const reservation = await send({ type: 'RESERVE', task: recovered.task, cost: 5, baseline: [] }); assert.equal(reservation.accepted, true);
  assert.equal((await send({ type: 'CONFIRM', visible: true, intentId: reservation.intentId })).approved, true); assert.equal(job.generations, 1); assert.equal(job.spentCredits, 5);
  assert.equal((await send({ type: 'TICK', visible: true })).mode, 'capture', 'A reserved generation is never submitted twice.');
  await app.autopilot.cancel(job);
  assert.equal((await send({ type: 'TICK', visible: true })).mode, 'idle'); assert.equal(memory.flight, undefined); assert.equal(memory.lastReceipt.outcome, 'cancelled');
  const next = await app.autopilot.create({ brief, options: { allowPaid: true, maxGenerations: 1, creditBudget: 10 } });
  for (let i = 0; i < 100 && next.status !== 'waiting_flow'; i++) await delay(10);
  assert.equal((await send({ type: 'TICK', visible: true })).mode, 'prepare', 'An explicitly cancelled old flight must not jam later jobs.');
});
