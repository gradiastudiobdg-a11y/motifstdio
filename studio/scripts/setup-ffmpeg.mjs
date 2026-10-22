import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFfmpeg } from '../render.mjs';

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = path.join(studioDir, 'tools');
const executable = path.join(toolsDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const fromIndex = process.argv.indexOf('--from');
const source = fromIndex >= 0 ? process.argv[fromIndex + 1] : process.env.FFMPEG_PATH;
if (source) {
  const resolved = path.resolve(source);
  if ((await findFfmpeg(studioDir, resolved)) !== resolved || !(await fs.stat(resolved).catch(() => null))?.isFile()) throw new Error('The source must be a working FFmpeg executable.');
  await fs.mkdir(toolsDir, { recursive: true });
  if (resolved !== executable) await fs.copyFile(resolved, executable);
  if (process.platform !== 'win32') await fs.chmod(executable, 0o755);
  console.log(`FFmpeg is ready: ${executable}`);
} else {
  const existing = await findFfmpeg(studioDir);
  if (existing) {
    console.log(`FFmpeg is ready: ${existing}`);
  } else {
    console.error('Install a portable FFmpeg build linked from https://ffmpeg.org/download.html, then run:');
    console.error('  node scripts/setup-ffmpeg.mjs --from "C:/path/to/ffmpeg.exe"');
    console.error('Alternatively set FFMPEG_PATH to your executable before starting the studio.');
    process.exitCode = 1;
  }
}
