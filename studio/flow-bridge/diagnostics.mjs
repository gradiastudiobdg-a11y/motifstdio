// Read-only, bounded UI metadata. Never collects prompt values, URLs, media
// sources, account controls, cookies or tokens.
export function safeLabel(value) {
  return String(value || '').replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[account]')
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{32,}\b/g, '[id]')
    .replace(/\s+/g, ' ').trim().slice(0, 100);
}
function visible(el) {
  const style = el.ownerDocument.defaultView.getComputedStyle(el), box = el.getBoundingClientRect();
  return el.isConnected && !el.hidden && el.getAttribute('aria-hidden') !== 'true' && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && box.width > 0 && box.height > 0;
}
const interesting = /video|image|gambar|mode|aspect|ratio|rasio|portrait|vertical|vertikal|9\s*:\s*16|16\s*:\s*9|durasi|duration|\b[468]s\b|output|hasil|model|veo|omni|setting|setelan|pengaturan|tune|generate|hasilkan|create|buat|send|kirim|arrow|crop|credit|kredit|ingredient|frame|chevron|more_horiz|add|close/i;
const privateControl = /account|akun|profil|profile|avatar|password|token|balance|saldo|email/i;
const names = el => [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' | ').trim();
function ancestry(el) { const tags=[]; for(let p=el.parentElement;p&&tags.length<4;p=p.parentElement)tags.push(p.tagName.toLowerCase()); return tags.join('>'); }
export function inspectUI(doc) {
  const nodes = selector => [...doc.querySelectorAll(selector)].filter(visible);
  const prompts = nodes('textarea,[contenteditable="true"],input[type="text"]').slice(0, 6).map(el => ({ tag: el.tagName.toLowerCase(), role: safeLabel(el.getAttribute('role')), placeholder: privateControl.test(el.getAttribute('placeholder') || '') ? '[private]' : safeLabel(el.getAttribute('placeholder')), parent: ancestry(el) }));
  const controls = nodes('button,[role="button"],[role="combobox"],[role="radio"],[role="option"]').map(el => ({ el, label: names(el) })).filter(({label}) => label && interesting.test(label) && !privateControl.test(label)).slice(0, 28).map(({el,label}) => ({ label: safeLabel(label), role: safeLabel(el.getAttribute('role') || el.tagName.toLowerCase()), selected: ['true','on','checked','active'].includes(el.getAttribute('aria-selected') || el.getAttribute('aria-checked') || el.getAttribute('data-state')), disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'), parent: ancestry(el) }));
  const snapshot = { version: 1, visible: !doc.hidden, project: /^\/project\//.test(doc.location?.pathname || ''), prompts, controls, dialogs: nodes('[role="dialog"],dialog[open]').length, videos: nodes('video').map(v=>({ width:v.videoWidth,height:v.videoHeight,ready:v.readyState })).slice(0, 4) };
  while (JSON.stringify(snapshot).length > 4600 && snapshot.controls.length) snapshot.controls.pop();
  return snapshot;
}
