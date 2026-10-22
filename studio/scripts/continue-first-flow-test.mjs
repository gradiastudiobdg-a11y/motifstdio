// Staged MCP handoff: only `reserve` authorizes a single subsequent tool call.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createServer } from '../server.mjs';
import { hash, studioDir, readJson, runCommand } from '../automation/common.mjs';
import { parseMediaMetadata } from '../automation/finish-video-core.mjs';
import { durableJson } from '../automation/flow-mcp-production.mjs';
import { validateProject } from '../render.mjs';
const id = '7cb9d178-b3ff-4ef4-a558-ce560151039c';
const app = await createServer(); const a = app.autopilot, job = a.get(id), dir = a.dir(job);
const [stage, sceneId, argument] = process.argv.slice(2);
try {
  if (stage === 'migrate') {
    if (job.options.flowProvider === 'google-flow-mcp') throw Error('Already migrated.');
    if (job.generations !== 2 || job.spentCredits !== 15 || a.running.has(id) || job.scenes.some(s => s.assetId)) throw Error('Unexpected historical job state.');
    const old = job.scenes.find(s => s.persistedIntentId);
    const receipt = await readJson(path.join(dir, `${old.id}-flow-agent.json`));
    if (receipt.reason !== 'PUBLIC_ERROR_UNUSUAL_ACTIVITY' || receipt.promptHash !== old.promptHash) throw Error('Historical refusal not proven.');
    const db = new DatabaseSync(path.join(a.flowAgent.root, 'data/flow.db'), { readOnly: true });
    let rows; try { rows = db.prepare('SELECT job_id,status,media_ids,credits_spent FROM generations WHERE prompt = ?').all(old.prompt); } finally { db.close(); }
    if (rows.length !== 1 || rows[0].status !== 'empty' || JSON.parse(rows[0].media_ids || '[]').length) throw Error('Historical generation may have output; migration refused.');
    const project = await readJson(path.join(studioDir, '.studio/first-flow-test-prep/two-shot-project.json'));
    const validated = validateProject(project);
    if (validated.duration !== 30 || project.id !== id || project.scenes.length !== 2 || project.scenes.some(s => s.assetId || s.duration !== 15)) throw Error('Invalid two-shot edit.');
    await durableJson(path.join(dir, 'job-before-mcp-migration.json'), job);
    job.failedFlowAttempts ||= []; job.failedFlowAttempts.push({ sceneId: old.id, promptHash: old.promptHash, intentId: old.persistedIntentId, upstreamJobId: rows[0].job_id, status: 'explicit_remote_refusal_no_media', reason: receipt.reason, reservationRetained: 15, generationAttemptStillCounted: true });
    job.project = project; job.options.flowProvider = 'google-flow-mcp'; job.flowProjectId = 'fa131be1-29d7-4fb4-9aec-ca00a2e1af7b';
    job.scenes = project.scenes.map((s, index) => {
      const prompt = `MOTIF shot ${id.slice(0,8)}-mcp-${index+1}. One continuous cinematic live-action portrait shot, vertical 9:16, 10 seconds. Natural believable hands and face. Warm cream, olive and yellow palette.\n${s.visual}\n${s.motion}\nKeep main action in central area, upper quarter uncluttered for later motion typography. No title cards, text, logos, subtitles, dialogue or music. The man is silent. End in a stable pose.`;
      return { id: s.id, label: s.headline, duration: 10, timelineDuration: 15, prompt, promptHash: hash(prompt), status: 'pending', assetId: null };
    });
    const voice = await a.importAssetFile(path.join(studioDir, '.studio/first-flow-test-prep/two-shot-voice/voice/voiceover.wav'), { type: 'audio/wav', name: 'narasi-indonesia.wav', source: { provider: 'local-tts' } });
    job.voiceoverAssetId = project.voiceoverAssetId = voice.id; project.assets.push(voice);
    await a.savePlan(job); await a.transition(job, 'waiting_flow', 'Dua percobaan lama dan cadangan 15 kredit dipertahankan; dua shot MCP siap.');
  } else if (stage === 'reserve') {
    const scene = job.scenes.find(s => s.id === sceneId);
    const prepared = await a.flowMcp.reserve({ jobDir: dir, scene, projectId: job.flowProjectId, quote: Number(argument), reserve: r => a.event({ jobId: id, sceneId, status: 'submitted', ...r }, { provider: 'google-flow-mcp' }) });
    await durableJson(path.join(dir, `${sceneId}-request.json`), prepared.args);
    console.log(JSON.stringify({ args: prepared.args }));
  } else if (stage === 'record') {
    const scene = job.scenes.find(s => s.id === sceneId);
    await a.flowMcp.record({ jobDir: dir, scene, response: await readJson(argument) });
  } else if (stage === 'import') {
    const scene = job.scenes.find(s => s.id === sceneId);
    const result = await a.flowMcp.finishDownload({ jobDir: dir, scene, filename: argument, ffmpegPath: app.ffmpegPath });
    const asset = await a.importAssetFile(result.path, { type: 'video/mp4', name: `${sceneId}-flow.mp4`, source: { provider: 'google-flow', transport: 'google-flow-mcp', jobId: id, sceneId, promptHash: scene.promptHash, persistedIntentId: scene.persistedIntentId, mediaId: result.receipt.mediaId, sha256: result.receipt.sha256 } });
    await a.acceptResult({ jobId: id, sceneId }, asset, { continueRun: false });
  } else if (stage === 'repair-retime') {
    const scene = job.scenes.find(s => s.id === sceneId), file = a.flowMcp.receiptPath(dir,scene), receipt = await readJson(file);
    if (receipt?.state !== 'downloaded' || !receipt.mediaId || receipt.intentId !== scene.persistedIntentId || receipt.promptHash !== scene.promptHash || scene.assetId) throw Error('No interrupted local retiming to recover.');
    const output = path.join(dir,`${sceneId}-flow-edit.mp4`), temp = path.join(dir,`${sceneId}-flow-padded.mp4`), original = path.join(dir,`${sceneId}-flow-original.mp4`);
    const meta = parseMediaMetadata((await runCommand(app.ffmpegPath,['-hide_banner','-i',output,'-t','0','-f','null','-'])).stderr);
    if (meta.duration < 14.5 || meta.duration >= 15 || meta.width !== 720 || meta.height !== 1280 || meta.fps !== 30) throw Error('Unexpected intermediate duration/format.');
    await runCommand(app.ffmpegPath,['-y','-i',output,'-an','-vf','tpad=stop_mode=clone:stop_duration=1','-t','15','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',temp]);
    const fixed = parseMediaMetadata((await runCommand(app.ffmpegPath,['-hide_banner','-i',temp,'-t','0','-f','null','-'])).stderr);
    if (fixed.duration !== 15 || fixed.width !== 720 || fixed.height !== 1280) throw Error('Retiming recovery failed validation.');
    await fs.rename(temp,output);
    receipt.sourceSha256=createHash('sha256').update(await fs.readFile(original)).digest('hex'); receipt.sha256=createHash('sha256').update(await fs.readFile(output)).digest('hex'); receipt.state='complete'; receipt.path=output;
    await durableJson(file,receipt);
    const asset=await a.importAssetFile(output,{type:'video/mp4',name:`${sceneId}-flow.mp4`,source:{provider:'google-flow',transport:'google-flow-mcp',jobId:id,sceneId,promptHash:scene.promptHash,persistedIntentId:scene.persistedIntentId,mediaId:receipt.mediaId,sha256:receipt.sha256}});
    await a.acceptResult({jobId:id,sceneId},asset,{continueRun:false});
  } else if (stage === 'finish') {
    if (job.scenes.some(s => !s.assetId)) throw Error('Actual Flow footage missing.');
    // Cut from the first portrait into a book/hands close-up for the final action.
    job.project.scenes[1].mediaCrop = { x: 0.225, y: 0.44, width: 0.55, height: 0.55 };
    await a.savePlan(job);
    await a.run(job, new AbortController().signal);
  } else throw Error('Use migrate, reserve, record, import, finish.');
  console.log(JSON.stringify({ stage, status: job.status, generations: job.generations, reservedCredits: job.spentCredits, flowScenes: job.scenes.filter(s => s.assetId).length, output: job.outputPath || null }));
} finally { a.close(); await a.flowMcp.close(); }
