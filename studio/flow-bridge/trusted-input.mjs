import { isFlowUrl } from './core.mjs';
const ALLOWED = new Set(['Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText']);
const bound = (promise, ms = 4000) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Trusted Flow input timed out; review the current UI.')), ms); })]).finally(() => clearTimeout(timer)); };
export async function trustedInput(chromeApi, request, sender, verifyJob) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !isFlowUrl(sender.url || sender.tab?.url)) throw Error('Trusted input is restricted to the claimed Flow tab.');
  async function verify() {
    const state = await chromeApi.storage.local.get(['enabled', 'workerTabId']);
    const tab = await chromeApi.tabs.get(tabId);
    const view = await bound(chromeApi.tabs.sendMessage(tabId, { type: 'MOTIF_VISIBLE_CHECK' }));
    if (!state.enabled || state.workerTabId !== tabId || !tab.active || !isFlowUrl(tab.url) || !view?.visible || !isFlowUrl(view.url)) throw Error('Flow input paused: the claimed tab must remain visible, active, and enabled.');
    await verifyJob(); return view;
  }
  const commands = [];
  if (request.action === 'click') {
    const view = await verify();
    if (![request.x, request.y, view.width, view.height].every(Number.isFinite) || request.x < 0 || request.y < 0 || request.x >= view.width || request.y >= view.height || view.width > 10000 || view.height > 10000) throw Error('Invalid or stale Flow control coordinates.');
    commands.push(['Input.dispatchMouseEvent', { type: 'mouseMoved', x: request.x, y: request.y }], ['Input.dispatchMouseEvent', { type: 'mousePressed', x: request.x, y: request.y, button: 'left', clickCount: 1 }], ['Input.dispatchMouseEvent', { type: 'mouseReleased', x: request.x, y: request.y, button: 'left', clickCount: 1 }]);
  } else if (request.action === 'fill') {
    if (typeof request.text !== 'string' || request.text.length > 15000) throw Error('Invalid Flow prompt length.');
    commands.push(['Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }], ['Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }], ['Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }], ['Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }], ['Input.insertText', { text: request.text }]);
  } else if (request.action === 'escape') {
    commands.push(['Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }], ['Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }]);
  } else throw Error('Unsupported trusted input action.');
  await verify(); let attached = false, closed = false;
  try {
    const attachment = chromeApi.debugger.attach({ tabId }, '1.3').then(async () => {
      if (closed) { await bound(chromeApi.debugger.detach({ tabId })).catch(() => {}); return; }
      attached = true;
    });
    await bound(attachment);
    for (const [method, params] of commands) { await verify(); if (!ALLOWED.has(method)) throw Error('Blocked debugger method.'); await bound(chromeApi.debugger.sendCommand({ tabId }, method, params)); }
    return { ok: true };
  } finally { closed = true; if (attached) await bound(chromeApi.debugger.detach({ tabId })).catch(() => {}); }
}
