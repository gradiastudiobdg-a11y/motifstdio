import path from 'node:path';
import {writeFile,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {flowMcpEnvironment} from '../automation/flow-mcp-environment.mjs';
const studio=path.resolve(import.meta.dirname,'..');
const env=await flowMcpEnvironment(studio);
if(!env.FLOW_CDP_URL)throw Error('No live Flow browser; no launch attempted');
Object.assign(process.env,env);
const base=path.join(studio,'.studio/vendor/google-flow-mcp-reference/dist');
const {FlowBrowser,optionsFromEnv}=await import(pathToFileURL(path.join(base,'browser.js')));
const {FlowUi}=await import(pathToFileURL(path.join(base,'ui.js')));
const {FlowClient}=await import(pathToFileURL(path.join(base,'flow.js')));
const browser=new FlowBrowser(optionsFromEnv());
try{
 const state=await browser.inspectState();if(state.stage!=='workspace')throw Error(state.stage);
 const flow=new FlowClient(browser);
 const dest=path.resolve(studio,'../exports/kai-moon-mirror/pilot.json');
 let pilot;try{pilot=JSON.parse(await readFile(dest,'utf8'))}catch{}
 if(!pilot){const p=await flow.createProject('Kai — Moon mirror pilot');pilot={version:1,budgetCredits:200,spentReserved:0,project:p,attempts:[]};await writeFile(dest,JSON.stringify(pilot,null,2));}
 const page=await browser.ready();const ui=new FlowUi(page);
 const id=pilot.project.projectId||pilot.project.id;
 if(!id)throw Error('Project id missing');
 if(!process.argv.includes('--current')){
 await ui.openProject(id);await page.keyboard.press('Escape');await page.getByRole('button',{name:'Tutup',exact:true}).click({timeout:1000}).catch(()=>{});await ui.setMode('manual');await ui.clearPrompt();
 const quote=await ui.configure(process.argv.includes('--image')?{kind:'image',aspect:'9:16',count:1}:{kind:'video',input:'frames',aspect:'9:16',model:'Omni 1.1 Flash',resolution:'720p',durationSec:4,count:1});
 console.log(JSON.stringify({quotedCredits:quote}));
 if(process.argv.includes('--picker')){await page.getByRole('button',{name:'Awal',exact:true}).click();await page.waitForTimeout(600);}
 if(process.argv.includes('--upload')){
  await page.getByRole('button',{name:'Awal',exact:true}).click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:/^upload\s+Upload media$/i}).click();
  await(await chooser).setFiles(path.resolve(studio,'../exports/kai-moon-mirror/keyframes/hero-day-v1.png'));
  await page.waitForTimeout(3000);
 }
 }
 if(process.argv.includes('--upload-current')){
  const choice=page.waitForEvent('filechooser',{timeout:8000}).catch(()=>null);
  await page.getByRole('button',{name:/^upload\s+Upload media$/i}).click();
  const chooser=await choice;
  if(chooser){await chooser.setFiles(path.resolve(studio,'../exports/kai-moon-mirror/keyframes/hero-day-v1.png'));await page.waitForTimeout(2000);}
  console.log(JSON.stringify({fileChooser:!!chooser,inputs:await page.locator('input[type=file]').count(),dialogs:await page.locator('[role=dialog]').allTextContents()}));
 }
 const controls=await page.locator('button,input,[role=menuitem]').evaluateAll(es=>es.filter(e=>(e.offsetParent||e.type==='file')&&!e.querySelector('img')&&!/@|account|akun/i.test(e.getAttribute('aria-label')||'')).map(e=>({tag:e.tagName,type:e.getAttribute('type'),label:e.getAttribute('aria-label'),text:(e.innerText||'').slice(0,100)})).slice(-35));
 console.log(JSON.stringify({stage:state.stage,projectId:id,controls}));
}catch(e){console.log(JSON.stringify({error:String(e.message).replace(/https?:\S+|[\w.+-]+@[\w.-]+/g,'[private]')}));process.exitCode=1}
finally{await browser.close();}
process.exit(process.exitCode||0);
