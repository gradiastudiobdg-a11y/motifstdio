import { UI, ADAPTER_VERSION } from './selectors.mjs';
import { parseCreditCost, allowedMediaUrl, assertCost } from './core.mjs';
export { ADAPTER_VERSION };
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
export function visible(el) {
  if (!el || !el.isConnected || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const style = el.ownerDocument.defaultView.getComputedStyle(el), box = el.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && box.width > 0 && box.height > 0;
}
const name = el => clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent);
const unique = (items, label) => { if (items.length !== 1) throw Error(`${label}: expected one visible control, found ${items.length}. Adapter needs a verified UI update.`); return items[0]; };
const all = (doc, selector) => [...doc.querySelectorAll(selector)].filter(visible);
const generateMatch = el => UI.generate.test(name(el)) || (/\bcreate\b/i.test(clean(el.textContent)) && /arrow_forward/.test(el.textContent));
const selected = el => el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || ['checked', 'on', 'active'].includes(el.getAttribute('data-state'));
const delay = ms => new Promise(r => setTimeout(r, ms));
const click = async (el, interaction) => { if (interaction?.click) await interaction.click(el); else el.click(); };
function selectedLabel(control, key) {
  if (control.tagName === 'SELECT') return clean(control.selectedOptions[0]?.textContent);
  const raw = clean(control.getAttribute('aria-valuetext') || control.textContent || name(control));
  return raw.replace(UI.settingNames[key], '').replace(/^[\s:·—-]+/, '').trim();
}
function accessibleName(el) {
  const doc = el.ownerDocument, labelled = el.getAttribute('aria-labelledby');
  return clean(el.getAttribute('aria-label') || (labelled && labelled.split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ')) || [...(el.labels || [])].map(x => x.textContent).join(' ') || el.getAttribute('title') || '');
}
export function checkBlockers(doc) {
  // Passive reCAPTCHA anchor/badge frames do not ask for user action.
  const challenges = all(doc, 'iframe').filter(el => /(?:recaptcha|captcha)/i.test(el.src || '') && (/(?:\/bframe|challenge)/i.test(el.src || '') || /challenge|verification expires|tantangan/i.test(el.title || '')));
  if (challenges.length || UI.captcha.test(clean(doc.body?.innerText))) throw Error('CAPTCHA or unusual-activity check is visible. Complete it manually in Flow; the worker will not bypass it.');
  const prompts = all(doc, UI.prompt);
  if (!prompts.length && all(doc, 'button,a,[role="button"]').some(el => UI.login.test(name(el)))) throw Error('LOGIN_REQUIRED: Sign in to the single Flow account in Brave, then resume the job.');
  if (all(doc, '[role="dialog"],dialog[open]').length) throw Error('A Flow dialog needs attention. Resolve it manually before resuming.');
}
export function composer(doc) {
  checkBlockers(doc);
  const prompt = unique(all(doc, UI.prompt), 'Prompt editor');
  let scope = prompt.closest('form,[role="form"]');
  if (!scope) {
    let cursor = prompt.parentElement;
    for (let i = 0; cursor && i < 6; i++, cursor = cursor.parentElement) {
      const candidates = all(cursor, 'button,[role="button"]').filter(generateMatch);
      if (candidates.length === 1) { scope = cursor; break; }
    }
  }
  if (!scope) throw Error('Could not identify the prompt composer and its Generate button.');
  const generate = unique(all(scope, 'button,[role="button"]').filter(generateMatch), 'Generate button');
  return { prompt, generate, scope };
}
export async function setSetting(doc, key, expected, pattern, wait = delay, interaction) {
  const controls = all(doc, 'select,button,[role="combobox"],[role="button"]').filter(el => UI.settingNames[key].test(accessibleName(el)));
  const control = unique(controls, `Flow ${key}`);
  if (control.tagName === 'SELECT') {
    const options = [...control.options].filter(o => !o.disabled && pattern.test(clean(o.textContent)));
    const option = unique(options, `Flow ${key} option ${expected}`);
    control.value = option.value;
    control.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    control.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
    await wait(150);
    if (control.value !== option.value) throw Error(`Flow reverted ${key}.`);
    return clean(option.textContent);
  }
  if (pattern.test(selectedLabel(control, key))) return selectedLabel(control, key);
  await click(control, interaction); await wait(250);
  const option = unique(all(doc, '[role="option"],[role="menuitem"],[role="menuitemradio"]')
    .filter(el => pattern.test(name(el))), `Flow ${key} option ${expected}`);
  await click(option, interaction); await wait(250);
  const refreshed = unique(all(doc, 'button,[role="combobox"],[role="button"]').filter(el => UI.settingNames[key].test(accessibleName(el))), `Flow ${key} after selection`);
  if (!pattern.test(selectedLabel(refreshed, key))) throw Error(`Flow ${key} cannot be verified after selection.`);
  return selectedLabel(refreshed, key);
}
export async function ensureWorkspace(doc, interaction, wait = delay) {
  checkBlockers(doc); if (all(doc, UI.prompt).length) return;
  const create = unique(all(doc, 'button,[role="button"]').filter(el => /^(?:new project|proyek baru)$/i.test(name(el))), 'Open a Flow project once (New project)');
  await click(create, interaction);
  for (let i = 0; i < 40; i++) { await wait(250); checkBlockers(doc); if (all(doc, UI.prompt).length === 1) return; }
  throw Error('Flow project did not open. Open one workspace manually once, then resume.');
}
function nativeSettings(doc) { return all(doc, 'select').filter(el => UI.settingNames.mode.test(accessibleName(el))).length === 1; }
function settingsPill(doc) { return unique(all(doc, 'button').filter(el => /crop_(?:16_9|9_16|square|portrait|landscape)/.test(el.textContent)), 'Flow settings pill'); }
async function openPopover(doc, interaction, wait = delay) {
  const open = all(doc, '[data-radix-popper-content-wrapper],[role="menu"][data-state="open"]');
  if (!open.length) { await click(settingsPill(doc), interaction); await wait(350); }
  if (!all(doc, '[data-radix-popper-content-wrapper],[role="menu"][data-state="open"]').length) throw Error('Flow settings did not open. Trusted input or selectors need verification.');
}
async function closePopover(doc, interaction, wait = delay) {
  for (let i = 0; i < 4; i++) {
    if (!all(doc, '[data-radix-popper-content-wrapper],[role="menu"][data-state="open"]').length) return;
    if (interaction?.escape) await interaction.escape();
    else doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(150);
  }
  throw Error('Flow settings layer stayed open. Resolve it before resuming.');
}
const flowPatterns = task => ({ mode: /^(?:videocam\s*)?Video$/i, input: /^(?:[a-z_]+\s*)?Ingredients$/i, aspect: /^crop_9_16\s*(?:9\s*:\s*16)?$/i, duration: new RegExp(`^${task.duration}s$`, 'i'), outputs: /^(?:1x|x1)$/i });
function flowControl(doc, pattern, label) { return unique(all(doc, 'button,[role="button"],[role="radio"],[role="menuitemradio"],[role="option"]').filter(el => pattern.test(clean(el.textContent))), `Flow ${label}`); }
async function flowSettings(doc, task, interaction, wait = delay, apply = false) {
  await openPopover(doc, interaction, wait);
  for (const [key, pattern] of Object.entries(flowPatterns(task))) {
    let control = flowControl(doc, pattern, key);
    if (apply && !selected(control)) { await click(control, interaction); await wait(250); control = flowControl(doc, pattern, key); }
    if (!selected(control)) throw Error(`Flow ${key} selection is not verifiable. No generation was submitted.`);
  }
  let models = all(doc, 'button').filter(el => /arrow_drop_down/.test(el.textContent) && UI.supportedModel.test(el.textContent));
  if (apply && !models.length) {
    const trigger = unique(all(doc, 'button').filter(el => /arrow_drop_down/.test(el.textContent)), 'Flow model dropdown');
    await click(trigger, interaction); await wait(250);
    const model = unique(all(doc, '[role="option"],[role="menuitem"],[role="menuitemradio"]').filter(el => /veo\s*3\.1\s*[-–]?\s*fast/i.test(el.textContent)), 'Veo 3.1 Fast model');
    await click(model, interaction); await wait(250);
    models = all(doc, 'button').filter(el => /arrow_drop_down/.test(el.textContent) && UI.supportedModel.test(el.textContent));
  }
  unique(models, 'Selected supported Flow model');
  await closePopover(doc, interaction, wait);
  const summary = clean(settingsPill(doc).textContent);
  if (!/crop_9_16/.test(summary) || !/(?:\b1x\b|\bx1\b)/.test(summary) || !UI.supportedModel.test(summary)) throw Error('Flow settings summary does not verify portrait, one output, and model.');
}
export async function configure(doc, task, wait = delay, interaction) {
  await ensureWorkspace(doc, interaction, wait);
  checkBlockers(doc);
  if (!nativeSettings(doc)) {
    await flowSettings(doc, task, interaction, wait, true);
    const c = composer(doc); if (interaction?.fill) await interaction.fill(c.prompt, task.prompt); else fillPrompt(c.prompt, task.prompt);
    await wait(200); return prepareReady(doc, task, interaction, wait);
  }
  await setSetting(doc, 'mode', 'Video', UI.values.mode, wait, interaction);
  await setSetting(doc, 'aspect', '9:16', UI.values.aspect, wait, interaction);
  await setSetting(doc, 'duration', `${task.duration}s`, new RegExp(`^${task.duration}\\s*(?:s|sec|seconds?|detik)$`, 'i'), wait, interaction);
  await setSetting(doc, 'outputs', '1', UI.values.outputs, wait, interaction);
  const models = all(doc, 'select,button,[role="combobox"]').filter(el => UI.settingNames.model.test(accessibleName(el)));
  const model = unique(models, 'Flow model');
  const selectedModel = selectedLabel(model, 'model');
  if (!UI.supportedModel.test(selectedModel)) throw Error('Select a supported video model in Flow; the adapter cannot verify the selected model.');
  const c = composer(doc); if (interaction?.fill) await interaction.fill(c.prompt, task.prompt); else fillPrompt(c.prompt, task.prompt);
  await (wait || (ms => new Promise(r => setTimeout(r, ms))))(200);
  return ready(doc, task);
}
export async function prepareReady(doc, task, interaction, wait = delay) {
  if (nativeSettings(doc)) return ready(doc, task);
  await flowSettings(doc, task, interaction, wait, false);
  return ready(doc, task, true);
}
export function fillPrompt(el, value) {
  const win = el.ownerDocument.defaultView; el.focus();
  if (el.tagName === 'TEXTAREA') Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
  else { el.textContent = value; }
  el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
export function ready(doc, task, settingsVerified = false) {
  const c = composer(doc);
  const patterns = { mode: UI.values.mode, aspect: UI.values.aspect, duration: new RegExp(`^${task.duration}\\s*(?:s|sec|seconds?|detik)$`, 'i'), outputs: UI.values.outputs, model: UI.supportedModel };
  for (const [key, pattern] of Object.entries(settingsVerified ? {} : patterns)) {
    const control = unique(all(doc, 'select,button,[role="combobox"],[role="button"]').filter(el => UI.settingNames[key].test(accessibleName(el))), `Verified Flow ${key}`);
    if (!pattern.test(selectedLabel(control, key))) throw Error(`Flow ${key} changed or cannot be verified.`);
  }
  if (clean(c.prompt.value ?? c.prompt.textContent) !== clean(task.prompt)) throw Error('Prompt text did not persist in Flow.');
  if (c.generate.disabled || c.generate.getAttribute('aria-disabled') === 'true') throw Error('Generate is disabled. Resolve Flow settings before resuming.');
  // A generation cost must be explicit in the generation control, never inferred from account balance.
  const labelled = c.generate.getAttribute('aria-label') || '';
  const visibleCosts = [parseCreditCost(labelled), parseCreditCost(c.generate.textContent)].filter(v => v !== null);
  let cost = visibleCosts.length && new Set(visibleCosts).size === 1 ? visibleCosts[0] : null;
  if (cost === null) {
    const costs = all(c.scope, '[data-generation-cost],[data-testid="generation-cost"], [aria-label*="generation cost" i]');
    if (!visibleCosts.length && costs.length === 1) cost = parseCreditCost(costs[0].textContent) ?? parseCreditCost(costs[0].getAttribute('aria-label'));
  }
  assertCost(cost, task);
  return { ...c, cost, baseline: videoSources(doc) };
}
export function videoSources(doc) { return [...new Set(all(doc, 'video').flatMap(v => [v.currentSrc, v.src, ...[...v.querySelectorAll('source')].map(s => s.src)]).filter(Boolean))]; }
export function findResult(doc, task, baseline = []) {
  checkBlockers(doc);
  const prefix = clean(task.prompt).slice(0, 64).toLocaleLowerCase();
  const candidates = all(doc, 'video').flatMap(v => {
    const url = v.currentSrc || v.src || v.querySelector('source')?.src;
    if (!url || baseline.includes(url)) return [];
    const card = v.closest(UI.cards);
    if (!card || !clean(card.innerText).toLocaleLowerCase().includes(prefix)) return [];
    if (!(v.videoWidth > 0 && v.videoHeight > 0) || Math.abs(v.videoWidth / v.videoHeight - 9 / 16) > .035) return [];
    return allowedMediaUrl(url) ? [{ url, width: v.videoWidth, height: v.videoHeight, duration: v.duration }] : [];
  });
  if (candidates.length > 1) throw Error('Several new videos match this prompt. Select the intended result manually; the bridge will not guess.');
  return candidates[0] || null;
}
