import test from 'node:test';
import assert from 'node:assert/strict';

test('worker persists and reserves before a UI click, refuses duplicate intent, and recovers a lost delivery response', async context => {
  const memory = { token: 'a'.repeat(40), enabled: true }, calls = [];
  let listener, task = { jobId:'job-1',sceneId:'scene-1',aspectRatio:'9:16',outputs:1,budgetGranted:true,remainingCredits:60,remainingGenerations:3,prompt:'A fixed subject climbs one small step.',duration:6,status:'queued' }, completed = false;
  const originalChrome = globalThis.chrome, originalFetch = globalThis.fetch;
  context.after(() => { globalThis.chrome = originalChrome; globalThis.fetch = originalFetch; });
  globalThis.chrome = {
    storage:{local:{async get(keys){return Object.fromEntries(keys.filter(k=>k in memory).map(k=>[k,structuredClone(memory[k])]));},async set(values){Object.assign(memory,structuredClone(values));},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete memory[k];}}},
    runtime:{id:'fixture',getURL:p=>`chrome-extension://fixture/${p}`,onMessage:{addListener:fn=>{listener=fn;}},onInstalled:{addListener(){}}},
    alarms:{create(){},onAlarm:{addListener(){}}},
  };
  globalThis.fetch = async (url, options={}) => {
    const u=new URL(url);calls.push({path:u.pathname,query:u.search,method:options.method||'GET'});
    assert.equal(u.hostname,'127.0.0.1');
    assert.equal(options.headers.Authorization,`Bearer ${memory.token}`);
    if(u.pathname.endsWith('/event')){
      const body=JSON.parse(options.body);
      if(body.status==='submitted'){
        assert.equal(memory.flight.phase,'intent','durable local intent must precede backend reservation');
        assert.equal(memory.flight.intentId,body.persistedIntentId);
        task={...task,status:'submitted',persistedIntentId:body.persistedIntentId};
      }
      return Response.json({accepted:true});
    }
    if(u.pathname.endsWith('/task'))return Response.json({task,flightStatus:completed?'complete':'submitted'});
    return Response.json({ok:true});
  };
  await import(`../background.mjs?fixture=${Date.now()}`);
  const sender={id:'fixture',url:'https://flow.google.com/project/a',tab:{id:7,url:'https://flow.google.com/project/a',active:true}};
  const message=data=>new Promise(resolve=>listener(data,sender,resolve));
  assert.equal((await message({type:'TICK',visible:true})).mode,'prepare');
  const reserved=await message({type:'RESERVE',visible:true,task,cost:20,baseline:['https://lh3.googleusercontent.com/old.mp4']});
  assert.equal(reserved.accepted,true);assert.equal(memory.flight.phase,'reserved');
  assert.equal((await message({type:'CONFIRM',visible:true,intentId:reserved.intentId})).approved,true);
  const duplicate=await message({type:'RESERVE',visible:true,task,cost:20,baseline:[]});
  assert.match(duplicate.error,/in-flight submission/);
  assert.equal(calls.filter(c=>c.path.endsWith('/event')).length,1,'duplicate UI intent must not reserve again');
  assert.equal((await message({type:'TICK',visible:true})).mode,'capture','restart/resume is capture only');
  completed=true;task={...task,sceneId:'scene-2',status:'queued',persistedIntentId:undefined};
  const next=await message({type:'TICK',visible:true});assert.equal(next.mode,'prepare');assert.equal(memory.flight,undefined);
  assert.match(calls.filter(c=>c.path.endsWith('/task')).at(-1).query,/persistedIntentId=/);
  const rejected=await new Promise(resolve=>listener({type:'PAIR',token:'b'.repeat(40)},sender,resolve));assert.match(rejected.error,/Only the extension popup/);
  await message({type:'BLOCK',task,detail:'Settings control needs a verified adapter update.'});
  task=null;const eventCount=calls.filter(c=>c.path.endsWith('/event')).length;
  assert.equal((await message({type:'TICK',visible:true})).mode,'blocked');
  assert.equal(memory.status.status,'blocked','An empty queue must not hide an unresolved UI block behind a ready heartbeat.');
  assert.equal(calls.filter(c=>c.path.endsWith('/event')).length,eventCount,'Polling a blocked job cannot submit or reserve again.');
});
