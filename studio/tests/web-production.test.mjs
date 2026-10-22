import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server.mjs';
import { createProject } from '../public/planner.mjs';
import { FlowMcpProduction } from '../automation/flow-mcp-production.mjs';
import { readJson, hash } from '../automation/common.mjs';

// HTTP orchestration fixture only. Flow, spoken TTS and encoding are not claimed
// by these stubs; their actual integrations have separate validation reports.
async function fixture(t,{loseResponse=false,kai=false}={}){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'motif-web-mcp-'));
  const bytes=Buffer.alloc(1024);bytes.write('ftypisom',4);
  const original=path.join(dataDir,'fixture.mp4');await fs.writeFile(original,bytes);
  const prompts=new Map(),events=[];let paid=0;
  const mcp={async close(){},async call(name,args={}){
    events.push(name+(args.dry_run?':dry':''));
    if(name==='flow_browser_state')return {stage:'workspace'};
    if(name==='flow_status')return {ok:true,credits:800};
    if(name==='flow_list_projects')return [];
    if(name==='flow_create_project')return {id:randomUUID(),title:args.title};
    if(name==='flow_generate_video'){
      assert.equal(args.aspect,'9:16');assert.equal(args.count,1);assert.equal(args.duration_sec,10);
      if(args.dry_run)return {quotedCredits:15};
      paid++;const mediaId=randomUUID();prompts.set(mediaId,args.prompt);await delay(30);
      if(loseResponse)throw Error('Possible paid click; response lost.');
      const marker=args.prompt.match(/MOTIF shot ([a-f0-9]{8})/)[1];
      const jobDirs=await fs.readdir(path.join(dataDir,'jobs'));
      const job=await readJson(path.join(dataDir,'jobs',jobDirs.find(id=>id.startsWith(marker)),'job.json'));
      assert.ok(job.scenes.some(s=>s.prompt===args.prompt&&s.persistedIntentId));
      return {jobs:[{mediaId,workflowId:randomUUID()}]};
    }
    if(name==='flow_video_status')return {items:args.media_ids.map(mediaId=>({mediaId,state:'succeeded',prompt:prompts.get(mediaId)}))};
    if(name==='flow_download_media')return {path:original};
    throw Error('Unexpected MCP call: '+name);
  }};
  const flowMcp=new FlowMcpProduction({mcp});
  flowMcp.finishDownload=async({jobDir,scene,filename})=>{
    assert.equal(filename,original);const receipt=await readJson(flowMcp.receiptPath(jobDir,scene));
    assert.equal(receipt.promptHash,hash(scene.prompt));return {path:original,receipt:{...receipt,sha256:'fixture'}};
  };
  const plans=[];
  const app=await startServer({port:0,dataDir,flowMcp,autopilotAdapters:{
    readiness:async()=>({codex:{ready:true},voice:{ready:!kai},finish:{ready:true}}),
    plan:async({brief})=>{plans.push(brief.topic);return createProject(brief);},
    synthesizeVoiceover:async({jobDir,project})=>{assert.equal(kai,false,'Kai must never call TTS');project.scenes.forEach(s=>s.wordTimings=[{text:'fixture',start:.2,end:1}]);const file=path.join(jobDir,'voice.wav');await fs.writeFile(file,Buffer.alloc(128));return {path:file,type:'audio/wav'};},
    finishVideo:async({jobDir,project})=>{assert.ok(project.scenes.every(s=>s.assetId&&(kai?s.voiceover==='':s.wordTimings)));assert.equal(project.captions,!kai);await fs.writeFile(path.join(jobDir,'assembled.mp4'),bytes);return {path:path.join(jobDir,'assembled.mp4'),hasVoiceover:!kai,hasMusic:!kai,hasSoundDesign:kai,captionsBurned:!kai};},
  }});
  t.after(async()=>{app.autopilot.close();app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});
  const post=async(route,body)=>{const response=await fetch(app.url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;};
  const create=(topic,budget=100)=>post('/api/autopilot/jobs',{brief:{topic,duration:15,style:kai?'kai':'cinematic',aspectRatio:'9:16'},options:{flowProvider:'google-flow-mcp',allowPaid:true,maxGenerations:2,creditBudget:budget}});
  const wait=async(id,state)=>{for(let i=0;i<300;i++){const job=app.autopilot.get(id);if(state(job))return job;await delay(15);}throw Error('Job did not reach state: '+JSON.stringify(app.autopilot.describe(app.autopilot.get(id))));};
  return {app,post,create,wait,events,plans,paid:()=>paid};
}

test('web idea → MCP receipts → narration → final download runs automatically and serializes jobs',async t=>{
  const f=await fixture(t);const first=await f.create('Fixture one'),second=await f.create('Fixture two');
  assert.equal(f.app.autopilot.get(second.id).status,'queued');
  const a=await f.wait(first.id,j=>j.status==='complete');const b=await f.wait(second.id,j=>j.status==='complete');
  assert.equal(a.brief.clipDuration,10);assert.deepEqual(a.project.scenes.map(s=>s.duration),[10,5]);
  assert.deepEqual(f.plans,['Fixture one','Fixture two']);assert.equal(f.paid(),4);
  for(const j of [a,b]){assert.equal(j.generations,2);assert.equal(j.spentCredits,30);assert.ok(j.flowProjectId);assert.equal(j.options.flowProvider,'google-flow-mcp');const r=await fetch(f.app.url+`/api/autopilot/jobs/${j.id}/download`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'video/mp4');}
  const connection=await(await fetch(f.app.url+'/api/flow-production/status')).json();assert.equal(connection.connected,true);
});

test('Kai web orchestration finishes without a TTS dependency and retains Flow spending limits',async t=>{
  const f=await fixture(t,{kai:true});const pending=await f.create('Turn a shoebox into a desk organizer.',30);
  const done=await f.wait(pending.id,j=>['complete','error','waiting_setup'].includes(j.status));
  assert.equal(done.status,'complete',done.message);assert.equal(done.generations,2);assert.equal(done.spentCredits,30);
  assert.equal(done.artifacts.actualVoiceover,false);assert.equal(done.artifacts.soundDesign,true);assert.equal(done.artifacts.captionsBurned,false);
  assert.ok(done.scenes.every(s=>s.assetId));assert.equal(done.project.brief.style,'kai');
});

test('web budget stops before any paid clip and resumes the same plan after raising its cap',async t=>{
  const f=await fixture(t);const first=await f.create('Fixture limited',29);
  const stopped=await f.wait(first.id,j=>j.status==='waiting_setup');
  assert.match(stopped.message,/Anggaran belum cukup/);assert.equal(f.paid(),0);assert.equal(stopped.generations,0);
  await f.post(`/api/autopilot/jobs/${first.id}/resume`,{options:{creditBudget:30}});
  const finished=await f.wait(first.id,j=>j.status==='complete');assert.equal(f.paid(),2);assert.equal(finished.spentCredits,30);assert.equal(f.plans.length,1);
});

test('an uncertain submission stops subsequent web jobs and never submits the same shot again',async t=>{
  const f=await fixture(t,{loseResponse:true});const first=await f.create('Uncertain fixture');
  const error=await f.wait(first.id,j=>j.status==='error');assert.equal(error.submissionUncertain,true);assert.equal(f.paid(),1);
  const second=await f.create('Queued fixture');await f.wait(second.id,j=>j.status==='waiting_setup');assert.equal(f.paid(),1);
  await f.post(`/api/autopilot/jobs/${first.id}/resume`,{});await f.wait(first.id,j=>j.status==='error');assert.equal(f.paid(),1);
});
