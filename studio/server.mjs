import http from 'node:http';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { RenderManager, findFfmpeg, LIMITS, validId, validateProject, within } from './render.mjs';
import { Autopilot } from './autopilot.mjs';
import { GoogleFlowMcp } from './automation/google-flow-mcp.mjs';
import { FlowQuotedMcp } from './automation/flow-quoted-mcp.mjs';
import { FlowMcpProduction } from './automation/flow-mcp-production.mjs';

const STUDIO_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const ASSET_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/ogg': '.ogg', 'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const JSON_LIMIT = 2 * 1024 * 1024, ASSET_LIMIT = 250 * 1024 * 1024, ASSET_STORAGE_LIMIT = 2 * 1024 ** 3;
function fail(status, message) { const error = new Error(message); error.status = status; return error; }
function validateMediaMetadata(project) {
  if (project.captions !== undefined && typeof project.captions !== 'boolean') throw fail(400, 'Captions must be true or false.');
  if (project.assets !== undefined && (!Array.isArray(project.assets) || project.assets.length > 120)) throw fail(400, 'Media metadata must be a list of at most 120 local assets.');
  const assets = new Map();
  for (const asset of project.assets || []) {
    if (!asset || typeof asset !== 'object' || !validId(asset.id) || assets.has(asset.id)) throw fail(400, 'Each media asset needs a unique valid local ID.');
    if (typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > 240 || !ASSET_TYPES[asset.type]) throw fail(400, 'Invalid local media name or type.');
    if (asset.url !== `/api/assets/${asset.id}` || !Number.isFinite(asset.size) || asset.size <= 0 || asset.size > ASSET_LIMIT) throw fail(400, 'Media URLs must point to this studio; each file must be 1 byte–250 MB.');
    assets.set(asset.id, asset);
  }
  for (const scene of project.scenes) if (scene.assetId && !/^(image|video)\//.test(assets.get(scene.assetId)?.type || '')) throw fail(400, 'Scene media must reference uploaded image or video metadata.');
  for (const key of ['voiceoverAssetId', 'musicAssetId']) if (project[key] && !assets.get(project[key])?.type.startsWith('audio/')) throw fail(400, 'Audio tracks must reference uploaded audio metadata.');
}
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function body(request, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw fail(413, 'Request is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function readJson(request) { try { return JSON.parse((await body(request, JSON_LIMIT)).toString('utf8')); } catch (error) { if (error.status) throw error; throw fail(400, 'Invalid JSON.'); } }
async function serveFile(request, response, filename, type, downloadName) {
  const stat = await fs.stat(filename).catch(() => { throw fail(404, 'File not found.'); });
  if (!stat.isFile()) throw fail(404, 'File not found.');
  const headers = { 'Content-Type': type || MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName}"`;
  let start = 0, end = stat.size - 1, status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); response.end(); return; }
    if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
    else start = Math.max(0, stat.size - Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) { response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); response.end(); return; }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = String(Math.max(0, end - start + 1));
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || stat.size === 0) { response.end(); return; }
  await pipeline(createReadStream(filename, { start, end }), response).catch((error) => { if (!request.destroyed && !response.destroyed) throw error; });
}
export async function createServer(options = {}) {
  const publicDir = path.resolve(options.publicDir || path.join(STUDIO_DIR, 'public'));
  const dataDir = path.resolve(options.dataDir || path.join(STUDIO_DIR, '.studio'));
  const googleFlowMcp = options.googleFlowMcp || new GoogleFlowMcp({ studioDir: STUDIO_DIR, dataDir });
  const projectsDir = path.join(dataDir, 'projects'), assetsDir = path.join(dataDir, 'assets'), rendersDir = path.join(dataDir, 'renders');
  await Promise.all([projectsDir, assetsDir, rendersDir].map((dir) => fs.mkdir(dir, { recursive: true })));
  const ffmpegPath = await findFfmpeg(STUDIO_DIR, options.ffmpegPath);
  const getAsset = async (id) => {
    if (!validId(id)) return null;
    let metadata;
    try { metadata = JSON.parse(await fs.readFile(path.join(assetsDir, `${id}.json`), 'utf8')); } catch { return null; }
    if (!ASSET_TYPES[metadata.type] || metadata.id !== id) return null;
    return { ...metadata, path: within(assetsDir, path.join(assetsDir, `${id}${ASSET_TYPES[metadata.type]}`)) };
  };
  const saveProject = async (value) => {
    const { project } = validateProject(value);
    validateMediaMetadata(project);
    if (project.id && !validId(project.id)) throw fail(400, 'Invalid project ID.');
    project.id ||= randomUUID(); project.updatedAt = new Date().toISOString();
    const destination = within(projectsDir, path.join(projectsDir, `${project.id}.json`)), temporary = `${destination}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(project, null, 2)); await fs.rename(temporary, destination);
    return project;
  };
  const storeAsset = async (stream, { type, name, source, contentLength }) => {
    const extension = ASSET_TYPES[type];
    if (!extension) throw fail(415, 'Upload a supported video, audio, or raster image file.');
    if (contentLength > ASSET_LIMIT) throw fail(413, 'Media limit is 250 MB.');
    let existingBytes = 0;
    for (const entry of await fs.readdir(assetsDir)) if (!entry.endsWith('.json')) existingBytes += (await fs.stat(path.join(assetsDir, entry))).size;
    if (existingBytes >= ASSET_STORAGE_LIMIT) throw fail(413, 'Media storage limit is 2 GB.');
    const id = randomUUID(), destination = within(assetsDir, path.join(assetsDir, `${id}${extension}`));
    let size = 0;
    const guard = new Transform({ transform(chunk, encoding, callback) { size += chunk.length; if (size > ASSET_LIMIT || size + existingBytes > ASSET_STORAGE_LIMIT) callback(fail(413, 'Media storage limit exceeded.')); else callback(null, chunk); } });
    try { await pipeline(stream, guard, createWriteStream(destination, { flags: 'wx' })); } catch (error) { await fs.unlink(destination).catch(() => {}); throw error; }
    if (!size) { await fs.unlink(destination); throw fail(400, 'Media file is empty.'); }
    const asset = { id, name: String(name || `media${extension}`).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 240), type, size, url: `/api/assets/${id}`, createdAt: new Date().toISOString(), ...(source ? { source } : {}) };
    await fs.writeFile(path.join(assetsDir, `${id}.json`), JSON.stringify(asset));
    return asset;
  };
  const importAssetFile = async (filename, metadata) => storeAsset(createReadStream(filename), { ...metadata, contentLength: (await fs.stat(filename)).size });
  const renders = new RenderManager({ root: rendersDir, ffmpegPath, getAsset });
  await renders.restoreCompleted();
  const flowMcp=options.flowMcp||new FlowMcpProduction({mcp:new FlowQuotedMcp(STUDIO_DIR,{prepareBrowser:()=>googleFlowMcp.openExisting()})});
  const autopilot = await new Autopilot({ dataDir, adapters: options.autopilotAdapters, ffmpegPath, getAsset, importAssetFile, saveProject,flowMcp }).init();
  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      const address = server.address();
      const port = typeof address === 'object' ? address?.port : 4317;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(request.headers.host)) throw fail(403, 'Use the local studio URL.');
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      const bridgeRoute = url.pathname.startsWith('/api/bridge/');
      if (bridgeRoute) {
        const origin = request.headers.origin;
        const extensionOrigin = typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
        const localOrigin = !origin || allowedHosts.some((host) => origin === `http://${host}`);
        if (!extensionOrigin && !localOrigin) throw fail(403, 'Only the paired browser worker can use the bridge.');
        if (request.method === 'OPTIONS') {
          if (!extensionOrigin && !localOrigin) throw fail(403, 'Origin is not allowed.');
          response.writeHead(204, { ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' }); response.end(); return;
        }
        if (!autopilot.authorized(request.headers.authorization)) throw fail(401, 'Pair the Flow worker using the setup panel.');
        if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
      }
      if (!bridgeRoute && !['GET', 'HEAD'].includes(request.method)) {
        if (request.headers.origin && !allowedHosts.some((host) => request.headers.origin === `http://${host}`)) throw fail(403, 'Cross-origin changes are not allowed.');
        if (request.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Cross-site changes are not allowed.');
      }
      const route = url.pathname.split('/').filter(Boolean);
      if((url.pathname==='/api/flow-production/status'&&request.method==='GET')||(url.pathname==='/api/flow-production/check'&&request.method==='POST')){
        if(googleFlowMcp.completing||(googleFlowMcp.pending&&Date.now()<googleFlowMcp.pending.expires))return json(response,200,{connected:false,busy:true,detail:googleFlowMcp.completing?'Menunggu pemilihan akun Google dan workspace Flow.':'Menunggu sesi dari Flow Login Bridge. Setelah Session sent, pilih Sesi sudah terkirim.'});
        return json(response,200,await autopilot.flowMcp.status({refresh:request.method==='POST'}));
      }
      if (url.pathname === '/api/google-flow-mcp/status' && request.method === 'GET') return json(response, 200, await googleFlowMcp.status());
      if (url.pathname === '/api/google-flow-mcp/begin' && request.method === 'POST') {
        if(autopilot.flowMcp.busy)throw fail(409,'Tunggu produksi Flow selesai sebelum menyambungkan ulang sesi.');
        const input=await readJson(request);await autopilot.flowMcp.close();autopilot.flowMcp.statusCache=null;
        return json(response, 200, await googleFlowMcp.begin(input));
      }
      if (url.pathname === '/api/google-flow-mcp/complete' && request.method === 'POST') {
        await googleFlowMcp.complete(await readJson(request));await autopilot.flowMcp.close();autopilot.flowMcp.statusCache=null;
        return json(response,200,await autopilot.flowMcp.status({refresh:true}));
      }
      if (url.pathname === '/api/autopilot/setup' && request.method === 'GET') return json(response, 200, await autopilot.setup());
      if (url.pathname === '/api/flow-agent/status' && request.method === 'GET') return json(response, 200, await autopilot.flowAgent.readiness());
      if (url.pathname === '/api/autopilot/pair' && request.method === 'POST') return json(response, 200, await autopilot.pair());
      if (url.pathname === '/api/autopilot/jobs' && request.method === 'GET') return json(response, 200, { jobs: autopilot.list() });
      if (url.pathname === '/api/autopilot/jobs' && request.method === 'POST') return json(response, 201, autopilot.describe(await autopilot.create(await readJson(request))));
      if (route[0] === 'api' && route[1] === 'autopilot' && route[2] === 'jobs' && route.length >= 4) {
        const job = autopilot.get(route[3]); if (!job) throw fail(404, 'Production job not found.');
        if (route.length === 4 && request.method === 'GET') return json(response, 200, autopilot.describe(job));
        if (route.length === 5 && route[4] === 'resume' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.resume(job, await readJson(request))));
        if (route.length === 5 && route[4] === 'revise' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.revise(job, await readJson(request))));
        if (route.length === 5 && route[4] === 'retake' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.retake(job, await readJson(request))));
        if (route.length === 5 && route[4] === 'refinish' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.refinish(job, await readJson(request))));
        if (route.length === 5 && route[4] === 'resolve-empty-flow' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.resolveEmptyFlowAgent(job, await readJson(request))));
        if (route.length === 5 && route[4] === 'reframe' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.reframeUnstartedFlowAgent(job, await readJson(request))));
        if (route.length === 5 && route[4] === 'cancel' && request.method === 'POST') return json(response, 200, autopilot.describe(await autopilot.cancel(job)));
        if (route.length === 5 && route[4] === 'download' && ['GET', 'HEAD'].includes(request.method)) {
          if (job.status !== 'complete') throw fail(409, 'Production is not complete.');
          return await serveFile(request, response, await autopilot.downloadPath(job), 'video/mp4', job.brief.style==='kai'?'kai-makes-do-9x16.mp4':'motif-short-9x16.mp4');
        }
      }
      if (url.pathname === '/api/bridge/task' && request.method === 'GET') {
        let flight;
        try { flight = url.searchParams.has('lastFlight') ? JSON.parse(url.searchParams.get('lastFlight')) : Object.fromEntries(['jobId', 'sceneId', 'persistedIntentId'].map((key) => [key, url.searchParams.get(key)])); } catch { throw fail(400, 'Invalid in-flight receipt.'); }
        return json(response, 200, { task: autopilot.task(), ...autopilot.flightStatus(flight) });
      }
      if (url.pathname === '/api/bridge/heartbeat' && request.method === 'POST') return json(response, 200, await autopilot.heartbeat(await readJson(request)));
      if (url.pathname === '/api/bridge/event' && request.method === 'POST') return json(response, 200, await autopilot.event(await readJson(request)));
      if (url.pathname === '/api/bridge/result' && request.method === 'POST') {
        const input = { jobId: url.searchParams.get('jobId'), sceneId: url.searchParams.get('sceneId') }, { job, scene } = autopilot.findScene(input);
        if (scene.assetId) { request.resume(); await autopilot.persist(job); const asset = await getAsset(scene.assetId); const { path: localPath, ...metadata } = asset; return json(response, 200, { duplicate: true, asset: metadata, job: autopilot.describe(job) }); }
        if (url.searchParams.get('source') !== 'flow' || !scene.persistedIntentId || ['cancelled', 'complete'].includes(job.status)) throw fail(409, 'An active Flow submission reservation is required.');
        const type = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(type)) throw fail(415, 'The Flow bridge must return a video file.');
        const source = { provider: 'google-flow', generatedAt: new Date().toISOString(), promptHash: scene.promptHash, jobId: job.id, sceneId: scene.id, persistedIntentId: scene.persistedIntentId };
        const asset = await storeAsset(request, { type, name: url.searchParams.get('name') || 'flow-clip.mp4', source, contentLength: Number(request.headers['content-length']) });
        return json(response, 201, await autopilot.acceptResult(input, asset));
      }
      if (url.pathname === '/api/health' && request.method === 'GET') return json(response, 200, { ok: true, ffmpeg: Boolean(ffmpegPath), ffmpegPath, limits: LIMITS, version: '1.0.0', storage: '.studio', localOnly: true });
      if (url.pathname === '/api/projects' && request.method === 'GET') {
        const files = (await fs.readdir(projectsDir)).filter((name) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.json$/.test(name));
        const projects = (await Promise.all(files.map(async (name) => { try { const project = JSON.parse(await fs.readFile(path.join(projectsDir, name), 'utf8')); return { id: project.id, title: project.title || 'Untitled', updatedAt: project.updatedAt, duration: project.scenes.reduce((sum, scene) => sum + scene.duration, 0), sceneCount: project.scenes.length, brief: project.brief }; } catch { return null; } }))).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        return json(response, 200, { projects });
      }
      if (url.pathname === '/api/projects' && request.method === 'POST') {
        return json(response, 200, { project: await saveProject(await readJson(request)) });
      }
      if (route[0] === 'api' && route[1] === 'projects' && route.length === 3 && request.method === 'GET') {
        if (!validId(route[2])) throw fail(400, 'Invalid project ID.');
        const project = JSON.parse(await fs.readFile(path.join(projectsDir, `${route[2]}.json`), 'utf8').catch(() => { throw fail(404, 'Project not found.'); }));
        return json(response, 200, { project });
      }
      if (url.pathname === '/api/assets' && request.method === 'POST') {
        const type = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        return json(response, 201, await storeAsset(request, { type, name: url.searchParams.get('name'), contentLength: Number(request.headers['content-length']) }));
      }
      if (route[0] === 'api' && route[1] === 'assets' && route.length === 3 && ['GET', 'HEAD'].includes(request.method)) {
        const asset = await getAsset(route[2]); if (!asset) throw fail(404, 'Media not found.');
        return await serveFile(request, response, asset.path, asset.type);
      }
      if (url.pathname === '/api/renders' && request.method === 'POST') { const job = await renders.create(await readJson(request)); return json(response, 201, renders.describe(job)); }
      if (route[0] === 'api' && route[1] === 'renders' && route.length >= 3) {
        const job = renders.get(route[2]); if (!job) throw fail(404, 'Export not found.');
        if (route.length === 3 && request.method === 'GET') return json(response, 200, renders.describe(job));
        if (route.length === 4 && route[3] === 'frame' && request.method === 'POST') {
          if (String(request.headers['content-type']).split(';')[0] !== 'image/jpeg') throw fail(415, 'Frames must be JPEG images.');
          const indexText = url.searchParams.get('index'); if (!/^\d+$/.test(indexText || '')) throw fail(400, 'Frame index is required.');
          await renders.frame(job, Number(indexText), await body(request, LIMITS.frameBytes)); return json(response, 200, renders.describe(job));
        }
        if (route.length === 4 && route[3] === 'finish' && request.method === 'POST') { renders.finish(job); return json(response, 202, renders.describe(job)); }
        if (route.length === 4 && route[3] === 'cancel' && request.method === 'POST') { await renders.cancel(job); return json(response, 200, renders.describe(job)); }
        if (route.length === 4 && route[3] === 'download' && ['GET', 'HEAD'].includes(request.method)) {
          if (job.status !== 'complete') throw fail(409, 'Export is not ready.');
          const name = (job.project.title || 'motion-studio').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 100) || 'motion-studio';
          return await serveFile(request, response, path.join(job.dir, 'output.mp4'), 'video/mp4', `${name}.mp4`);
        }
      }
      if (url.pathname.startsWith('/api/')) throw fail(404, 'API endpoint not found.');
      if (!['GET', 'HEAD'].includes(request.method)) throw fail(405, 'Method not allowed.');
      let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { throw fail(400, 'Invalid path.'); }
      if (pathname.includes('\0') || pathname.split(/[\\/]/).some((part) => part.startsWith('.'))) throw fail(403, 'Path is not allowed.');
      let filename; try { filename = within(publicDir, path.join(publicDir, pathname === '/' ? 'index.html' : pathname)); } catch { throw fail(403, 'Path is not allowed.'); }
      return await serveFile(request, response, filename);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const status = error.status || (['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 400);
      json(response, status, { error: error.message || 'Request failed.' });
    }
  });
  server.on('close', () => { renders.close(); autopilot.close(); void googleFlowMcp.close(); });
  return { server, renders, autopilot, ffmpegPath, dataDir, getAsset };
}
export async function startServer(options = {}) {
  const app = await createServer(options);
  const port = options.port ?? Number(process.env.PORT || 4317);
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', resolve); });
  app.autopilot.recoverJobs();
  return { ...app, url: `http://127.0.0.1:${app.server.address().port}` };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then((app) => { console.log(`Motion Studio: ${app.url}`); console.log(`FFmpeg: ${app.ffmpegPath || 'unavailable — run npm run setup:ffmpeg'}`); }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
