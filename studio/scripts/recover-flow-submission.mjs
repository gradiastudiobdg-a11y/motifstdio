// Recover an exact already-submitted result. There is no generate call here.
import fs from 'node:fs/promises';import path from 'node:path';
import { FlowQuotedMcp } from '../automation/flow-quoted-mcp.mjs';
import { FlowMcpProduction } from '../automation/flow-mcp-production.mjs';
import { flowMcpEnvironment } from '../automation/flow-mcp-environment.mjs';
const studio=path.resolve(import.meta.dirname,'..'),id=process.argv[2],sceneId=process.argv[3];
if(!/^[a-f\d-]{36}$/i.test(id||'')||!/^scene-\d{2}$/.test(sceneId||''))throw Error('Supply a job UUID and scene-NN.');
const jobDir=path.join(studio,'.studio/jobs',id),job=JSON.parse(await fs.readFile(path.join(jobDir,'job.json'),'utf8'));
if(!['error','waiting_setup'].includes(job.status))throw Error('Stop the job before recovery.');
if(!(await flowMcpEnvironment(studio)).FLOW_CDP_URL)throw Error('Existing Brave connection unavailable.');
const scene=job.scenes.find(s=>s.id===sceneId);if(!scene||scene.assetId)throw Error('No unresolved scene.');
const mcp=new FlowQuotedMcp(studio),adapter=new FlowMcpProduction({mcp});
try{
  const state=await mcp.call('flow_browser_state');if(state.stage!=='workspace')throw Error(`Flow needs attention: ${state.stage}`);
  const receipt=await adapter.recoverSubmitted({jobDir,scene,projectId:job.flowProjectId});
  console.log(JSON.stringify({state:receipt.state,sceneId,mediaId:receipt.mediaId,recovery:receipt.recovery,additionalGenerations:0}));
}finally{await mcp.close();}
