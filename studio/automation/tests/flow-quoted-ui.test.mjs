import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = path.join(studioDir, '.studio/vendor/google-flow-mcp-reference');
const brave = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
test('generation response body is consumed before click navigation can discard it; no second click', {skip:!existsSync(path.join(repo,'dist/ui.js'))},async()=>{
  const {FlowUi}=await import(pathToFileURL(path.join(repo,'dist/ui.js')).href);let navigated=false,clicks=0,readBeforeNavigation=false;
  const page={waitForResponse(){return Promise.resolve({async text(){assert.equal(navigated,false);readBeforeNavigation=true;return JSON.stringify([['wrb.fr','MZZa6b',JSON.stringify({existingResult:true})]]);}});}};
  const ui=new FlowUi(page);ui.generateButton=()=>({async click(){clicks++;await new Promise(resolve=>setImmediate(resolve));navigated=true;}});
  const result=await ui.submitGeneration();assert.deepEqual(result.data,{existingResult:true});assert.equal(readBeforeNavigation,true);assert.equal(clicks,1);
});
test('local composer fixture verifies Indonesian settings, 9:16, x1 and price without a Generate click', { skip: !existsSync(brave) || !existsSync(path.join(repo, 'dist/ui.js')), timeout: 20000 }, async t => {
  const { chromium } = await import(pathToFileURL(path.join(repo, 'node_modules/playwright-core/index.mjs')).href);
  const { FlowUi } = await import(pathToFileURL(path.join(repo, 'dist/ui.js')).href);
  const browser = await chromium.launch({ executablePath: brave, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(500);
  await page.setContent(`<main><div contenteditable=true>Prompt</div><button aria-label="Mulai pembuatan" onclick="window.generated++">arrow_forward</button><button aria-label="Pemicu setelan" onclick="menu.hidden=!menu.hidden">Omni 1.1 Flash</button></main>
  <div id=menu hidden><button role=radio data-field=kind data-value=video>videocam<br>Video</button><button data-field=input data-value=ingredients>chrome_extension<br>Bahan</button><button data-field=aspect data-value="9:16">crop_9_16<br>9:16</button><button>Omni 1.1 Flash arrow_drop_down</button><button data-field=resolution data-value=720p>720p</button><button data-field=duration data-value=10>10 dtk</button><button data-field=count data-value=1>x1</button><p id=price>Pembuatan akan menggunakan 15 kredit</p></div>
  <script>window.generated=0;window.settings={};document.addEventListener('keydown',e=>{if(e.key==='Escape')menu.hidden=true});document.querySelectorAll('[data-field]').forEach(el=>el.onclick=()=>settings[el.dataset.field]=el.dataset.value);</script>`);
  const ui = new FlowUi(page);
  assert.equal(await ui.isManualMode(), true);
  const price = await ui.configure({ kind: 'video', input: 'ingredients', aspect: '9:16', model: 'Omni 1.1 Flash', resolution: '720p', durationSec: 10, count: 1 });
  assert.equal(price, 15);
  assert.equal(await page.locator('#menu').isVisible(), false);
  await ui.typePrompt('A local visual-only prompt.');
  assert.deepEqual(await page.evaluate(() => window.settings), { kind: 'video', input: 'ingredients', aspect: '9:16', resolution: '720p', duration: '10', count: '1' });
  assert.equal(await page.evaluate(() => window.generated), 0);
  await page.locator('[aria-label="Pemicu setelan"]').click();
  await page.locator('#price').evaluate(el => { el.textContent = 'Biaya tidak diketahui'; });
  assert.equal(await ui.readQuote(), undefined);
  assert.equal(await page.evaluate(() => window.generated), 0);
});
