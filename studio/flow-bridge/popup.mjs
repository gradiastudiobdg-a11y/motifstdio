const $ = s => document.querySelector(s);
const send = async message => { const result = await chrome.runtime.sendMessage(message); if (result?.error) throw Error(result.error); return result; };
async function refresh() { const s = await send({ type: 'STATUS' }); $('#enabled').checked = s.enabled; $('#enabled').disabled = !s.paired; $('#status').textContent = `${s.paired ? 'Paired' : 'Belum paired'} · ${s.enabled ? 'worker ON' : 'worker OFF'}\n${s.status?.status || 'setup'}: ${s.status?.detail || 'Jalankan studio di 127.0.0.1:4317.'}${s.flight ? `\nIntent: ${s.flight.id}\nPhase: ${s.flight.phase}` : ''}\nAdapter: ${s.status?.adapter || 'v1 belum divalidasi pada login Flow'}`; }
function action(fn) { return async () => { try { await fn(); await refresh(); } catch (error) { $('#status').textContent = error.message; } }; }
$('#pair').onclick = action(async () => { await send({ type: 'PAIR', token: $('#token').value.trim() }); $('#token').value = ''; });
$('#enabled').onchange = action(() => send({ type: 'ENABLE', enabled: $('#enabled').checked }));
$('#refresh').onclick = action(refresh);
$('#release').onclick = action(() => send({ type: 'RELEASE_TAB' }));
void action(refresh)();
