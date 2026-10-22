import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({ duration: 180, fps: 30, scenes: 60, pixels: 1080 * 1920, dimension: 1920, frameBytes: 5 * 1024 * 1024, frameDiskBytes: 2 * 1024 ** 3 });
export const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
export function within(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside the studio directory.');
  return path.resolve(target);
}
export function validateProject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Project must be a JSON object.');
  if (value.version !== 1) throw new Error('Project version must be 1.');
  if (!Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > LIMITS.scenes) throw new Error('Project requires 1–60 scenes.');
  let duration = 0;
  for (const scene of value.scenes) {
    if (!scene || typeof scene !== 'object' || !Number.isFinite(scene.duration) || scene.duration < 0.25 || scene.duration > LIMITS.duration) throw new Error('Every scene needs a duration between 0.25 and 180 seconds.');
    for (const key of ['headline', 'voiceover', 'visual', 'motion', 'transition', 'label']) {
      if (scene[key] !== undefined && (typeof scene[key] !== 'string' || scene[key].length > 12000)) throw new Error(`Scene ${key} must be text of at most 12000 characters.`);
    }
    if (scene.assetId !== undefined && scene.assetId !== null && !validId(scene.assetId)) throw new Error('Invalid scene asset ID.');
    if (scene.trimStart !== undefined && (!Number.isFinite(scene.trimStart) || scene.trimStart < 0 || scene.trimStart > 86400)) throw new Error('Invalid trim start.');
    duration += scene.duration;
  }
  if (duration > LIMITS.duration) throw new Error('Total duration may not exceed 180 seconds.');
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 300)) throw new Error('Title is too long.');
  for (const key of ['voiceoverAssetId', 'musicAssetId']) {
    if (value[key] !== undefined && value[key] !== null && !validId(value[key])) throw new Error(`Invalid ${key}.`);
  }
  if (value.musicVolume !== undefined && (!Number.isFinite(value.musicVolume) || value.musicVolume < 0 || value.musicVolume > 1)) throw new Error('Music volume must be between 0 and 1.');
  return { project: JSON.parse(JSON.stringify(value)), duration };
}
async function commandWorks(command) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, ['-version'], { windowsHide: true, shell: false, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); finish(false); }, 4000);
    function finish(ok) { if (!settled) { settled = true; clearTimeout(timer); resolve(ok); } }
    child.once('error', () => finish(false));
    child.once('close', (code) => finish(code === 0));
  });
}
export async function findFfmpeg(studioDir, explicit) {
  const candidates = [explicit, process.env.FFMPEG_PATH, path.join(studioDir, 'tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), 'ffmpeg'];
  for (const candidate of candidates.filter(Boolean)) if (await commandWorks(candidate)) return candidate;
  return null;
}
export function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset++] !== 0xff) return null;
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    offset += length;
  }
  return null;
}
export class RenderManager {
  constructor({ root, ffmpegPath, getAsset }) {
    this.root = path.resolve(root);
    this.ffmpegPath = ffmpegPath;
    this.getAsset = getAsset;
    this.jobs = new Map();
  }
  describe(job) {
    return { id: job.id, status: job.status, frames: job.frames, totalFrames: job.totalFrames, width: job.width, height: job.height, fps: job.fps, duration: job.duration, progress: job.progress, url: job.status === 'complete' ? `/api/renders/${job.id}/download` : null, error: job.error || null };
  }
  get(id) { return validId(id) ? this.jobs.get(id) : undefined; }
  async restoreCompleted() {
    for (const id of await fs.readdir(this.root)) {
      if (!validId(id)) continue;
      const dir = within(this.root, path.join(this.root, id));
      try {
        const metadata = JSON.parse(await fs.readFile(path.join(dir, 'result.json'), 'utf8'));
        const { project, duration } = validateProject(JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8')));
        if (metadata.id !== id || metadata.status !== 'complete' || !(await fs.stat(path.join(dir, 'output.mp4'))).isFile()) continue;
        this.jobs.set(id, { ...metadata, project, duration, dir, status: 'complete', progress: 1, busy: false });
      } catch { /* Incomplete jobs are never offered as completed videos. */ }
    }
  }
  async cleanFrames(job) {
    const dir = within(this.root, job.dir);
    const frames = (await fs.readdir(dir)).filter((name) => /^frame-\d{6}\.jpg$/.test(name));
    await Promise.all(frames.map((name) => fs.unlink(within(this.root, path.join(dir, name))).catch(() => {})));
  }
  async create(input) {
    if (!this.ffmpegPath) throw new Error('FFmpeg is unavailable. Run npm run setup:ffmpeg or set FFMPEG_PATH and restart.');
    if ([...this.jobs.values()].filter((j) => ['capturing', 'encoding'].includes(j.status)).length >= 2) throw new Error('Two exports are already active. Complete or cancel one first.');
    const { project, duration } = validateProject(input.project);
    const width = Number(input.width), height = Number(input.height), fps = Number(input.fps ?? project.brief?.fps ?? 30);
    if (![width, height].every((n) => Number.isInteger(n) && n >= 16 && n <= LIMITS.dimension && n % 2 === 0) || width * height > LIMITS.pixels) throw new Error('Export dimensions must be even, at least 16px, and at most 1080×1920 pixels.');
    if (!Number.isInteger(fps) || fps < 1 || fps > LIMITS.fps) throw new Error('FPS must be an integer between 1 and 30.');
    const id = randomUUID(), dir = within(this.root, path.join(this.root, id));
    await fs.mkdir(dir, { recursive: true });
    const job = { id, dir, project, duration, width, height, fps, totalFrames: Math.max(1, Math.round(duration * fps)), frames: 0, bytes: 0, progress: 0, status: 'capturing', busy: false };
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify(project, null, 2));
    this.jobs.set(id, job);
    return job;
  }
  async frame(job, index, buffer) {
    if (job.status !== 'capturing') throw new Error('This export is not accepting frames.');
    if (job.busy) throw new Error('A frame is already being written. Send frames sequentially.');
    if (!Number.isInteger(index) || index !== job.frames || index >= job.totalFrames) throw new Error(`Expected frame ${job.frames}.`);
    if (buffer.length > LIMITS.frameBytes || job.bytes + buffer.length > LIMITS.frameDiskBytes) throw new Error('Frame storage limit exceeded.');
    const dimensions = jpegDimensions(buffer);
    if (!dimensions || dimensions.width !== job.width || dimensions.height !== job.height) throw new Error('JPEG dimensions do not match this export.');
    job.busy = true;
    try {
      await fs.writeFile(within(this.root, path.join(job.dir, `frame-${String(index).padStart(6, '0')}.jpg`)), buffer, { flag: 'wx' });
      job.frames++;
      job.bytes += buffer.length;
      job.progress = 0;
    } finally { job.busy = false; if (job.status === 'cancelled') await this.cleanFrames(job); }
  }
  finish(job) {
    if (job.status !== 'capturing' || job.busy || job.frames !== job.totalFrames) throw new Error(`Upload all ${job.totalFrames} frames before finishing.`);
    job.status = 'encoding';
    this.encode(job).catch(async (error) => {
      if (job.status !== 'cancelled') { job.status = 'error'; job.error = error.message; }
      await this.cleanFrames(job).catch(() => {});
      await fs.unlink(within(this.root, path.join(job.dir, 'output.mp4'))).catch(() => {});
    });
  }
  async encode(job) {
    const args = ['-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(job.fps), '-start_number', '0', '-i', path.join(job.dir, 'frame-%06d.jpg')];
    const audio = {};
    for (const [key, label] of [['voiceoverAssetId', 'voice'], ['musicAssetId', 'music']]) {
      if (!job.project[key]) continue;
      const asset = await this.getAsset(job.project[key]);
      if (!asset || !asset.type.startsWith('audio/')) throw new Error(`${label === 'voice' ? 'Voiceover' : 'Music'} asset must be an uploaded audio file.`);
      audio[label] = Object.keys(audio).length + 1;
      if (label === 'music') args.push('-stream_loop', '-1');
      args.push('-i', asset.path);
    }
    args.push('-map', '0:v:0');
    const filters = [], duration = String(job.duration);
    if (audio.voice) filters.push(`[${audio.voice}:a]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${duration}[voice]`);
    if (audio.music) filters.push(`[${audio.music}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${job.project.musicVolume ?? 0.16},atrim=duration=${duration},afade=t=out:st=${Math.max(0, job.duration - 0.6)}:d=0.6[music]`);
    if (audio.voice && audio.music) {
      filters.push('[voice]asplit=2[voiceout][sidechain]', '[music][sidechain]sidechaincompress=threshold=0.025:ratio=6:attack=20:release=500[bed]', `[voiceout][bed]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${duration}[mix]`);
    } else if (audio.voice || audio.music) filters.push(`[${audio.voice ? 'voice' : 'music'}]anull[mix]`);
    if (filters.length) args.push('-filter_complex', filters.join(';'), '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', `scale=${job.width}:${job.height}:flags=lanczos,setsar=1`, '-r', String(job.fps), '-t', duration, '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', path.join(job.dir, 'output.mp4'));
    if (job.status === 'cancelled') return;
    await new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      job.child = child;
      let errors = '', progress = '';
      child.stdout.on('data', (chunk) => {
        progress += chunk.toString();
        const lines = progress.split('\n'); progress = lines.pop();
        for (const line of lines) if (line.startsWith('out_time_ms=')) job.progress = Math.min(0.99, Math.max(0, Number(line.slice(12)) / 1000000 / job.duration));
      });
      child.stderr.on('data', (chunk) => { errors = (errors + chunk.toString()).slice(-7000); });
      child.once('error', reject);
      child.once('close', (code) => {
        job.child = null;
        if (job.status === 'cancelled') resolve();
        else if (code === 0) resolve();
        else reject(new Error(`FFmpeg could not encode this export: ${errors.trim().slice(-1800) || `exit ${code}`}`));
      });
    });
    if (job.status === 'cancelled') return;
    const output = await fs.stat(path.join(job.dir, 'output.mp4'));
    if (output.size < 100) throw new Error('FFmpeg produced an empty video.');
    // Delete only the numbered JPEG files written by this job, after validating each path.
    await this.cleanFrames(job);
    if (job.status === 'cancelled') return;
    const result = { ...this.describe(job), status: 'complete', progress: 1, url: `/api/renders/${job.id}/download` };
    await fs.writeFile(path.join(job.dir, 'result.json'), JSON.stringify(result, null, 2));
    if (job.status === 'cancelled') { await fs.unlink(path.join(job.dir, 'result.json')).catch(() => {}); return; }
    job.status = 'complete'; job.progress = 1;
  }
  async cancel(job) {
    if (job.status === 'complete') throw new Error('This export is already complete.');
    job.status = 'cancelled';
    if (job.child) {
      const child = job.child;
      await new Promise((resolve) => { child.once('close', resolve); child.kill(); });
    }
    await this.cleanFrames(job);
    await fs.unlink(within(this.root, path.join(job.dir, 'output.mp4'))).catch(() => {});
  }
  close() { for (const job of this.jobs.values()) if (job.child) job.child.kill(); }
}
