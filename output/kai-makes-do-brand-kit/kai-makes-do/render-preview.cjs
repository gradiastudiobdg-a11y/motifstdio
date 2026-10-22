const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Fadh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = __dirname;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe' });
  const page = await browser.newPage({ viewport: { width: 1560, height: 1200 }, deviceScaleFactor: 1 });
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'brand-preview.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.photo').first().waitFor({ state: 'visible' });
  await page.locator('#brand-board').screenshot({ path: path.join(root, 'brand-board.png') });
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Process', exact: true }).click();
  if (await page.locator('#interactive-preview .process').count() !== 1) throw new Error('Process preview did not update.');
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  if (await page.locator('#interactive-preview .reveal').count() !== 1) throw new Error('Reveal preview did not update.');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await page.locator('#brand-board').screenshot({ path: path.join(root, 'brand-board-mobile.png') });
  await page.setViewportSize({ width: 320, height: 700 });
  const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  await page.setViewportSize({ width: 1080, height: 1920 });
  for (const kind of ['opening', 'process', 'reveal']) {
    const frameUrl = pathToFileURL(path.join(root, 'brand-preview.html'));
    frameUrl.searchParams.set('export', kind);
    await page.goto(frameUrl.href);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#export-root .photo').evaluate(image => image.decode());
    const canvas = page.locator('#export-root .frame-canvas');
    await canvas.screenshot({ path: path.join(root, `${kind}-1080x1920.png`) });
    const bounds = await canvas.boundingBox();
    if (bounds.width !== 1080 || bounds.height !== 1920) throw new Error('Incorrect master dimensions.');
  }

  const font = (await fs.readFile(path.join(root, 'assets/fonts/DMSans-Variable.ttf'))).toString('base64');
  await page.setContent(`<style>@font-face{font-family:DM;src:url(data:font/ttf;base64,${font});font-weight:100 900}</style><span style="font-family:DM;font-weight:800">kai makes do.</span>`);
  await page.evaluate(() => document.fonts.ready);
  const textWidth = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '800 96px DM';
    ctx.letterSpacing = '-4px';
    return Math.ceil(ctx.measureText('kai makes do.').width);
  });
  const svgWidth = textWidth + 62;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="124" viewBox="0 0 ${svgWidth} 124" role="img" aria-label="Kai Makes Do wordmark"><style>@font-face{font-family:DM;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:100 900}text{font-family:DM,Arial,sans-serif;font-weight:800;font-size:96px;letter-spacing:-4px}</style><text x="2" y="96" fill="#29332D">kai makes do.</text><rect x="${textWidth + 24}" y="70" width="24" height="24" fill="#E8B65E"/></svg>`;
  await fs.writeFile(path.join(root, 'wordmark.svg'), svg);
  await page.setViewportSize({ width: svgWidth, height: 124 });
  await page.goto(pathToFileURL(path.join(root, 'wordmark.svg')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(root, 'wordmark.png'), omitBackground: true });

  if (desktopOverflow || mobileOverflow || narrowOverflow) issues.push('Horizontal overflow found.');
  const report = { checked: '2026-10-21', desktop: 1560, mobile: [390, 320], dimensions: [1080, 1920], previewInteraction: 'passed', desktopOverflow, mobileOverflow, narrowOverflow, pageErrors: issues };
  await fs.writeFile(path.join(root, 'visual-qa.json'), JSON.stringify(report, null, 2));
  await browser.close();
  if (issues.length) throw new Error(issues.join('\n'));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
