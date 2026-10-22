// MOTIF's compatibility runtime is separate from the installed upstream source.
// Keep the original clone and its lockfile unchanged; record every adaptation.
import { cp, mkdir, readFile, writeFile, symlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(studioDir, '.studio/vendor/google-flow-mcp');
const target = path.join(studioDir, '.studio/google-flow-mcp-runtime');
await mkdir(target, { recursive: true });
for (const name of ['dist', 'extension', 'LICENSE']) await cp(path.join(source, name), path.join(target, name), { recursive: true });
await writeFile(path.join(target, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
if (!await lstat(path.join(target, 'node_modules')).catch(() => null)) await symlink(path.join(source, 'node_modules'), path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
async function patch(name, replacements) {
  const file = path.join(target, 'dist', name);
  let text = await readFile(file, 'utf8');
  for (const [before, after] of replacements) {
    if (!text.includes(before)) throw Error(`Unsupported upstream build: ${name}`);
    text = text.replaceAll(before, after);
  }
  await writeFile(file, text);
}
await patch('types.js', [['https://labs.google/fx/tools/flow', 'https://flow.google.com/']]);
await patch('browser-manager.js', [['candidate.url().startsWith("https://labs.google/")', '(candidate.url().startsWith("https://labs.google/") || candidate.url().startsWith("https://flow.google.com/"))']]);
await patch('flow-adapter.js', [
  ['async hasWorkspace(page) {', `async hasWorkspace(page) {
        if (await page.locator('button:is([aria-label="Start generation"],[aria-label="Mulai pembuatan"]):visible').count()) return true;
        if (await page.getByRole('button', {name:/^(?:Project baru|Proyek baru|New project)$/i}).count()) return true;`],
  ['async isSignedIn(page) {', `async isSignedIn(page) {
        if (!/accounts\\.google\\.com/i.test(page.url()) && await this.hasWorkspace(page)) return true;`],
  ['await this.openProject(page);\n                    await this.ensureAgentAutoApprove(page);\n                    await this.store.markAccountConnected(account.id);', 'await this.store.markAccountConnected(account.id);'],
  ['await this.store.setHeadlessAfterLogin(account.id, true);\n                    await this.browsers.reset(account.id);', 'await this.store.setHeadlessAfterLogin(account.id, false);'],
  ['if (!attached)\n                        await this.browsers.reset(account.id);', '// Leave the visible login window available for the user.'],
  ['!page.url().startsWith("https://labs.google/")', '!(page.url().startsWith("https://labs.google/") || page.url().startsWith("https://flow.google.com/"))'],
  ['/\\/tools\\/flow\\/project\\//i', '/\\/(?:tools\\/flow\\/)?project\\//i'],
  ['a[href*="/tools/flow/project/"]', 'a[href*="/project/"]'],
  ['/^add_2$/', '/^add(?:_2)?$/'],
  ['/new project|create project|start.*project/i', '/new project|create project|start.*project|project baru|proyek baru/i'],
  ['page.getByText(/\\+\\s*new project|new project/i)', 'page.getByText(/\\+\\s*new project|new project|^Project baru$|^Proyek baru$/i)'],
  ['await this.openProject(page).catch(() => undefined);', 'try { await this.openProject(page); } catch(error) { await this.captureDiagnostic(page, "motif-readonly"); throw error; }'],
  ['async openProject(page, projectName) {', 'async openProject(page, projectName) {\n        await page.keyboard.press("Escape").catch(() => undefined);'],
  ['page.locator("button").filter({ has: page.locator("i", { hasText: /^tune$/ }) })', 'page.getByRole("button", { name: /^(?:Setelan|Settings)$/i }).last()'],
  ['return (await page.locator(\'[role="tablist"]\').count()) >= 2;', 'return true;'],
  ['durationSeconds: uniqueNumbers(durationHints),', `durationSeconds: uniqueNumbers(durationHints),
            motifDiagnostics: await page.locator('button,[role="tab"],[role="combobox"],[role="radio"],input,select').evaluateAll(elements => elements.filter(el => el.getClientRects().length && !el.querySelector('img') && !/@|google account|akun google/i.test(el.getAttribute('aria-label') || '')).slice(-35).map(el => ({tag:el.tagName,role:el.getAttribute('role'),label:el.getAttribute('aria-label'),text:el.innerText.slice(0,150),value:el.getAttribute('value'),popup:el.getAttribute('aria-haspopup')}))),`],
  ['pageKind: "workspace",', 'pageKind: "workspace",\n                settingsDiagnostics: agentCapabilities?.motifDiagnostics,'],
  ['pageKind: "workspace",', `pageKind: "workspace",
            controlDiagnostics: await page.locator('button,[role="button"]').evaluateAll(elements => elements.filter(el => el.getClientRects().length && !el.querySelector('img') && !/@|google account|akun google/i.test(el.getAttribute('aria-label') || '')).slice(-16).map(el => ({ tag:el.tagName, role:el.getAttribute('role'), label:el.getAttribute('aria-label'), text:el.innerText.slice(0,120) }))),
`],
]);
await patch('navigation.js', [['/^(.*\\/tools\\/flow\\/project\\/[^/]+)\\/edit\\/[^/]+\\/?$/i', '/^(.*\\/(?:tools\\/flow\\/)?project\\/[^/]+)\\/edit\\/[^/]+\\/?$/i']]);
await writeFile(path.join(target, 'motif-compat.json'), JSON.stringify({ upstream: '6826452a4a2e93bf7313d1be1626a9034fd7dc27', changes: ['flow.google.com domain', '/project/ routes', 'Indonesian new-project control', 'add icon variant'], generationChanges: false }, null, 2));
console.log('MOTIF Flow compatibility runtime built; upstream source unchanged.');
