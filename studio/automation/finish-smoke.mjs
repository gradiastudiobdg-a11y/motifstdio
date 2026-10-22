// Local renderer QA with actual synthesized speech and explicitly synthetic footage.
// Run smoke.mjs --voice first. This script never submits anything to Flow.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { studioDir, runCommand } from './common.mjs';
import { findFfmpeg } from '../render.mjs';
import { finishVideoFixture } from './finish-video-core.mjs';

const root = path.join(studioDir, '.studio', 'automation-smoke');
const project = JSON.parse(await fs.readFile(path.join(root, 'voice', 'project-with-word-timings.json'), 'utf8'));
const jobDir = path.join(root, 'local-finish-not-Flow');
await fs.mkdir(jobDir, { recursive: true });
const ffmpegPath = await findFfmpeg(studioDir);
const footage = path.join(jobDir, 'synthetic-test-fixture-not-Flow.mp4');
await runCommand(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x45514b:s=270x480:r=30:d=8', '-vf', 'drawbox=x=42:y=170:w=186:h=6:color=0xd7d1c4:t=fill,drawbox=x=55:y=176:w=7:h=95:color=0x8f9d84:t=fill,drawbox=x=208:y=176:w=7:h=95:color=0x8f9d84:t=fill,drawbox=x=160:y=130:w=28:h=40:color=0xD66042:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', footage]);
project.title = 'LOCAL TEST — actual speech, synthetic footage, not Flow';
project.voiceoverAssetId = 'real-speech';
project.scenes[0].assetId = 'test-footage';
const assets = {
  'test-footage': { id: 'test-footage', path: footage, type: 'video/mp4', source: { provider: 'test-fixture', testFixture: true } },
  'real-speech': { id: 'real-speech', path: path.join(root, 'voice', 'voice', 'voiceover.wav'), type: 'audio/wav', source: { provider: 'local-tts' } },
};
const result = await finishVideoFixture({ project, jobDir, ffmpegPath, getAsset: async id => assets[id] });
await fs.writeFile(path.join(jobDir, 'project.json'), JSON.stringify({ ...project, testFixture: true }, null, 2));
console.log(JSON.stringify({ path: result.path, validation: result.validation, note: 'Local render QA only. No Flow production is claimed.' }, null, 2));
