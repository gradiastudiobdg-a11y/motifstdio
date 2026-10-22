export function mountFlowAgentStatus(parent) {
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><h2>Flow-agent · satu akun</h2><span class="status-tag">BRAVE / CHROMIUM</span></div><div class="panel-body"><p data-status>Memeriksa instalasi lokal…</p><p class="help">Flow Bridge upstream menyinkronkan sesi Google ke komputer ini. Koneksi dan generasi live belum terverifikasi. Rotasi akun dinonaktifkan.</p><button class="btn small ghost" type="button">Salin folder extension</button></div>';
  parent.append(panel);
  let alive = true, timer, folder;
  const label = panel.querySelector('[data-status]'), button = panel.querySelector('button');
  button.disabled = true;
  button.addEventListener('click', async () => { if (folder) { try { await navigator.clipboard.writeText(folder); button.textContent = 'Folder disalin · Load unpacked di Brave'; } catch { label.textContent = folder; } } });
  async function refresh() {
    try {
      const response = await fetch('/api/flow-agent/status');
      if (!response.ok) throw Error();
      const status = await response.json(); if (!alive) return;
      folder = status.extensionPath; button.disabled = !status.installed;
      label.textContent = `${status.verified ? 'Binary terverifikasi' : 'Instalasi perlu diperiksa'} · ${status.sessions} sesi lokal. ${status.detail}`;
    } catch { if (alive) label.textContent = 'Status flow-agent belum tersedia. Muat ulang server setelah pembaruan.'; }
    finally { if (alive) timer = setTimeout(refresh, 5000); }
  }
  refresh();
  return () => { alive = false; clearTimeout(timer); panel.remove(); };
}
