import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FlowMcpProduction } from '../flow-mcp-production.mjs';
import { hash, readJson, runCommand, studioDir } from '../common.mjs';
import { findFfmpeg } from '../../render.mjs';
import { parseMediaMetadata } from '../finish-video-core.mjs';
import { Autopilot } from '../../autopilot.mjs';

test('MCP reserves durably before a paid call and never retries an uncertain submission', async t => {
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'motif-mcp-'));
  t.after(() => fs.rm(jobDir, { recursive: true, force: true }));
  const scene = { id: 'shot-1', duration: 10, timelineDuration: 15, prompt: 'Visual test', promptHash: hash('Visual test') };
  let calls = 0, reserved = false;
  const adapter = new FlowMcpProduction({ mcp: { async call(name,args) {
    calls++;
    if (args.dry_run) return { quotedCredits: 15 };
    assert.equal(reserved,true); assert.equal(args.count,1); assert.equal(args.aspect,'9:16');
    assert.equal((await readJson(adapter.receiptPath(jobDir,scene))).state,'submission_reserved');
    throw Error('Response lost after possible paid click');
  } } });
  const options = { jobDir,scene,projectId:'project-test',reserve: async r => { reserved=true; scene.persistedIntentId=r.persistedIntentId; } };
  await assert.rejects(adapter.generate(options), /Response lost/);
  assert.equal(calls,2);
  await assert.rejects(adapter.generate(options), /Uncertain paid submission/);
  assert.equal(calls,2);
  await assert.rejects(adapter.reserve({...options,quote:0}), /Existing submission/);
  await adapter.record({...options,response:{jobs:[{mediaId:'exact-result-id',workflowId:'exact-workflow'}]}});
  assert.equal((await readJson(adapter.receiptPath(jobDir,scene))).mediaId,'exact-result-id');
  await assert.rejects(adapter.record({...options,response:{jobs:[{mediaId:'another-id'}]}}), /already recorded/);
});

test('MCP keeps two historical attempts and refuses a fifth attempt or excess credits', async t => {
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'motif-mcp-budget-'));t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
  const auto=await new Autopilot({dataDir,adapters:{}}).init();
  const job={id:'mcp-budget',status:'waiting_flow',options:{flowProvider:'google-flow-mcp',allowPaid:true,maxGenerations:4,creditBudget:100},generations:2,spentCredits:15,scenes:[0,1,2].map(i=>({id:`mcp-${i}`,duration:10}))};
  await fs.mkdir(auto.dir(job),{recursive:true});auto.jobs.set(job.id,job);
  const input=i=>({jobId:job.id,sceneId:job.scenes[i].id,status:'submitted',persistedIntentId:`mcp-intent-${i}`,observedCreditCost:15});
  await assert.rejects(auto.event(input(0)),/another Flow transport/);
  job.spentCredits=90;await assert.rejects(auto.event(input(0),{provider:'google-flow-mcp'}),/limit or credit budget/);assert.equal(job.generations,2);job.spentCredits=15;
  for(let i=0;i<2;i++){await auto.event(input(i),{provider:'google-flow-mcp'});job.scenes[i].assetId=`asset-${i}`;}
  assert.equal(job.generations,4);assert.equal(job.spentCredits,45);
  await assert.rejects(auto.event(input(2),{provider:'google-flow-mcp'}),/limit or credit budget/);assert.equal(job.generations,4);assert.equal(auto.task(),null);
});

test('explicit recovery links only one exact video in the reserved project, without another paid call',async t=>{
  const jobDir=await fs.mkdtemp(path.join(os.tmpdir(),'motif-mcp-recover-'));t.after(()=>fs.rm(jobDir,{recursive:true,force:true}));
  const scene={id:'recover-shot',duration:10,prompt:'Unique job marker; the same complete visual prompt',promptHash:hash('Unique job marker; the same complete visual prompt')};
  let media=[],calls=[];const adapter=new FlowMcpProduction({mcp:{async call(name,args){calls.push(name);assert.equal(name,'flow_get_project');assert.equal(args.project_id,'same-project');return{media};}}});
  const input={jobDir,scene,projectId:'same-project'};
  await adapter.reserve({...input,quote:15,reserve:async r=>scene.persistedIntentId=r.persistedIntentId});
  await assert.rejects(adapter.recoverSubmitted(input),/0 exact video matches/);
  media=[{kind:'video',prompt:'Different shot',mediaId:'unrelated'}];await assert.rejects(adapter.recoverSubmitted(input),/0 exact video matches/);
  media=[1,2].map(i=>({kind:'video',prompt:scene.prompt,mediaId:`duplicate-${i}`}));await assert.rejects(adapter.recoverSubmitted(input),/2 exact video matches/);
  media=[{kind:'video',prompt:scene.prompt,mediaId:'exact-existing-video',workflowId:'existing-workflow'}];
  const result=await adapter.recoverSubmitted(input);assert.equal(result.mediaId,'exact-existing-video');assert.equal(result.recovery.additionalGenerations,0);
  assert.deepEqual(calls,Array(4).fill('flow_get_project'));assert.equal((await readJson(adapter.receiptPath(jobDir,scene))).state,'submitted');
});

test('Flow login rejection is shown without reading credits, generating or exposing account data',async()=>{
  const calls=[];const adapter=new FlowMcpProduction({mcp:{async call(name){calls.push(name);return {stage:'login_blocked'};},async close(){}}});
  const status=await adapter.status();assert.equal(status.connected,false);assert.equal(status.state,'login_blocked');assert.deepEqual(calls,['flow_browser_state']);
  await adapter.status();assert.equal(calls.length,1);
});

test('reCAPTCHA library presence is not a challenge; a visible challenge still blocks production',async()=>{
  for(const stage of ['workspace','verification_required']){
    const calls=[];const adapter=new FlowMcpProduction({mcp:{async call(name){calls.push(name);return name==='flow_browser_state'?{stage}:{ok:true,recaptcha:true,credits:810};},async close(){}}});
    const status=await adapter.status();assert.equal(status.connected,stage==='workspace');
    if(stage==='verification_required')assert.deepEqual(calls,['flow_browser_state']);else assert.equal(status.credits,810);
  }
});

test('local 10-second portrait fixture trims to a 5-second scene without speeding up or requiring Flow',async t=>{
  const ffmpegPath=await findFfmpeg(studioDir);if(!ffmpegPath){t.skip('Local FFmpeg required');return;}
  const jobDir=await fs.mkdtemp(path.join(os.tmpdir(),'motif-mcp-trim-'));t.after(()=>fs.rm(jobDir,{recursive:true,force:true}));
  const original=path.join(jobDir,'fixture.mp4');
  await runCommand(ffmpegPath,['-y','-f','lavfi','-i','testsrc2=size=180x320:rate=24','-t','10','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',original]);
  const scene={id:'trim-test',duration:10,timelineDuration:5,prompt:'Local fixture only',promptHash:hash('Local fixture only')};
  const adapter=new FlowMcpProduction({mcp:{}});
  await adapter.reserve({jobDir,scene,projectId:'fixture',quote:15,reserve:async r=>{scene.persistedIntentId=r.persistedIntentId;}});
  await adapter.record({jobDir,scene,response:{jobs:[{mediaId:'fixture-only'}]}});
  const result=await adapter.finishDownload({jobDir,scene,filename:original,ffmpegPath});
  const meta=parseMediaMetadata((await runCommand(ffmpegPath,['-i',result.path,'-t','0','-f','null','-'])).stderr);
  assert.equal(meta.duration,5);assert.equal(meta.fps,30);assert.equal(meta.width,180);assert.equal(meta.height,320);assert.equal(result.receipt.sha256.length,64);
});
