import path from 'node:path';
import {readFile,writeFile,open,mkdir,stat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {flowMcpEnvironment} from '../automation/flow-mcp-environment.mjs';
const studio=path.resolve(import.meta.dirname,'..'),root=path.resolve(studio,'../exports/kai-a-forest-inside');
const pilotLock=await open(path.join(root,'.pilot-operation.lock'),'wx').catch(()=>{throw Error('Another pilot operation is running; wait rather than overlapping browser operations')});
const env=await flowMcpEnvironment(studio);if(!env.FLOW_CDP_URL)throw Error('Flow browser not connected');Object.assign(process.env,env);
const base=path.join(studio,'.studio/vendor/google-flow-mcp-reference/dist');
const load=n=>import(pathToFileURL(path.join(base,n+'.js')));
const [{FlowBrowser,optionsFromEnv},{FlowUi},{FlowClient},P,{downloadTo}]=await Promise.all(['browser','ui','flow','protocol','export'].map(load));
const b=new FlowBrowser(optionsFromEnv());const ledgerFile=path.join(root,'pilot.json');
const save=async x=>{const f=await open(ledgerFile,'w');try{await f.writeFile(JSON.stringify(x,null,2));await f.sync()}finally{await f.close()}};
try{
 if((await b.inspectState()).stage!=='workspace')throw Error('Flow needs login/verification');
 const f=new FlowClient(b),page=await b.ready(),ui=new FlowUi(page),ledger=JSON.parse(await readFile(ledgerFile,'utf8'));
 const action=process.argv[2],id=ledger.project.id;
 if(action==='recover-status'){
  const spec=JSON.parse(await readFile(path.resolve(process.argv[3]),'utf8')),mediaId=process.argv[4],a=ledger.attempts.find(a=>a.id===spec.id);
  if(!a||a.promptHash!==createHash('sha256').update(spec.prompt).digest('hex'))throw Error('Unchanged reserved intent required');
  const c=await f.contents(id);if(!c.media.some(m=>m.mediaId===mediaId&&m.kind==='video'))throw Error('Asset not in reserved project');
  const s=await f.videoStatus([mediaId]);if(s.items?.length!==1||s.items[0].prompt!==spec.prompt)throw Error('Exact status prompt does not match');
  if(ledger.attempts.some(x=>x.id!==a.id&&x.result?.jobs?.some(j=>j.mediaId===mediaId)))throw Error('Asset linked to another intent');
  a.result={jobs:[{mediaId,workflowId:s.items[0].workflowId,modelKey:s.items[0].modelKey}]};a.status='submitted';a.recovery={method:'project-membership-and-exact-status-prompt',additionalGenerations:0};await save(ledger);console.log(JSON.stringify({id:a.id,mediaId,totalReserved:ledger.spentReserved}));
 }
 if(action==='import-kai'||action==='import-file'){
  await ui.openProject(id);await page.keyboard.press('Escape');await page.getByRole('button',{name:/^(Menu tambahkan media|Add media menu)$/i}).click();
  const choice=page.waitForEvent('filechooser',{timeout:10000}).catch(()=>null);
  await page.getByRole('menuitem').filter({hasText:/^uploadUpload$/}).click();const chooser=await choice;if(!chooser)throw Error('No upload file chooser');
  await chooser.setFiles(action==='import-file'?path.resolve(process.argv[3]):path.resolve(studio,'../output/kai-makes-do-brand-kit/kai-makes-do/assets/kai-home-reference.png'));await page.waitForTimeout(3000);
  console.log(JSON.stringify({controls:await page.locator('[role=dialog] button,[role=dialog] input').evaluateAll(es=>es.map(e=>({text:e.innerText,label:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder')})))}));
 }
 if(action==='import-inspect'){
  await ui.openProject(id);await page.getByRole('button',{name:/^(Menu tambahkan media|Add media menu)$/i}).click();await page.waitForTimeout(400);
  console.log(JSON.stringify(await page.locator('[role=menuitem]').allTextContents()));
 }
 if(action==='download-all'){
  await mkdir(path.join(root,'sources'),{recursive:true});
  for(const a of ledger.attempts){const mediaId=a.kind==='image'?a.result?.[0]?.mediaId:a.result?.jobs?.[0]?.mediaId;if(!mediaId)continue;
   if(a.kind==='video'){const s=await f.videoStatus([mediaId]);if(s.items?.[0]?.state!=='succeeded'){console.log(JSON.stringify({id:a.id,state:s.items?.[0]?.state}));continue}}
   const name=a.id+(a.kind==='image'?'.png':'.mp4'),file=path.join(root,'sources',name);
   if(!await stat(file).catch(()=>null)){const m=await f.getMedia(mediaId);await downloadTo(a.kind==='image'?m.imageUrl:m.videoUrl,name,path.join(root,'sources'))}
   console.log(JSON.stringify({id:a.id,downloaded:true}));
  }
 }
 if(action==='recover'){
 const spec=JSON.parse(await readFile(path.resolve(process.argv[3]),'utf8'));const c=await f.contents(id);const found=c.media.filter(x=>x.kind===spec.kind&&x.prompt===spec.prompt);if(found.length!==1)throw Error('No unique exact prompt recovery');
 let a=ledger.attempts.find(x=>x.id===spec.id);if(!a)throw Error('Recovery needs an existing reserved intent');
 const caption=c.workflows.find(w=>w.mediaId===found[0].mediaId)?.caption||found[0].caption;
 a.result=spec.kind==='video'?{jobs:[{mediaId:found[0].mediaId,workflowId:found[0].workflowId,caption}]}:[{mediaId:found[0].mediaId,caption}];a.status='submitted';a.recovery='unique-exact-prompt-read-only';await save(ledger);console.log(JSON.stringify({id:a.id,mediaId:found[0].mediaId,totalReserved:ledger.spentReserved}));
 }
 if(action==='status'){const r=await f.videoStatus([process.argv[3]]);console.log(JSON.stringify(r,(k,v)=>/url/i.test(k)?undefined:v));}
 if(action==='frames'){console.log(JSON.stringify(await page.locator('flow-frame-input,flow-frame-chip,flow-ingredient-chip,[class*=frame-chip],[class*=frames],img').evaluateAll(es=>es.filter(e=>e.offsetParent&&!e.closest('flow-user-menu')).map(e=>({tag:e.tagName,cls:e.className,alt:e.getAttribute('alt'),text:(e.innerText||'').slice(0,70)})).slice(-18))));}
 if(action==='picker'){
 await page.keyboard.press('Escape');await page.locator('button:is([aria-label="Add ingredients to the prompt box"],[aria-label="Tambahkan bahan ke kotak perintah"]):visible').click();await page.waitForTimeout(800);
 console.log(JSON.stringify({inputs:await page.locator('input').evaluateAll(es=>es.map(e=>({placeholder:e.placeholder,label:e.getAttribute('aria-label')}))),options:await page.locator('[role=option]').allTextContents(),buttons:await page.locator('[role=dialog] button').allTextContents()}));
 }
 if(action==='contents'){const c=await f.contents(id);console.log(JSON.stringify({credits:await f.credits(),media:c.media.map(x=>({mediaId:x.mediaId,kind:x.kind})),workflows:c.workflows}));}
 if(action==='generate'){
  const spec=JSON.parse(await readFile(path.resolve(process.argv[3]),'utf8'));
  if(ledger.attempts.some(a=>a.id===spec.id))throw Error('Intent already exists; recover instead of resubmitting');
  const references=[...(spec.referenceCaptions||[]),...(spec.referenceAttempts?.map(ref=>{const a=ledger.attempts.find(a=>a.id===ref);const caption=a?.result?.[0]?.caption;if(!caption)throw Error('Missing image reference receipt: '+ref);return caption}) || (spec.referenceCaption?[spec.referenceCaption]:[]))];
  if(spec.frame&&references.length!==1)throw Error('Exactly one start frame required');
  await ui.openProject(id);await page.keyboard.press('Escape');await ui.setMode('manual');await ui.clearPrompt();
  await ui.configure({kind:spec.kind,input:spec.frame?'frames':'ingredients',aspect:'9:16',model:spec.kind==='image'?undefined:(spec.modelFamily||'Omni 1.1 Flash'),resolution:spec.kind==='video'&&!spec.fixedSettings?'720p':undefined,durationSec:spec.fixedSettings?undefined:spec.durationSec,count:1});
  for(const [referenceIndex,referenceCaption] of references.entries()){
   if(spec.frame)await page.getByRole('button',{name:'Awal',exact:true}).click();else await page.locator('button:is([aria-label="Add ingredients to the prompt box"],[aria-label="Tambahkan bahan ke kotak perintah"]):visible').click();
   const search=page.locator('input:is([placeholder="Search assets"],[aria-label="Telusuri aset"])');await search.fill(referenceCaption);await page.waitForTimeout(800);
   const option=page.locator('.asset-item-container button[role=option]').filter({hasText:referenceCaption});if(await option.count()!==1)throw Error('Reference ambiguous');await option.click();
   const add=page.getByText(/^(Add to prompt|Tambahkan ke perintah)$/);if(await add.isVisible().catch(()=>false))await add.click();
   await page.waitForTimeout(400);if(!spec.frame&&(await ui.chipKinds()).length!==referenceIndex+1)throw Error('Reference did not attach');
   if(spec.frame&&await page.getByRole('button',{name:'Awal',exact:true}).count())throw Error('Start frame empty');
  }
  const endCaption=spec.endCaption||(spec.endAttempt?ledger.attempts.find(a=>a.id===spec.endAttempt)?.result?.[0]?.caption:undefined);
  if(spec.endAttempt&&!endCaption)throw Error('Missing end frame reference');
  if(endCaption){
   await page.getByRole('button',{name:'Akhir',exact:true}).click();const search=page.locator('input:is([placeholder="Search assets"],[aria-label="Telusuri aset"])');await search.fill(endCaption);await page.waitForTimeout(800);
   const option=page.locator('.asset-item-container button[role=option]').filter({hasText:endCaption});if(await option.count()!==1)throw Error('End reference ambiguous');await option.click();await page.waitForTimeout(400);if(await page.getByRole('button',{name:'Akhir',exact:true}).count())throw Error('End frame empty');
  }
  await ui.typePrompt(spec.prompt);
  await page.locator('button:is([aria-label="Settings trigger"],[aria-label="Pemicu setelan"]):visible').click();
  await page.waitForTimeout(700);
  const composer=(await page.locator('button:is([aria-label="Settings trigger"],[aria-label="Pemicu setelan"]):visible').innerText()).replace(/\s+/g,' ');
  if(!/crop_9_16/.test(composer)||!/(?:^|\s)x1(?:\s|$)/.test(composer))throw Error('Composer aspect/count not confirmed');
  if(spec.kind==='video'&&(!composer.includes('720p')||!new RegExp('\\b'+spec.durationSec+'\\s*(s|dtk)\\b').test(composer)))throw Error('Video duration/resolution not confirmed');
  const lines=(await page.locator('body').innerText()).split('\n').map(x=>x.trim()).filter(x=>/^(Generating will use|Pembuatan akan menggunakan)\s*\d+\s*(credits?|kredit)$/i.test(x));
  if(lines.length!==1)throw Error('Unknown/ambiguous cost');const quote=Number(lines[0].match(/\d+/)[0]);
  await page.keyboard.press('Escape');
  if(quote>spec.maxCredits||ledger.spentReserved+quote>ledger.budgetCredits)throw Error('Budget exceeded');
  const attempt={...spec,composer,promptHash:createHash('sha256').update(spec.prompt).digest('hex'),quote,status:'intent',at:new Date().toISOString()};ledger.spentReserved+=quote;ledger.attempts.push(attempt);await save(ledger);
  console.log(JSON.stringify({reserved:quote,totalReserved:ledger.spentReserved,id:spec.id}));
  let response;
  try{response=await ui.submitGeneration(120000)}catch(error){
   // A possibly charged click is NEVER repeated. Recover only a unique exact
   // full-prompt asset in this reserved project, otherwise stop the batch.
   const c=await f.contents(id);const matches=c.media.filter(m=>m.kind===spec.kind&&m.prompt===spec.prompt);
   if(matches.length!==1)throw Error('Submission uncertain; no unique exact asset. No retry performed.');
   const media=matches[0],caption=c.workflows.find(w=>w.mediaId===media.mediaId)?.caption||media.caption;
   attempt.result=spec.kind==='video'?{jobs:[{mediaId:media.mediaId,workflowId:media.workflowId,caption}]}:[{mediaId:media.mediaId,caption}];
   attempt.status='submitted';attempt.recovery='unique-exact-prompt-read-only';await save(ledger);console.log(JSON.stringify({id:spec.id,result:attempt.result,recoveredWithoutRetry:true}));
  }
  if(response){attempt.status='submitted';attempt.result=JSON.parse(JSON.stringify(spec.kind==='image'?P.parseGeneratedImages(response.data):P.parseVideoJobs(response.data)),(k,v)=>/url/i.test(k)?undefined:v);if(response.error)attempt.error=response.error;await save(ledger);if(response.error)throw Error('Flow refused submission; not retrying');if((spec.kind==='video'?attempt.result.jobs?.length:attempt.result?.length)!==1)throw Error('Submission uncertain: expected one linked asset; no retry performed');console.log(JSON.stringify({id:spec.id,result:attempt.result}));}
 }
 if(action==='download'){
  const mediaId=process.argv[3],name=process.argv[4];const media=await f.getMedia(mediaId);
  const url=media.downloadUrl||media.url||media.videoUrl||media.imageUrl;if(!url){console.log(JSON.stringify({keys:Object.keys(media)}));throw Error('No media URL')}
  await mkdir(path.join(root,'sources'),{recursive:true});const file=await downloadTo(url,name,path.join(root,'sources'));console.log(JSON.stringify({file}));
 }
}catch(e){console.log(JSON.stringify({error:String(e.message).replace(/https?:\S+|[\w.+-]+@[\w.-]+/g,'[private]')}));process.exitCode=1}finally{await b.close();await pilotLock.close();const {unlink}=await import('node:fs/promises');await unlink(path.join(root,'.pilot-operation.lock'));}
process.exit(process.exitCode||0);
