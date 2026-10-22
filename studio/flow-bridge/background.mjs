import { BASE, MAX_MEDIA_BYTES, isFlowUrl, allowedMediaUrl, validateTask, assertCost, recoverMode } from './core.mjs';
import { ADAPTER_VERSION } from './selectors.mjs';
import { trustedInput } from './trusted-input.mjs';
const state = () => chrome.storage.local.get(['token', 'enabled', 'workerTabId', 'flight', 'status', 'blockedTask', 'diagnostics']);
let lock = false;
const record = async (status, detail = '') => chrome.storage.local.set({ status: { status, detail, at: new Date().toISOString(), adapter: ADAPTER_VERSION } });
async function api(path, body, config = {}) {
  const { token } = await state(); if (!token) throw Error('Pair this extension with the local studio first.');
  const response = await fetch(`${BASE}/api/bridge/${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...config.headers },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000), ...config,
  });
  const result = await response.json().catch(() => ({})); if (!response.ok) throw Error(result.error || `Studio returned ${response.status}.`); return result;
}
async function heartbeat(status, detail) { await record(status, detail); const s=await state(); await api('heartbeat', { state: status, detail, version: ADAPTER_VERSION, diagnostics: s.diagnostics || '' }).catch(() => {}); }
async function block(task, detail) {
  const status = detail.includes('LOGIN_REQUIRED') ? 'waiting_login' : 'blocked';
  await heartbeat(status, detail);
  if (task) { await api('event', { jobId: task.jobId, sceneId: task.sceneId, status: 'blocked', message: detail }); await chrome.storage.local.set({ blockedTask: `${task.jobId}.${task.sceneId}` }); }
  return { mode: 'blocked', detail };
}
function requireFlowSender(sender) { if (!sender.tab || !isFlowUrl(sender.url || sender.tab.url)) throw Error('Only the Flow tab can run this action.'); }
function requirePopup(sender) { if (sender.tab || !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) throw Error('Only the extension popup can change pairing or worker settings.'); }
async function handle(message, sender) {
  if (message.type === 'STATUS') { requirePopup(sender); const s = await state(); return { enabled: Boolean(s.enabled), paired: Boolean(s.token), workerTabId: s.workerTabId, status: s.status, flight: s.flight ? { id: s.flight.id, phase: s.flight.phase, at: s.flight.at } : null }; }
  if (message.type === 'PAIR') {
    requirePopup(sender); if (!/^[A-Za-z0-9_-]{24,256}$/.test(message.token || '')) throw Error('Pair token is invalid. Copy it from the local studio.');
    await chrome.storage.local.set({ token: message.token, enabled: false }); await api('heartbeat', { state: 'paired', detail: 'Brave extension paired; worker disabled.', version: ADAPTER_VERSION }); await record('paired', 'Enable the worker after opening the signed-in Flow project.'); return { ok: true };
  }
  if (message.type === 'ENABLE') {
    requirePopup(sender); const s = await state(); if (!s.token) throw Error('Pair first.');
    await chrome.storage.local.set({ enabled: Boolean(message.enabled), ...(message.enabled ? { blockedTask: null } : {}) });
    await heartbeat(message.enabled ? 'ready' : 'paused', message.enabled ? 'Waiting for one visible Flow tab.' : 'Worker disabled. Existing submissions remain recorded.'); return { ok: true };
  }
  if (message.type === 'RELEASE_TAB') { requirePopup(sender); if ((await state()).flight) throw Error('A submission is still recorded. Recover that result before changing worker tabs.'); await chrome.storage.local.remove('workerTabId'); return { ok: true }; }
  requireFlowSender(sender);
  if (message.type === 'DIAGNOSTICS') {
    const s=await state(); if(!s.token || !sender.tab.active || !message.visible)return {ok:false};
    const snapshot=JSON.stringify(message.snapshot || {});
    if(snapshot.length>5000 || message.snapshot?.version!==1)throw Error('Invalid UI diagnostics.');
    const sanitized=snapshot.replace(/https?:\/\/[^\s"<>]+/gi,'[url]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[account]');
    await chrome.storage.local.set({diagnostics:sanitized});
    await api('heartbeat',{state:s.enabled?(s.status?.status || 'ready'):'paused',detail:s.status?.detail || 'Read-only Flow UI inspection.',version:ADAPTER_VERSION,diagnostics:sanitized});
    return {ok:true};
  }
  const s = await state(); if (!s.enabled || !s.token) return { mode: 'disabled' };
  if (s.workerTabId && s.workerTabId !== sender.tab.id) return { mode: 'other-tab', detail: 'A different Flow tab owns the worker.' };
  if (!s.workerTabId) { if (!sender.tab.active || !message.visible) return { mode: 'waiting-visible' }; await chrome.storage.local.set({ workerTabId: sender.tab.id }); }
  if (message.type === 'TICK') {
    if (!message.visible || !sender.tab.active) return { mode: 'waiting-visible' };
    const query = s.flight ? `?${new URLSearchParams({ jobId: s.flight.jobId, sceneId: s.flight.sceneId, persistedIntentId: s.flight.intentId })}` : '';
    const polled = await api(`task${query}`), task = polled.task;
    let flight = s.flight;
    if (flight && (['complete', 'cancelled'].includes(polled.flightStatus) || (polled.flightStatus === 'not_reserved' && flight.phase === 'intent'))) {
      await chrome.storage.local.set({ lastReceipt: { id: flight.id, intentId: flight.intentId, outcome: polled.flightStatus, at: new Date().toISOString() } });
      await chrome.storage.local.remove(['flight', 'blockedTask']); flight = null;
    }
    if (!task) { if(s.blockedTask){const detail=s.status?.detail || 'Resolve the issue, then enable the worker to resume.';await heartbeat(s.status?.status==='waiting_login'?'waiting_login':'blocked',detail);return {mode:'blocked',detail};}await heartbeat('ready', 'No authorized queued Flow scene.'); return { mode: 'idle' }; }
    const id = validateTask(task); if (s.blockedTask === id) {const detail=s.status?.detail || 'Resolve the issue, then enable the worker to resume.';await heartbeat(s.status?.status==='waiting_login'?'waiting_login':'blocked',detail);return { mode: 'blocked', detail };}
    const mode = recoverMode(task, flight);
    if (mode === 'blocked') return block(task, 'Submission state needs review. A previous intent is recorded; Generate will not be clicked again. Recover the existing Flow result in the original tab.');
    if (mode === 'capture' && Date.now() - Date.parse(flight.at) > 20 * 60 * 1000) return block(task, 'Generation wait exceeded 20 minutes. Check Flow and recover the existing result. No paid retry was submitted.');
    await heartbeat(mode === 'capture' ? 'generating' : 'preparing', mode === 'capture' ? 'Waiting for the reserved scene result.' : 'Checking visible Flow controls and credit cost.');
    return { mode, task, flight: flight || null };
  }
  if (message.type === 'BLOCK') return block(message.task, String(message.detail || 'Flow needs attention.').slice(0, 1500));
  if (message.type === 'TRUSTED_INPUT') {
    validateTask(message.task);
    return trustedInput(chrome, message, sender, async () => {
      const { task } = await api('task');
      if (!task || task.jobId !== message.task.jobId || task.sceneId !== message.task.sceneId) throw Error('The Flow scene was cancelled or changed. No further input was sent.');
    });
  }
  if (message.type === 'RESERVE') {
    const id = validateTask(message.task); assertCost(message.cost, message.task);
    if (s.flight) throw Error('An in-flight submission already exists. Generate must not be clicked again.');
    const flight = { id, jobId: message.task.jobId, sceneId: message.task.sceneId, promptHash: message.task.promptHash, intentId: crypto.randomUUID(), phase: 'intent', at: new Date().toISOString(), baseline: Array.isArray(message.baseline) ? message.baseline.slice(0, 500) : [] };
    await chrome.storage.local.set({ flight });
    const result = await api('event', { jobId: flight.jobId, sceneId: flight.sceneId, status: 'submitted', message: 'Credit reservation persisted before UI submission.', observedCreditCost: message.cost, persistedIntentId: flight.intentId });
    if (!result.accepted) throw Error('Studio did not accept the submission reservation.');
    flight.phase = 'reserved'; await chrome.storage.local.set({ flight }); return { accepted: true, intentId: flight.intentId };
  }
  if (message.type === 'CLICKED') { if (!s.flight || s.flight.intentId !== message.intentId) throw Error('Submission receipt mismatch.'); await chrome.storage.local.set({ flight: { ...s.flight, phase: 'clicked' } }); return { ok: true }; }
  if (message.type === 'CONFIRM') { return { approved: Boolean(s.enabled && s.flight?.intentId === message.intentId && s.flight?.phase === 'reserved' && sender.tab.active && message.visible) }; }
  if (message.type === 'RESULT') {
    const id = validateTask(message.task); if (!s.flight || s.flight.id !== id) throw Error('No persisted submission for this result.');
    if (!allowedMediaUrl(message.url)) throw Error('Result URL is outside the permitted Flow media hosts.');
    await heartbeat('downloading', 'Downloading the new matching portrait Flow result.');
    const response = await fetch(message.url, { credentials: 'include', redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!allowedMediaUrl(response.url)) throw Error('Flow redirected media to an unsupported host. Recover the existing video; no retry will be generated.');
    if (!response.ok) throw Error(`Flow result download failed (${response.status}). Keep the original result; no generation retry will be made.`);
    const contentType = response.headers.get('content-type')?.split(';')[0]; if (!['video/mp4', 'video/webm'].includes(contentType)) throw Error('Flow source did not return supported video bytes.');
    if (Number(response.headers.get('content-length')) > MAX_MEDIA_BYTES) throw Error('Generated clip exceeds the local 250 MB limit.');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_MEDIA_BYTES) { await reader.cancel(); throw Error('Generated clip exceeds the local limit.'); } chunks.push(value); }
    const blob = new Blob(chunks, { type: contentType });
    const query = new URLSearchParams({ jobId: s.flight.jobId, sceneId: s.flight.sceneId, source: 'flow', name: `${s.flight.sceneId}.${contentType === 'video/webm' ? 'webm' : 'mp4'}` });
    const { token } = await state(); const uploaded = await fetch(`${BASE}/api/bridge/result?${query}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: blob, signal: AbortSignal.timeout(120000) });
    const result = await uploaded.json().catch(() => ({})); if (!uploaded.ok) throw Error(result.error || 'Studio rejected the Flow result.');
    await chrome.storage.local.remove(['flight', 'blockedTask']); await heartbeat('ready', 'Flow footage delivered. Local motion overlays and finishing can continue.'); return { ok: true };
  }
  throw Error('Unknown bridge action.');
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || typeof message.type !== 'string') return false;
  if (lock && !['STATUS', 'ENABLE'].includes(message.type)) { reply({ mode: 'busy' }); return false; }
  const takesLock = !['STATUS', 'ENABLE'].includes(message.type); if (takesLock) lock = true;
  const finish = result => { if (takesLock) lock = false; reply(result); };
  handle(message, sender).then(finish).catch(async error => { await record('error', error.message).catch(() => {}); finish({ error: error.message }); });
  return true;
});
chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({ enabled: false }));
chrome.alarms.create('motif-heartbeat', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async alarm => { if (alarm.name !== 'motif-heartbeat') return; const s = await state(); if (s.enabled && s.token) await api('heartbeat', { state: s.status?.status || 'ready', detail: s.status?.detail || 'Waiting for the Flow tab.', version: ADAPTER_VERSION }).catch(() => {}); });
