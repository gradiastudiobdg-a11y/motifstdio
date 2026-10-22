import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectUI, safeLabel } from '../diagnostics.mjs';
test('read-only diagnostics exclude prompt contents, media URLs and account controls',()=>{
  const doc={hidden:false,location:{pathname:'/project/local-fixture'},defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})}};
  const el=(tag,attrs={},text='')=>({tagName:tag,isConnected:true,hidden:false,ownerDocument:doc,parentElement:{tagName:'FLOW-AGENT-COMPOSER',parentElement:null},textContent:text,getAttribute:k=>attrs[k]??null,getBoundingClientRect:()=>({width:300,height:40})});
  const prompt=el('TEXTAREA',{placeholder:'Apa yang ingin Anda buat?'}),video=el('VIDEO');
  Object.defineProperty(prompt,'value',{get(){throw Error('Prompt value must not be read')}});Object.defineProperty(video,'src',{get(){throw Error('Media URL must not be read')}});
  Object.assign(video,{videoWidth:1080,videoHeight:1920,readyState:2});
  const buttons=[el('BUTTON',{'aria-label':'Akun private@example.invalid'},'SECRET IDENTITY'),el('BUTTON',{'aria-label':'Pengaturan video'},'tune'),el('BUTTON',{},'Omni Flash 1.1'),el('BUTTON',{},'Generate 15 credits')];
  doc.querySelectorAll=selector=>selector.startsWith('textarea')?[prompt]:selector.startsWith('button')?buttons:selector==='video'?[video]:[];
  const result=inspectUI(doc),json=JSON.stringify(result);assert.equal(result.project,true);assert.equal(result.prompts.length,1);assert.equal(result.videos[0].width,1080);assert.match(json,/Pengaturan video/);assert.match(json,/15 credits/);assert.doesNotMatch(json,/SECRET|private@|IDENTITY/);assert.equal(result.controls.find(x=>x.label.includes('Omni')).parent,'flow-agent-composer');
});
test('diagnostic labels remove URLs, account addresses and token-like identifiers',()=>{const value=safeLabel('https://example.invalid/?token=secret user@example.invalid '+ 'a'.repeat(64));assert.doesNotMatch(value,/https:|example\.invalid|a{32}/);assert.ok(value.length<=100);});
