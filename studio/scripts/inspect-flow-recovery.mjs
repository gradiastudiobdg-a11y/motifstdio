// Read-only recovery evidence. Never submits, deletes or retries a generation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { FlowQuotedMcp } from '../automation/flow-quoted-mcp.mjs';
import { flowMcpEnvironment } from '../automation/flow-mcp-environment.mjs';
const studio=path.resolve(import.meta.dirname,'..');
const id=process.argv[2];if(!/^[a-f\d-]{36}$/i.test(id||''))throw Error('Supply one job UUID.');
const jobDir=path.join(studio,'.studio/jobs',id),job=JSON.parse(await fs.readFile(path.join(jobDir,'job.json'),'utf8'));
if(!['error','waiting_setup','waiting_login'].includes(job.status))throw Error('Inspect only a stopped job to avoid concurrent browser work.');
if(!(await flowMcpEnvironment(studio)).FLOW_CDP_URL)throw Error('The existing Brave endpoint is unavailable. Do not launch another profile.');
const mcp=new FlowQuotedMcp(studio);
try{
  const browser=await mcp.call('flow_browser_state');if(browser.stage!=='workspace')throw Error(`Flow needs attention: ${browser.stage}`);
  const project=await mcp.call('flow_get_project',{project_id:job.flowProjectId});
  const candidates=job.scenes.map(scene=>({sceneId:scene.id,hasLocalAsset:!!scene.assetId,promptHash:scene.promptHash,matches:(project.media||[]).filter(m=>m.kind==='video'&&m.prompt===scene.prompt).map(m=>({mediaId:m.mediaId,workflowId:m.workflowId,kind:m.kind})),workflowMatches:(project.generations||[]).filter(w=>w.caption===scene.prompt).map(w=>({mediaId:w.mediaId,workflowId:w.workflowId,created:w.created}))}));
  const live=await mcp.call('flow_status');
  const evidence={jobId:id,projectId:job.flowProjectId,observedAt:new Date().toISOString(),credits:live.credits,mediaCount:project.media?.length,candidates};
  await fs.writeFile(path.join(jobDir,'flow-recovery-inspection.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
}finally{await mcp.close();}
