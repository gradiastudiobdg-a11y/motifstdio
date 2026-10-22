import { configure, prepareReady, findResult, visible } from './adapter.mjs';
import { inspectUI } from './diagnostics.mjs';
const send = message => chrome.runtime.sendMessage(message).then(result => { if (result?.error) throw Error(result.error); return result; });
let busy = false, current = null, lastCapture = 0, lastDiagnostics = '';
async function reportUI() { const snapshot=inspectUI(document),signature=JSON.stringify(snapshot);if(signature===lastDiagnostics)return;const result=await send({type:'DIAGNOSTICS',visible:!document.hidden,snapshot});if(result?.ok)lastDiagnostics=signature; }
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id === chrome.runtime.id && message.type === 'MOTIF_VISIBLE_CHECK') { reply({ visible: !document.hidden, url: location.href, width: innerWidth, height: innerHeight }); }
  if (sender.id === chrome.runtime.id && message.type === 'MOTIF_INSPECT') { reply(inspectUI(document)); }
});
const interaction = {
  async click(el) {
    if (!visible(el)) throw Error('Flow control is no longer visible.');
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const box = el.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
    const top = document.elementFromPoint(x, y);
    if (!top || (top !== el && !el.contains(top))) throw Error('Flow control is covered by another layer.');
    await send({ type: 'TRUSTED_INPUT', visible: !document.hidden, task: current, action: 'click', x, y });
  },
  async fill(el, text) { await this.click(el); await send({ type: 'TRUSTED_INPUT', visible: !document.hidden, task: current, action: 'fill', text }); },
  async escape() { await send({ type: 'TRUSTED_INPUT', visible: !document.hidden, task: current, action: 'escape' }); },
};
async function tick() {
  if (busy || document.hidden) return; busy = true;
  try {
    await reportUI();
    const result = await send({ type: 'TICK', visible: !document.hidden });
    if (!result?.task || !['prepare', 'capture'].includes(result.mode)) return;
    current = result.task;
    if (result.mode === 'prepare') {
      const initial = await configure(document, current, undefined, interaction);
      if (document.hidden) return;
      const receipt = await send({ type: 'RESERVE', visible: true, task: current, cost: initial.cost, baseline: initial.baseline });
      if (!receipt.accepted) return;
      const permission = await send({ type: 'CONFIRM', visible: !document.hidden, intentId: receipt.intentId });
      if (!permission.approved) return;
      // Never retry this click: the intent is durable before this line.
      const final = await prepareReady(document, current, interaction);
      if (final.cost !== initial.cost || document.hidden || !final.generate.isConnected) throw Error('Flow controls changed after reserving the submission. Review the existing intent; no retry will be made.');
      await interaction.click(final.generate);
      await send({ type: 'CLICKED', visible: true, intentId: receipt.intentId });
      return;
    }
    if (Date.now() - lastCapture < 4000) return; lastCapture = Date.now();
    const video = findResult(document, current, result.flight?.baseline || []);
    if (video) await send({ type: 'RESULT', visible: true, task: current, url: video.url });
  } catch (error) {
    await send({ type: 'DIAGNOSTICS', visible: !document.hidden, snapshot: inspectUI(document) }).catch(() => {});
    await send({ type: 'BLOCK', visible: !document.hidden, task: current, detail: error.message }).catch(() => {});
  } finally { busy = false; }
}
setInterval(tick, 3000);
void tick();
void reportUI().catch(() => {});
