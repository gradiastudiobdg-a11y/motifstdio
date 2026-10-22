import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreditCost, isFlowUrl, allowedMediaUrl, validateTask, assertCost, recoverMode } from '../core.mjs';
const task = { jobId:'job-1',sceneId:'scene-1',aspectRatio:'9:16',outputs:1,budgetGranted:true,remainingCredits:60,remainingGenerations:3,prompt:'A fixed subject climbs one small step.',duration:6 };
test('only intended Flow pages and media hosts are allowed', () => {
  assert.equal(isFlowUrl('https://flow.google.com/project/a'),true);
  assert.equal(isFlowUrl('https://labs.google/fx/tools/flow/project/a'),true);
  assert.equal(isFlowUrl('https://labs.google/search'),false);
  assert.equal(allowedMediaUrl('https://lh3.googleusercontent.com/generated.mp4?sig=abc'),true);
  for(const u of ['https://flow.google.com.evil.test/a','http://flow.google.com/a','https://storage.googleapis.com/a','file:///a.mp4','blob:https://flow.google.com/a'])assert.equal(allowedMediaUrl(u),false);
});
test('explicit cost and bounded single portrait task are required', () => {
  assert.equal(parseCreditCost('Generate video · 20 credits'),20);
  assert.equal(parseCreditCost('20 kredit'),20);
  for(const text of ['Balance 2000','20 credits / 10 credits','1,000 credits','Generate'])assert.equal(parseCreditCost(text),null);
  assert.equal(validateTask(task),'job-1.scene-1');
  assert.throws(()=>validateTask({...task,aspectRatio:'16:9'}));
  assert.throws(()=>validateTask({...task,outputs:2}));
  assert.throws(()=>assertCost(null,task));
  assert.throws(()=>assertCost(61,task));
});
test('submitted intent can only capture and never submit again', () => {
  const submitted={...task,status:'submitted',persistedIntentId:'intent1'};
  assert.equal(recoverMode(task,null),'prepare');
  assert.equal(recoverMode(submitted,{id:'job-1.scene-1',intentId:'intent1'}),'capture');
  assert.equal(recoverMode(submitted,null),'blocked');
  assert.equal(recoverMode(submitted,{id:'job-1.scene-1',intentId:'different'}),'blocked');
  assert.equal(recoverMode(task,{id:'old',phase:'intent'}),'blocked');
});
