import { KAI } from './kai-brand.mjs';
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => { const t = clamp(n); return t*t*(3-2*t); };

// Pure absolute-time layout. This exact function is used in browser and MP4.
export function kaiOverlayState(project, time) {
  const duration = project.scenes.reduce((n, s) => n+s.duration, 0);
  const t = Math.max(0, Math.min(duration, time));
  const opening = t < 2.5;
  const reveal = !opening && t >= duration-3;
  let start = 0, scene = project.scenes[0];
  for (const s of project.scenes) { scene=s; if (t < start+s.duration) break; start+=s.duration; }
  const local = t-start;
  const alpha = opening ? ease(t/.28)*ease((2.5-t)/.28) : reveal ? ease((t-(duration-3))/.28) : ease(local/.28)*ease((scene.duration-local)/.28);
  return { opening, reveal, alpha, note: !opening && !reveal && scene !== project.scenes[0] && scene !== project.scenes.at(-1) ? scene.headline : '', hook: opening ? project.scenes[0].headline : reveal ? project.scenes.length===1 ? 'A little more useful.' : project.scenes.at(-1).headline : '', header: 'LITTLE HOME IDEAS', footer: 'KAI MAKES DO / LITTLE MAKES' };
}
function lines(ctx, text, width, maxSize=106, maxLines=2) {
  const words=String(text).toUpperCase().split(/\s+/).filter(Boolean);
  for (let size=maxSize; size>=36; size-=2) {
    ctx.font=`800 ${size}px "DM Sans"`;
    if (words.length>2 && maxLines===2) {
      const choices=words.slice(1).map((_,i)=>[words.slice(0,i+1).join(' '),words.slice(i+1).join(' ')]).filter(rows=>rows.every(row=>ctx.measureText(row).width<=width));
      choices.sort((a,b)=>Math.abs(ctx.measureText(a[0]).width-ctx.measureText(a[1]).width)-Math.abs(ctx.measureText(b[0]).width-ctx.measureText(b[1]).width));
      if(choices.length)return { rows:choices[0],size };
    }
    const result=[]; let line='';
    for(const word of words) {
      const candidate=line?`${line} ${word}`:word;
      if(line && ctx.measureText(candidate).width>width) { result.push(line);line=word; } else line=candidate;
    }
    if(line)result.push(line);
    if(result.length<=maxLines && result.every(s=>ctx.measureText(s).width<=width))return { rows:result, size };
  }
  // Imported overly long text is bounded; it never spills over platform controls.
  return { rows:[String(text).slice(0,28).toUpperCase()+'…'], size:36 };
}
export function drawKaiFrame(canvas, project, time, options={}) {
  const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height, p=KAI.palette;
  const layout=kaiOverlayState(project,time);
  ctx.save();ctx.clearRect(0,0,w,h);ctx.fillStyle=p.paper;ctx.fillRect(0,0,w,h);
  const media=options.media, mw=media?.videoWidth||media?.naturalWidth||media?.width,mh=media?.videoHeight||media?.naturalHeight||media?.height;
  if(mw&&mh){
    let start=0,scene=project.scenes.at(-1);for(const s of project.scenes){scene=s;if(time<start+s.duration)break;start+=s.duration;}
    const c=scene.mediaCrop,valid=c&&[c.x,c.y,c.width,c.height].every(Number.isFinite)&&c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=1&&c.y+c.height<=1;
    const sx=valid?c.x*mw:0,sy=valid?c.y*mh:0,sw=valid?c.width*mw:mw,sh=valid?c.height*mh:mh,scale=Math.max(w/sw,h/sh);
    ctx.drawImage(media,sx,sy,sw,sh,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);
  }
  ctx.scale(w/1080,h/1920);ctx.textBaseline='top';ctx.textAlign='left';
  ctx.globalAlpha=layout.alpha;
  if(layout.opening||layout.reveal){
    const dark=project.kaiLayout?.darkHero===true;
    const wash=ctx.createLinearGradient(0,0,0,545);wash.addColorStop(0,dark?'#17201980':'#F4EFE6B8');wash.addColorStop(.72,dark?'#17201920':'#F4EFE680');wash.addColorStop(1,dark?'#17201900':'#F4EFE600');ctx.fillStyle=wash;ctx.fillRect(0,0,1080,545);
    const dy=8*(1-layout.alpha);ctx.translate(0,dy);
    ctx.fillStyle=p.sage;ctx.fillRect(72,175,12,12);
    ctx.fillStyle=dark?p.paper:p.ink;ctx.font='600 28px "DM Sans"';ctx.fillText(layout.header,99,168);
    ctx.strokeStyle='#29332D40';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(72,216);ctx.lineTo(876,216);ctx.stroke();
    const config=project.kaiLayout||{},size=config[layout.reveal?'revealFontSize':'openingFontSize'],top=config[layout.reveal?'revealHookY':'openingHookY'];
    const maxSize=Number.isFinite(size)?Math.max(64,Math.min(108,size)):layout.reveal?91:106;
    const hookY=Number.isFinite(top)?Math.max(220,Math.min(300,top)):246;
    const maxLines=config[layout.reveal?'revealMaxLines':'openingMaxLines']===1?1:2;
    const hook=lines(ctx,layout.hook,804,maxSize,maxLines);
    ctx.font=`800 ${hook.size}px "DM Sans"`;hook.rows.forEach((line,i)=>{ctx.fillStyle=dark?(i===1?p.honey:p.paper):(i===1?'#65755D':p.ink);ctx.fillText(line,72,hookY+i*hook.size*.98);});
    if(config.compactFooter){
      ctx.fillStyle=p.ink;ctx.fillRect(72,1470,228,40);ctx.fillStyle=p.paper;ctx.font='600 24px "DM Sans"';ctx.fillText('KAI MAKES DO',85,1478);
    }else{
      ctx.fillStyle=p.ink;ctx.fillRect(72,1440,804,68);ctx.fillStyle=p.paper;ctx.font='600 25px "DM Sans"';ctx.fillText('KAI MAKES DO',93,1462);
      const slashX=93+ctx.measureText('KAI MAKES DO').width;ctx.fillStyle=p.honey;ctx.fillText(' / ',slashX,1462);ctx.fillStyle=p.paper;ctx.fillText('LITTLE MAKES',slashX+ctx.measureText(' / ').width,1462);
    }
  }else if(layout.note && project.kaiLayout?.showProcessNotes !== false){
    ctx.font='500 42px "DM Sans"';const note=String(layout.note).slice(0,45),width=Math.min(804,ctx.measureText(note).width+38);
    ctx.fillStyle='#F4EFE6EC';ctx.fillRect(72,288,width,72);ctx.fillStyle=p.ink;ctx.fillText(note,91,300,766);
  }
  ctx.globalAlpha=1;
  if(project.kaiLayout?.showProgressBar){
    const total=project.scenes.reduce((n,s)=>n+s.duration,0);
    const progress=clamp(time/total);
    ctx.fillStyle=p.sage;ctx.fillRect(72,1530,250,8);
    ctx.fillStyle=p.honey;ctx.fillRect(72,1530,250*progress,8);
  }else if(project.kaiLayout?.showTimestamp){
    const total=project.scenes.reduce((n,s)=>n+s.duration,0);
    const clock=t=>`${String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
    ctx.fillStyle='#29332DBF';ctx.fillRect(72,1530,230,44);
    ctx.fillStyle=p.paper;ctx.font='500 25px "IBM Plex Mono"';ctx.fillText(`${clock(Math.min(time,total))} / ${clock(total)}`,85,1540);
  }
  if(options.safeArea){ctx.strokeStyle='#C68163';ctx.lineWidth=2;ctx.setLineDash([10,8]);ctx.strokeRect(72,160,804,1320);ctx.setLineDash([]);}
  ctx.restore();
}
