// Read-only recovery for the pinned flow-go transport. No generation RPC exists here.
// Protocol reference: kodelyx/flow-go/internal/batchexecute/client.go.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { agentRoot } from './flow-agent.mjs';

const origin = 'https://flow.google.com';
const allowed = new Set(['nzlxg', 'Zzl0ze', 'HTrJv']);
export async function inspectFlowAgent({ marker = 'MOTIF shot 7cb9d178-01.', duration = 8, root = agentRoot } = {}) {
  const names = (await fs.readdir(path.join(root, 'cookies'))).filter(n => /^account_[a-zA-Z0-9_-]+\.json$/.test(n));
  if (names.length !== 1) throw Error('Exactly one local Flow session is required.');
  const bundle = JSON.parse(await fs.readFile(path.join(root, 'cookies', names[0]), 'utf8'));
  if (!bundle.project_id || !bundle.cookies?.length) throw Error('Flow session has no verified project.');
  const cookies = bundle.cookies.filter(c => { const domain = String(c.domain || '').replace(/^\./, ''); return domain && ('flow.google.com' === domain || 'flow.google.com'.endsWith('.' + domain)); });
  const sapisid = cookies.find(c => c.name === 'SAPISID') || cookies.find(c => c.name === '__Secure-3PAPISID');
  if (!sapisid) throw Error('The local Flow session needs a normal browser refresh.');
  let at = bundle.at;
  async function read(rpc, payload) {
    if (!allowed.has(rpc)) throw Error('Only read-only Flow RPCs are allowed.');
    const query = new URLSearchParams({ rpcids: rpc, 'source-path': '/project/' + bundle.project_id, hl: 'en', rt: 'c', _reqid: '101000' });
    if (bundle.fsid) query.set('f.sid', bundle.fsid);
    const ts = Math.floor(Date.now() / 1000).toString();
    const authorization = 'SAPISIDHASH ' + ts + '_' + createHash('sha1').update(`${ts} ${sapisid.value} ${origin}`).digest('hex');
    const headers = { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: '*/*', Origin: origin, Referer: origin + '/', 'X-Same-Domain': '1', 'User-Agent': bundle.fingerprint?.user_agent || 'Mozilla/5.0', Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') };
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = new URLSearchParams({ 'f.req': JSON.stringify([[[rpc, JSON.stringify(payload), null, 'generic']]]) });
      if (at) body.set('at', at);
      const response = await fetch(origin + '/_/AiSandboxAngularFrontend/data/batchexecute?' + query, { method: 'POST', headers, body, signal: AbortSignal.timeout(30000), redirect: 'error' });
      const text = await response.text();
      if (response.status === 400 && attempt === 0) { const token = /"xsrf"\s*,\s*"([^"]+)"/.exec(text); if (token) { at = token[1]; continue; } }
      if (!response.ok) throw Error(`Read-only Flow inspection returned HTTP ${response.status}; no generation called.`);
      const frames = [];
      for (const line of text.split('\n')) {
        if (!line.trim().startsWith('[[')) continue;
        try { for (const item of JSON.parse(line)) if (item[0] === 'wrb.fr' && item[1] === rpc) frames.push(item[2] ? JSON.parse(item[2]) : null); } catch {}
      }
      if (!frames.length) throw Error('Read-only Flow inspection returned no recognized frames.');
      return frames;
    }
    throw Error('Read-only Flow inspection could not refresh the session.');
  }
  const credits = await read('nzlxg', []);
  const balance = credits.flat().find(n => typeof n === 'number');
  const assets = await read('Zzl0ze', ['projects/' + bundle.project_id, null, null, null, [1]]);
  const matches = [], rows = [];
  function walk(value) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'string' && (Array.isArray(value[3]) || typeof value[3] === 'string') && value.length >= 4) rows.push(value);
    if (value.some(v => typeof v === 'string' && v.includes(marker))) matches.push(value);
    for (const v of value) walk(v);
  }
  for (const payload of assets) walk(payload);
  const errors = [...new Set(JSON.stringify(assets).match(/PUBLIC_ERROR_[A-Z_]+/g) || [])];
  const catalog = await read('HTrJv', []);
  const models = [...new Set(JSON.stringify(catalog).match(/(?:abra|omni|veo)_[a-zA-Z0-9_]+/g) || [])];
  const requestedModelRows = [];
  function safeValue(v, depth = 0) {
    if (depth > 7) return '[nested]';
    if (typeof v === 'string') return /https?:|@/.test(v) || v.length > 160 ? '[text]' : v;
    if (Array.isArray(v)) return v.slice(0, 35).map(x => safeValue(x, depth + 1));
    return typeof v === 'object' && v !== null ? '[object]' : v;
  }
  function findModelRows(value) {
    if (!Array.isArray(value)) return;
    if (value.some(v => v === `abra_t2v_${duration}s`)) requestedModelRows.push(safeValue(value));
    for (const v of value) findModelRows(v);
  }
  for (const payload of catalog) findModelRows(payload);
  return { observedAt: new Date().toISOString(), balance, projectRows: rows.length, matchingPromptNodes: matches.length, errors, models, requestedModelRows, generationCalled: false };
}
export function catalogQuote(report, duration) {
  const rows = report.requestedModelRows.filter(row => row[0] === `abra_t2v_${duration}s`);
  if (rows.length !== 1 || rows[0][16] !== duration || !Array.isArray(rows[0][4])) throw Error('The live model catalog shape changed; do not guess the generation cost.');
  const costs = rows[0][4].map(tier => tier?.[1]?.[0]?.[1]);
  if (!costs.length || costs.some(cost => !Number.isInteger(cost) || cost < 0) || new Set(costs).size !== 1) throw Error('The live catalog does not expose one unambiguous cost; inspect the Flow UI.');
  return { source: 'flow-catalog', model: 'omni', duration, quality: '720p', aspectRatio: '9:16', outputs: 1, credits: costs[0], observedAt: report.observedAt };
}
export async function readFlowQuote({ duration, root = agentRoot }) {
  return catalogQuote(await inspectFlowAgent({ duration, root }), duration);
}
