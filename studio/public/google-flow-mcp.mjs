export function mountGoogleFlowMcp(parent,onStatus=()=>{}) {
  const panel=document.createElement('section');panel.className='panel';panel.dataset.flowMcpPanel='';
  panel.innerHTML='<div class="panel-head"><h2>Google Flow</h2><span class="status-tag">BRAVE · SATU AKUN</span></div><div class="panel-body"><p data-status>Memeriksa sesi Flow…</p><p class="help">Kai Studio menggunakan sesi yang sudah tersambung. Jika perlu login ulang, login manual di Brave biasa, lalu gunakan Flow Login Bridge untuk mengirim sesi ke studio lokal. Password dan verifikasi Google tetap kamu tangani sendiri.</p><div class="button-row"><button type="button" class="btn small" data-check>Buka Brave / periksa koneksi</button><button type="button" class="btn small ghost" data-begin>Sambungkan ulang sesi</button><button type="button" class="btn small" data-complete hidden>Sesi sudah terkirim</button><button type="button" class="btn small ghost" data-copy>Folder Flow Login Bridge</button></div><p class="help" data-instructions></p><p class="help">Omni 1.1 Flash · klip 10 detik · 720p · 9:16. Harga dibaca langsung sebelum generasi. Biarkan Brave terbuka saat membuat video.</p></div>';
  parent.append(panel);const label=panel.querySelector('[data-status]'),button=panel.querySelector('[data-check]');
  let alive=true,busy=false,timer;
  let extensionDirectory;
  const instructions=panel.querySelector('[data-instructions]'),complete=panel.querySelector('[data-complete]');
  async function session(route,body){const response=await fetch('/api/google-flow-mcp/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error||'Sesi belum tersambung.');return value;}
  panel.querySelector('[data-begin]').onclick=async()=>{
    if(busy)return;busy=true;
    try{const result=await session('begin',{reconnect:true});extensionDirectory=result.extensionDirectory;complete.hidden=!result.connectionPending;instructions.textContent=(result.instructions||[]).join(' ');}
    catch(error){instructions.textContent=error.message;}finally{busy=false;}
  };
  complete.onclick=async()=>{
    if(busy)return;busy=true;complete.disabled=true;instructions.textContent='Pilih akun yang sama di jendela Google jika diminta. Menunggu workspace Flow…';
    try{const result=await session('complete',{userConfirmedSessionSent:true});if(alive){label.textContent=result.detail;onStatus(result);complete.hidden=true;}}
    catch(error){instructions.textContent=error.message;}finally{busy=false;complete.disabled=false;}
  };
  panel.querySelector('[data-copy]').onclick=async()=>{
    try{if(!extensionDirectory){const r=await fetch('/api/google-flow-mcp/status');extensionDirectory=(await r.json()).extensionDirectory;}await navigator.clipboard.writeText(extensionDirectory);instructions.textContent='Folder disalin. Brave biasa → brave://extensions → Load unpacked → pilih folder ini. Extension yang dipakai bernama Flow Login Bridge.';}catch{instructions.textContent='Folder belum tersedia. Klik Sambungkan ulang sesi terlebih dahulu.';}
  };
  async function refresh(force=false){
    if(!alive||busy)return;busy=true;button.disabled=true;
    try{
      const response=await fetch('/api/flow-production/'+(force?'check':'status'),force?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:{});
      const status=await response.json();if(!response.ok)throw Error(status.error||'Status belum tersedia.');
      if(!status.connected){const connectionResponse=await fetch('/api/google-flow-mcp/status');if(connectionResponse.ok){const connection=await connectionResponse.json();extensionDirectory=connection.extensionDirectory;complete.hidden=!connection.connectionPending;}}
      if(alive){label.textContent=status.detail+(Number.isFinite(status.credits)?` Saldo terakhir: ${status.credits} kredit.`:'');onStatus(status);}
    }catch{if(alive){label.textContent='Koneksi belum tersedia. Periksa apakah server Kai Studio dan Brave terbuka.';onStatus({connected:false});}}
    finally{busy=false;if(alive){button.disabled=false;clearTimeout(timer);timer=setTimeout(()=>refresh(),10000);}}
  }
  button.onclick=()=>refresh(true);void refresh();
  return()=>{alive=false;clearTimeout(timer);panel.remove();};
}
