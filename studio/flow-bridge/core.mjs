export const BASE = 'http://127.0.0.1:4317';
export const MAX_MEDIA_BYTES = 250 * 1024 * 1024;
export function isFlowUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'flow.google.com' || (u.hostname === 'labs.google' && /^\/fx\/tools\/flow(?:\/|$)/.test(u.pathname))); } catch { return false; }
}
export function allowedMediaUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (u.hostname.endsWith('.googleusercontent.com') || isFlowUrl(value) || (u.hostname === 'labs.google' && u.pathname === '/fx/api/trpc/media.getMediaUrlRedirect')); } catch { return false; }
}
export function validateTask(task) {
  if (!task || !/^[\w.-]+$/.test(task.jobId || '') || !/^[\w.-]+$/.test(task.sceneId || '')) throw Error('Task identifiers are invalid.');
  if (task.aspectRatio !== '9:16' || task.outputs !== 1) throw Error('Only 9:16 with one output is permitted.');
  if (!task.budgetGranted || !Number.isFinite(task.remainingCredits) || task.remainingCredits < 0 || !(task.remainingGenerations >= 0)) throw Error('This job has no valid generation budget.');
  if (typeof task.prompt !== 'string' || !task.prompt.trim() || task.prompt.length > 15000 || ![4, 6, 8].includes(task.duration)) throw Error('Prompt or generation duration is invalid.');
  return `${task.jobId}.${task.sceneId}`;
}
export function parseCreditCost(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (/\d[.,]\d{3}\b/.test(source)) return null;
  const values = [...source.matchAll(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*(?:credits?|kredit)\b/gi)].map(m => Number(m[1].replace(',', '.')));
  return values.length === 1 && Number.isFinite(values[0]) ? values[0] : null;
}
export function assertCost(cost, task) {
  if (!Number.isFinite(cost) || cost < 0) throw Error('Generation cost is not visible or is ambiguous. Open the generation controls so an exact credit cost is shown.');
  if (cost > task.remainingCredits || task.remainingGenerations < 1) throw Error('Generation would exceed this job budget.');
  return cost;
}
export function recoverMode(task, flight) {
  const id = `${task.jobId}.${task.sceneId}`;
  if (task.status === 'submitted') return flight?.id === id && flight.intentId === task.persistedIntentId ? 'capture' : 'blocked';
  return flight ? 'blocked' : 'prepare';
}
