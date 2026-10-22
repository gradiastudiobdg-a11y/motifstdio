import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { FlowQuotedMcp } from './flow-quoted-mcp.mjs';
import { studioDir, hash, readJson, checkAbort, runCommand } from './common.mjs';
import { parseMediaMetadata } from './finish-video-core.mjs';

export async function durableJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const tmp = `${filename}.${randomUUID()}.tmp`;
  const fd = await fs.open(tmp, 'wx');
  try { await fd.writeFile(JSON.stringify(value, null, 2)); await fd.sync(); } finally { await fd.close(); }
  await fs.rename(tmp, filename);
}

// A receipt is written BEFORE a paid call. Unknown outcomes are recover-only.
export class FlowMcpProduction {
  constructor({ mcp = new FlowQuotedMcp(studioDir) } = {}) { this.mcp = mcp; }
  async status({ refresh = false } = {}) {
    if (this.busy || (!refresh && this.statusCache && Date.now()-this.statusCache.at<30000)) return this.statusCache?.value || { connected: false, busy: true, detail: 'Flow sedang digunakan untuk produksi.' };
    if (this.statusPending) return this.statusPending;
    this.statusPending=(async()=>{
      let value;
      try {
        if(refresh && this.statusCache?.value?.connected===false)await this.mcp.close();
        const browser=await this.mcp.call('flow_browser_state',{},45000);
        if(browser.stage!=='workspace'){
          const detail={verification_required:'Verifikasi Flow terlihat di Brave. Selesaikan sendiri, lalu periksa koneksi lagi.',login_required:'Login ke Flow di jendela Brave yang dibuka MOTIF, lalu periksa koneksi lagi.',login_blocked:'Google menolak proses login di browser ini. Selesaikan lewat proses login resmi Google; produksi dihentikan sampai sesi valid.',network_error:'Brave tidak dapat membuka Flow. Periksa jaringan dan halaman error di Brave.',loading:'Flow masih memuat. Tunggu halaman siap, lalu periksa koneksi lagi.'}[browser.stage]||'Flow belum siap.';
          value={connected:false,busy:false,state:browser.stage,detail};
          this.statusCache={at:Date.now(),value};return value;
        }
        const live=await this.mcp.call('flow_status',{},45000);
        // Upstream's recaptcha flag means Enterprise JS is installed, not that
        // a visible verification challenge is blocking the workspace.
        value={connected:live.ok===true,busy:false,credits:Number.isFinite(live.credits)?live.credits:null,detail:live.ok?'Sesi Brave terhubung · Omni 720p · 9:16 · satu akun.':'Buka Brave dan login ke Flow.',checkedAt:new Date().toISOString()};
      } catch(error) { value={connected:false,busy:false,detail:/NOT_SIGNED_IN|sign.?in|accounts.google|login/i.test(error.message)?'Login ke Flow di jendela Brave yang dibuka MOTIF, lalu periksa koneksi lagi.':'Koneksi Flow belum siap. Periksa jendela Brave dan koneksi internet, lalu coba Periksa koneksi.'}; }
      this.statusCache={at:Date.now(),value};return value;
    })().finally(()=>{this.statusPending=null;});return this.statusPending;
  }
  async ensureProject(job) {
    if (job.flowProjectId || job.options.flowProjectId) return job.flowProjectId || job.options.flowProjectId;
    const title=`${job.brief?.style==='kai'?'Kai Makes Do':'MOTIF'} ${job.id}`;
    const projects=await this.mcp.call('flow_list_projects');
    const matches=projects.filter(p=>p.title===title);
    if(matches.length>1)throw Error('Project Flow ambigu; pilih project sebelum melanjutkan.');
    const project=matches[0]||await this.mcp.call('flow_create_project',{title});
    if(!/^[a-f0-9-]{36}$/i.test(project.id||''))throw Error('Flow tidak mengembalikan ID project yang valid.');
    return project.id;
  }
  args(scene, projectId) {
    return { project_id: projectId, prompt: scene.prompt, model_key: 'abra_t2v_10s', duration_sec: 10, resolution: '720p', aspect: '9:16', count: 1, max_credits: 15 };
  }
  receiptPath(jobDir, scene) { return path.join(jobDir, `${scene.id}-flow-mcp.json`); }
  async reserve({ jobDir, scene, projectId, quote, reserve }) {
    if (scene.duration !== 10 || !projectId || hash(scene.prompt) !== scene.promptHash) throw Error('Invalid Flow shot configuration.');
    const file = this.receiptPath(jobDir, scene);
    if (await readJson(file) || scene.persistedIntentId) throw Error('Existing submission: recover its exact media; never generate again.');
    if (!Number.isInteger(quote) || quote <= 0 || quote > 15) throw Error('A positive live Flow quote of at most 15 credits is required.');
    const receipt = { state: 'intent', intentId: `flow-mcp-${scene.id}-${randomUUID()}`, promptHash: scene.promptHash, projectId, quotedCredits: quote, createdAt: new Date().toISOString() };
    await durableJson(file, receipt);
    await reserve({ persistedIntentId: receipt.intentId, observedCreditCost: quote });
    receipt.state = 'submission_reserved'; await durableJson(file, receipt);
    return { receipt, args: { ...this.args(scene, projectId), max_credits: quote } };
  }
  async record({ jobDir, scene, response }) {
    const file = this.receiptPath(jobDir, scene), receipt = await readJson(file);
    if (!receipt || receipt.promptHash !== scene.promptHash || receipt.intentId !== scene.persistedIntentId) throw Error('Missing durable generation reservation.');
    if (receipt.mediaId) throw Error('Submission already recorded.');
    const jobs = response.jobs;
    if (!Array.isArray(jobs) || jobs.length !== 1 || !jobs[0].mediaId) throw Error('Flow returned no unique media ID. Stop and recover; do not retry.');
    receipt.mediaId = jobs[0].mediaId; receipt.workflowId = jobs[0].workflowId; receipt.state = 'submitted'; receipt.submittedAt = new Date().toISOString();
    await durableJson(file, receipt); return receipt;
  }
  async recoverSubmitted({ jobDir, scene, projectId }) {
    const file=this.receiptPath(jobDir,scene),receipt=await readJson(file);
    if(!receipt||receipt.state!=='submission_reserved'||receipt.mediaId||receipt.intentId!==scene.persistedIntentId||receipt.promptHash!==hash(scene.prompt)||receipt.projectId!==projectId)throw Error('Recovery requires the unchanged reserved submission.');
    // Read the same project only. Exact full prompt includes the unique job/shot
    // marker. Zero/multiple matches remain blocked, never generate as a fallback.
    const contents=await this.mcp.call('flow_get_project',{project_id:projectId});
    const matches=(contents.media||[]).filter(m=>m.kind==='video'&&m.prompt===scene.prompt);
    if(matches.length!==1||!matches[0].mediaId)throw Object.assign(Error(`Reserved Flow submission has ${matches.length} exact video matches; recovery stopped without another paid call.`),{code:'FLOW_SUBMISSION_UNCERTAIN'});
    const media=matches[0];
    const recovered=await this.record({jobDir,scene,response:{jobs:[{mediaId:media.mediaId,workflowId:media.workflowId}]}});
    recovered.recovery={method:'unique-exact-prompt-in-same-project',observedAt:new Date().toISOString(),additionalGenerations:0};
    await durableJson(file,recovered);return recovered;
  }
  async finishDownload({ jobDir, scene, filename, ffmpegPath, signal }) {
    const file = this.receiptPath(jobDir, scene), receipt = await readJson(file);
    if (!receipt?.mediaId || receipt.promptHash !== scene.promptHash) throw Error('No linked Flow media receipt.');
    checkAbort(signal);
    const probe = async name => parseMediaMetadata((await runCommand(ffmpegPath, ['-hide_banner','-i',name,'-t','0','-f','null','-'], { signal })).stderr);
    const info = await probe(filename);
    if (!info.width || Math.abs(info.width / info.height - 9 / 16) > 0.02 || info.duration < 9.85 || info.duration > 10.3) throw Error('Flow source must be a complete 10-second 9:16 clip.');
    const duration = scene.timelineDuration || scene.duration, factor = duration / info.duration;
    if (duration < 0.25 || factor > 1.55) throw Error('Unsupported shot retiming.');
    const original = path.join(jobDir, `${scene.id}-flow-original.mp4`), output = path.join(jobDir, `${scene.id}-flow-edit.mp4`);
    if (path.resolve(filename) !== original) await fs.copyFile(filename, original);
    receipt.sourceSha256 = createHash('sha256').update(await fs.readFile(original)).digest('hex'); receipt.sourceDuration = info.duration;
    receipt.state = 'downloaded'; await durableJson(file, receipt);
    const filter=duration<=info.duration+0.05?'fps=30,tpad=stop_mode=clone:stop_duration=1':`setpts=${factor}*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,tpad=stop_mode=clone:stop_duration=1`;
    await runCommand(ffmpegPath, ['-y','-i',original,'-an','-vf',filter,'-t',String(duration),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',output], { signal, timeoutMs: 600000 });
    let edited = await probe(output);
    // Some older FFmpeg builds drain the interpolation filter a few frames
    // early. Pad only that validated short tail in a separate encode.
    if (edited.duration < duration - 0.05 && edited.duration >= duration - 0.5) {
      const padded = path.join(jobDir, `${scene.id}-flow-tail.mp4`);
      await runCommand(ffmpegPath, ['-y','-i',output,'-an','-vf','tpad=stop_mode=clone:stop_duration=1','-t',String(duration),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',padded], { signal });
      await fs.rename(padded,output); edited = await probe(output);
    }
    if (Math.abs(edited.duration - duration) > 0.05 || Math.abs(edited.width / edited.height - 9/16) > 0.02) throw Error('Edited Flow clip failed duration/portrait validation.');
    receipt.sha256 = createHash('sha256').update(await fs.readFile(output)).digest('hex'); receipt.state = 'complete'; receipt.path = output;
    await durableJson(file, receipt); return { path: output, receipt };
  }
  async generate({ jobDir, scene, projectId, reserve, signal, ffmpegPath, availableCredits = Infinity, remainingClips = 1 }) {
    const file = this.receiptPath(jobDir, scene); let receipt = await readJson(file);
    if (receipt && (receipt.promptHash !== scene.promptHash || receipt.intentId !== scene.persistedIntentId)) throw Error('The receipt belongs to a different shot; recovery stopped.');
    if (!receipt) {
      checkAbort(signal);
      const quote = await this.mcp.call('flow_generate_video', { ...this.args(scene, projectId), dry_run: true });
      if(quote.quotedCredits*Math.max(1,remainingClips)>availableCredits)throw Object.assign(Error(`Anggaran belum cukup: ${remainingClips} klip × ${quote.quotedCredits} kredit. Naikkan batas kredit lalu lanjutkan; belum ada generasi baru.`),{code:'CONFIG_REQUIRED'});
      const prepared = await this.reserve({ jobDir, scene, projectId, quote: quote.quotedCredits, reserve });
      checkAbort(signal);
      try {
        const response = await this.mcp.call('flow_generate_video', prepared.args, 120000);
        receipt = await this.record({ jobDir, scene, response });
      } catch(error) { error.code='FLOW_SUBMISSION_UNCERTAIN';throw error; }
    }
    if (!receipt.mediaId) throw Object.assign(Error('Uncertain paid submission. Recover before continuing; no automatic retry.'),{code:'FLOW_SUBMISSION_UNCERTAIN'});
    if (receipt.state === 'complete') {
      if (createHash('sha256').update(await fs.readFile(receipt.path)).digest('hex') !== receipt.sha256) throw Error('Downloaded Flow bytes changed.');
      return { path: receipt.path, receipt };
    }
    const state = await this.mcp.call('flow_video_status', { media_ids: [receipt.mediaId], wait: true, timeout_sec: 600 }, 660000);
    const item = state.items?.find(x => x.mediaId === receipt.mediaId);
    if (item?.state !== 'succeeded') throw Error(`Flow clip is ${item?.state || 'unknown'}; no new generation submitted.`);
    if (item.prompt && item.prompt !== scene.prompt) throw Error('Flow result prompt does not match the reserved shot.');
    const download = await this.mcp.call('flow_download_media', { media_id: receipt.mediaId, out_dir: jobDir });
    return this.finishDownload({ jobDir, scene, filename: download.path, ffmpegPath, signal });
  }
  async close() { await this.mcp.close(); }
}
