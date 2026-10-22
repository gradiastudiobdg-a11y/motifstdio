import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KAI_BRIEF } from '../public/kai-brand.mjs';
import { createProject, validateProject, generateIdeas, toSrt, buildAnimationPrompt } from '../public/planner.mjs';
import { planWithCodex } from '../automation/codex-plan.mjs';
import { createFoleyTrack } from '../automation/finish-foley.mjs';

test('Kai starter keeps the practical make, silent audio contract and exact portrait duration',()=>{
  for(const duration of [8,15,30,45,60]){
    const p=createProject({...KAI_BRIEF,duration,aspectRatio:'16:9',fps:24});
    assert.equal(p.brief.aspectRatio,'9:16');assert.equal(p.brief.fps,30);
    assert.equal(p.scenes.reduce((n,s)=>n+s.duration,0),duration);
    assert.deepEqual(validateProject(p),[]);assert.equal(toSrt(p),'');
    assert.ok(p.scenes.every(s=>s.voiceover===''));
    assert.match(p.scenes.map(s=>s.visual).join(' '),/dividers/);
    const prompt=buildAnimationPrompt(p,p.scenes[0]);assert.match(prompt,/sage cotton/);assert.match(prompt,/34-year-old/);
    assert.ok(!prompt.includes(p.scenes[0].headline),'Typography stays out of generated footage.');
  }
  const idea=generateIdeas(KAI_BRIEF).find(i=>/jar/i.test(i.angle));const jar=createProject(KAI_BRIEF,idea);
  assert.equal(jar.brief.topic,idea.angle);assert.ok(!jar.scenes[0].visual.includes('shoebox'));
  const bad=createProject(KAI_BRIEF);bad.scenes[0].voiceover='A motivational narration.';assert.ok(validateProject(bad).length);
});

test('Codex receives the Kai brief and silent DIY rules without a motivational narration requirement',async t=>{
  const jobDir=await fs.mkdtemp(path.join(os.tmpdir(),'kai-codex-contract-'));t.after(()=>fs.rm(jobDir,{recursive:true,force:true}));
  let requests=0;
  const p=await planWithCodex({brief:KAI_BRIEF,jobDir,executable:'fixture',run:async(_exe,args,options)=>{
    requests++;assert.match(options.input,/silent.*DIY|silent.*home/);assert.match(options.input,/voiceover strings MUST be empty/);assert.ok(!options.input.includes('Speak Indonesian'));
    const schema=JSON.parse(await fs.readFile(args[args.indexOf('--output-schema')+1],'utf8'));assert.ok(schema.properties.brief.properties.style.enum.includes('kai'));
    const value=createProject(KAI_BRIEF);delete value.captions;delete value.musicVolume;
    await fs.writeFile(args[args.indexOf('-o')+1],JSON.stringify(value));return{stdout:'',stderr:'Local planning contract fixture, no model call.'};
  }});
  assert.equal(requests,1);assert.equal(p.captions,false);assert.equal(p.musicVolume,0);assert.deepEqual(p.scenes.map(s=>s.duration),[10,10,10]);
});

test('Foley is actual deterministic PCM, records estimated timing and accepts explicit cue revisions',()=>{
  const project=createProject(KAI_BRIEF), a=createFoleyTrack(project),b=createFoleyTrack(project);
  assert.equal(a.wav.length,44+30*48000*4);assert.equal(a.wav.subarray(0,4).toString(),'RIFF');assert.deepEqual(a.wav,b.wav);
  assert.equal(a.timing,'estimated-from-scene-actions');assert.ok(a.cues.length>0);
  assert.ok(a.wav.subarray(44).some(byte=>byte!==0));
  const explicit=createFoleyTrack({...project,soundCues:[{time:1.2,kind:'tap'}]});assert.equal(explicit.timing,'editable-cues');assert.deepEqual(explicit.cues,[{time:1.2,kind:'tap'}]);
  assert.throws(()=>createFoleyTrack({...project,soundCues:[{time:31,kind:'tap'}]}),/Invalid Foley/);
});
