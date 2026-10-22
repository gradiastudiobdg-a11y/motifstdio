import { drawKaiFrame } from './kai-motion.mjs';
export const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export function spring(t, stiffness = 170, damping = 25) {
  if (t <= 0) return 0;
  const w = Math.sqrt(stiffness), z = damping / (2 * w);
  if (z < 1) {
    const d = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(d * t) + z * w / d * Math.sin(d * t));
  }
  if (Math.abs(z - 1) < .0001) return 1 - Math.exp(-w * t) * (1 + w * t);
  const r1 = -w * (z - Math.sqrt(z * z - 1)), r2 = -w * (z + Math.sqrt(z * z - 1));
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}
export function sceneAt(project, time) {
  let start = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    if (time < start + scene.duration || i === project.scenes.length - 1)
      return { scene, index: i, start, local: clamp(time - start, 0, scene.duration) };
    start += scene.duration;
  }
  return { scene: null, index: 0, start: 0, local: 0 };
}
export function dimensions(ratio = '9:16', quality = 720) {
  if (ratio === '16:9') return { width: Math.round(quality * 16 / 9 / 2) * 2, height: quality };
  if (ratio === '1:1') return { width: quality, height: quality };
  return { width: quality, height: Math.round(quality * 16 / 9 / 2) * 2 };
}
export function palette(style, accent) {
  const styles = {
    kai: ['#F4EFE6', '#29332D', '#7D8C74'],
    kinetic: ['#11121A', '#F6F0E6', '#D6FF63'],
    cinematic: ['#141235', '#F7EEDB', '#FFD21F'],
    editorial: ['#F2EEE6', '#242C29', '#D66042'],
    stickman: ['#FAF8F2', '#202322', '#EE8A37']
  };
  const [bg, fg, primary] = styles[style] || styles.kinetic;
  return { bg, fg, accent: /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : primary };
}
function rect(ctx, x, y, w, h, r = 0) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); ctx.fill();
}
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
function circle(ctx, x, y, r, fill = true) { ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,Math.PI*2); fill ? ctx.fill() : ctx.stroke(); }
function text(ctx, value, x, y, size, weight = 800, align = 'left', family = 'Arial') {
  ctx.font = `${weight} ${size}px ${family}`; ctx.textAlign = align; ctx.fillText(value, x, y);
}
function fitLines(ctx, value, width, size, maxLines = 3, family = 'Arial', weight = 900) {
  const words=String(value || 'MULAI DULU.').toUpperCase().replace(/\n/g,' ').split(/\s+/).filter(Boolean);
  let lines=[];
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = []; let current = '';
    if(size>24&&words.some(word=>ctx.measureText(word).width>width)){size-=4;continue;}
    for (const word of words) {
      if (ctx.measureText(word).width > width) {
        if (current) { lines.push(current);current=''; }
        let part='';
        for (const char of word) { if (ctx.measureText(part+char).width>width) {lines.push(part);part='';} part+=char; }
        current=part;
      } else if (current && ctx.measureText(current+' '+word).width>width) { lines.push(current);current=word; }
      else current+=(current?' ':'')+word;
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines || size <= 24) break;
    size -= 4;
  } while (size > 20);
  return { lines, size };
}
function caption(ctx, scene, local, w, h, colors) {
  ctx.textAlign='left';
  const timed=Array.isArray(scene.wordTimings)&&scene.wordTimings.length&&scene.wordTimings.every(item=>typeof item.text==='string'&&Number.isFinite(item.start)&&Number.isFinite(item.end))?scene.wordTimings:null;
  const words = timed?timed.map(item=>item.text):String(scene.voiceover || '').split(/\s+/).filter(Boolean);
  if (!words.length) return;
  if(timed&&(local<timed[0].start||local>timed[timed.length-1].end+.5))return;
  const pos = timed?Math.max(0,timed.findLastIndex(item=>local>=item.start)):Math.min(words.length - 1, Math.floor(local / scene.duration * words.length));
  const group = Math.floor(pos / 5) * 5, chunk = words.slice(group, group + 5);
  let size=w*.037;
  do { ctx.font=`700 ${size}px Arial`; if(ctx.measureText(chunk.join(' ')).width<w*.78) break; size-=1; } while(size>10);
  const widths=chunk.map(word=>ctx.measureText(word+' ').width), tw=widths.reduce((a,b)=>a+b,0);
  const y=h*.81;
  ctx.fillStyle=colors.bg; ctx.globalAlpha=.92; rect(ctx,(w-tw)/2-w*.035,y-size*1.2,tw+w*.07,size*1.9,w*.017);ctx.globalAlpha=1;
  let x=(w-tw)/2;
  chunk.forEach((word,i)=>{ctx.fillStyle=group+i===pos?colors.accent:colors.fg;ctx.fillText(word,x,y);x+=widths[i];});
}
function footageAccents(ctx,w,h,t,index,colors){
  const p=clamp(spring(t-.32,150,25));
  ctx.save();ctx.globalAlpha=.55*p;ctx.strokeStyle=colors.accent;ctx.fillStyle=colors.accent;ctx.lineWidth=Math.max(1,w*.003);
  const x=w*.09,y=h*.71;
  line(ctx,x,y,x+w*.18*p,y);circle(ctx,x+w*.18*p,y,w*.005);
  for(let i=0;i<3;i++){ctx.globalAlpha=(.18+i*.14)*p;circle(ctx,w*(.83+i*.022),h*.48,w*.0035);}
  ctx.globalAlpha=.45*p;const a=w*.028,cx=w*.84,cy=h*.66;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.sin(t*.9+index)*.12);
  line(ctx,-a,0,a,0);line(ctx,0,-a,0,a);ctx.restore();
  ctx.globalAlpha=.15*p;ctx.setLineDash([w*.005,w*.009]);line(ctx,w*.09,h*.735,w*.91,h*.735);ctx.setLineDash([]);
  ctx.restore();
}
function stickman(ctx, w, h, local, colors) {
  const s=w/600,x=w*.5,y=h*.57;
  ctx.save();ctx.translate(x,y+Math.sin(local*3)*3*s);ctx.scale(s,s);
  ctx.strokeStyle=colors.fg;ctx.lineWidth=9;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.fillStyle=colors.accent;ctx.beginPath();ctx.moveTo(-60,-20);ctx.quadraticCurveTo(0,-55,60,-20);ctx.lineTo(70,95);ctx.lineTo(-70,95);ctx.closePath();ctx.fill();ctx.stroke();
  line(ctx,-35,99,-48,177);line(ctx,35,99,47,177);
  line(ctx,-59,0,-110,60);line(ctx,60,0,105,-55-Math.sin(local*2)*12);
  ctx.fillStyle='#fffef8';circle(ctx,0,-88,66);ctx.stroke();
  ctx.fillStyle=colors.fg;ctx.save();ctx.scale(1,1.3);circle(ctx,-21,-70,5);circle(ctx,21,-70,5);ctx.restore();
  ctx.lineWidth=5;line(ctx,-30,-110,-13,-113);line(ctx,13,-113,30,-110);
  ctx.beginPath();ctx.arc(0,-84,23,.25,Math.PI-.25);ctx.stroke();
  ctx.strokeStyle='#fff5e7';ctx.lineWidth=3;line(ctx,-13,-6,-15,25);line(ctx,13,-6,15,25);
  ctx.restore();
}
function graphic(ctx,w,h,t,index,colors,style,graphicId) {
  const cx=w*.5, cy=h*.60, unit=Math.min(w*.25,h*.16), p=spring(t-.25,140,21);
  if(style==='stickman') {stickman(ctx,w,h,t,colors);return;}
  ctx.save();ctx.translate(cx,cy);ctx.scale(Math.max(.001,p),Math.max(.001,p));
  ctx.strokeStyle=colors.accent;ctx.fillStyle=colors.accent;ctx.lineWidth=w*.006;
  const choices=['steps','timer','bars','check','burst'];
  const variant=choices.includes(graphicId)?choices.indexOf(graphicId):index%5;
  if(variant===0) {
    // A sculptural progress staircase, rotated onto an isometric plane.
    const step=unit*.54, base=unit*.73;
    for(let i=0;i<3;i++) {
      const x=(i-1.45)*step,y=base-i*unit*.49, ht=unit*.42+i*unit*.25;
      ctx.fillStyle=i===2?colors.accent:(style==='editorial'?'#b7b9ab':i===0?'#374332':'#78905c');
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+step*.78,y-unit*.18);ctx.lineTo(x+step*.78,y-ht-unit*.18);ctx.lineTo(x,y-ht);ctx.closePath();ctx.fill();
      ctx.fillStyle=i===2?'#a2c15d':style==='editorial'?'#8a907d':'#263024';
      ctx.beginPath();ctx.moveTo(x+step*.78,y-unit*.18);ctx.lineTo(x+step*1.15,y);ctx.lineTo(x+step*1.15,y-ht);ctx.lineTo(x+step*.78,y-ht-unit*.18);ctx.closePath();ctx.fill();
      ctx.fillStyle=i===2?'#e4ffab':style==='editorial'?'#d8dacf':'#64794e';
      ctx.beginPath();ctx.moveTo(x,y-ht);ctx.lineTo(x+step*.78,y-ht-unit*.18);ctx.lineTo(x+step*1.15,y-ht);ctx.lineTo(x+step*.37,y-ht+unit*.18);ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle=colors.fg;ctx.lineWidth=w*.005;ctx.beginPath();ctx.moveTo(-unit*.65,-unit*.3);ctx.lineTo(unit*.55,-unit*1.12);ctx.lineTo(unit*.14,-unit*1.1);ctx.moveTo(unit*.55,-unit*1.12);ctx.lineTo(unit*.47,-unit*.74);ctx.stroke();
    ctx.fillStyle=colors.fg;text(ctx,'1% SETIAP HARI',0,unit*1.13,w*.032,600,'center');
  } else if(variant===1) {
    ctx.globalAlpha=.15;circle(ctx,0,0,unit,false);circle(ctx,0,0,unit*.68,false);ctx.globalAlpha=1;
    ctx.save();ctx.rotate(-.5+t*.15);ctx.strokeStyle=colors.accent;ctx.lineWidth=w*.025;
    ctx.beginPath();ctx.arc(0,0,unit*.85,-Math.PI*.5,-Math.PI*.5+Math.PI*1.6*clamp(t/2));ctx.stroke();ctx.restore();
    ctx.fillStyle=colors.fg;text(ctx,'2',0,unit*.18,unit*1.2,900,'center');text(ctx,'MENIT',0,unit*.52,w*.034,700,'center');
    ctx.fillStyle=colors.accent;circle(ctx,Math.cos(t*.7)*unit,Math.sin(t*.7)*unit,unit*.09);
  } else if(variant===2) {
    const bars=7,bw=unit*.18;
    for(let i=0;i<bars;i++) {
      const grow=spring(t-.1-i*.07,220,24),bh=unit*(.35+i*.2);
      ctx.fillStyle=i===6?colors.accent:style==='editorial'?'#b3baa6':'#46553d';
      rect(ctx,(i-3.5)*bw*1.45,unit*.8-bh*grow,bw,bh*grow,bw*.22);
    }
    ctx.fillStyle=colors.fg;text(ctx,'PROSES > SEMPURNA',0,unit*1.13,w*.033,700,'center');
  } else if(variant===3) {
    for(let i=3;i>0;i--) {ctx.globalAlpha=.08*i;ctx.fillStyle=colors.accent;circle(ctx,0,0,unit*(.5+i*.22));}
    ctx.globalAlpha=1;ctx.fillStyle=colors.accent;circle(ctx,0,0,unit*.55);
    ctx.strokeStyle=colors.bg;ctx.lineWidth=unit*.09;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-unit*.23,0);ctx.lineTo(-unit*.04,unit*.18);ctx.lineTo(unit*.28,-unit*.17);ctx.stroke();
    ctx.fillStyle=colors.fg;text(ctx,'SATU LANGKAH NYATA.',0,unit*1.13,w*.031,700,'center');
  } else {
    ctx.save();ctx.rotate(t*.1);
    for(let i=0;i<12;i++){ctx.save();ctx.rotate(i*Math.PI/6);ctx.fillStyle=i%2?colors.accent:colors.fg;rect(ctx,unit*.73,-unit*.026,unit*.3,unit*.052);ctx.restore();}
    ctx.restore();ctx.fillStyle=colors.accent;circle(ctx,0,0,unit*.59);ctx.fillStyle=colors.bg;text(ctx,'↑',0,unit*.26,unit*1.1,800,'center');
    ctx.fillStyle=colors.fg;text(ctx,'MULAI LAGI BESOK.',0,unit*1.22,w*.032,700,'center');
  }
  ctx.restore();
}
export function drawFrame(canvas, project, time = 0, options = {}) {
  if(project.brief.style === 'kai') return drawKaiFrame(canvas, project, time, options);
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const {scene,index,local}=sceneAt(project,time);
  if(!scene)return;
  const colors=palette(project.brief.style,project.brief.accent), landscape=w>h, square=w===h;
  ctx.save();ctx.clearRect(0,0,w,h);ctx.fillStyle=colors.bg;ctx.fillRect(0,0,w,h);
  if(options.media) {
    const media=options.media,mw=media.videoWidth||media.naturalWidth||media.width,mh=media.videoHeight||media.naturalHeight||media.height;
    if(mw&&mh){
      const crop=scene.mediaCrop;
      const validCrop=crop&&[crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)&&crop.x>=0&&crop.y>=0&&crop.width>0&&crop.height>0&&crop.x+crop.width<=1&&crop.y+crop.height<=1;
      const sx=validCrop?crop.x*mw:0,sy=validCrop?crop.y*mh:0,sw=validCrop?crop.width*mw:mw,sh=validCrop?crop.height*mh:mh;
      const scale=Math.max(w/sw,h/sh);ctx.drawImage(media,sx,sy,sw,sh,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);
      const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#00000077');grad.addColorStop(.6,'#00000011');grad.addColorStop(1,'#00000099');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);colors.fg='#fff9ed';colors.bg='#10150e';}
  } else {
    ctx.strokeStyle=colors.fg;ctx.globalAlpha=.045;ctx.lineWidth=1;
    const spacing=w*.09;
    for(let x=0;x<w;x+=spacing)line(ctx,x,0,x,h);
    for(let y=0;y<h;y+=spacing)line(ctx,0,y,w,y);
    ctx.globalAlpha=1;
    const glow=ctx.createRadialGradient(w*.8,h*.52,0,w*.8,h*.52,w*.85);glow.addColorStop(0,colors.accent+'12');glow.addColorStop(1,colors.bg+'00');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  }
  const pad=w*.09;
  ctx.fillStyle=colors.accent;rect(ctx,pad,h*.08,w*.045,w*.009);
  ctx.fillStyle=colors.fg;text(ctx,'CATATAN UNTUK DIRI SENDIRI',pad+w*.068,h*.087,w*.022,600);
  ctx.fillStyle=colors.accent; text(ctx,String(index+1).padStart(2,'0'),w-pad,h*.088,w*.028,600,'right');
  ctx.fillStyle=colors.fg;ctx.globalAlpha=.15;rect(ctx,pad,h*.115,w-2*pad,1);ctx.globalAlpha=1;
  const maxWidth=landscape?w*.48:w*.83;
  const family=project.brief.style==='editorial'?'Georgia':'Arial',weight=project.brief.style==='editorial'?500:900;
  const portraitFootage=!!options.media&&!landscape&&!square;
  const headline=fitLines(ctx,scene.headline,maxWidth,w*(landscape?.078:square?.12:portraitFootage?.105:.138),portraitFootage?2:3,family,weight);
  const targetY=h*(landscape?.31:square?.26:portraitFootage?.17:.23);
  const lh=headline.size*.98;
  headline.lines.forEach((value,i)=>{
    const reveal=clamp(spring(local-.03-i*.085,190,28));
    ctx.save();ctx.beginPath();ctx.rect(pad,targetY-lh*.92+i*lh,maxWidth,lh*1.15);ctx.clip();ctx.globalAlpha=reveal;
    const y=targetY+i*lh+(1-reveal)*lh;
    if(project.brief.style==='cinematic'){ctx.fillStyle='#9e3649';for(let e=8;e>0;e-=2)text(ctx,value,pad+e*w/1080,y+e*w/1080,headline.size,900);}
    ctx.fillStyle=i===headline.lines.length-1?colors.accent:colors.fg;text(ctx,value,pad,y,headline.size,weight,'left',family);ctx.restore();
  });
  if(!options.media) {
    if(landscape){ctx.save();ctx.translate(w*.31,-h*.08);ctx.scale(.62,.8);graphic(ctx,w,h,local,index,colors,project.brief.style,scene.graphic);ctx.restore();}
    else if(square){ctx.save();ctx.translate(w*.16,h*.09);ctx.scale(.7,.78);graphic(ctx,w,h,local,index,colors,project.brief.style,scene.graphic);ctx.restore();}
    else graphic(ctx,w,h,local,index,colors,project.brief.style,scene.graphic);
  }
  else if(options.overlay!==false)footageAccents(ctx,w,h,local,index,colors);
  if(options.captions!==false)caption(ctx,scene,local,w,h,colors);
  ctx.fillStyle=colors.fg;ctx.globalAlpha=.45;text(ctx,'MOTIF / NOTES',pad,h*.92,w*.022,600);text(ctx,`${String(index+1).padStart(2,'0')} / ${String(project.scenes.length).padStart(2,'0')}`,w-pad,h*.92,w*.022,600,'right');
  ctx.fillStyle=colors.fg;rect(ctx,pad,h*.94,w*.82,Math.max(1,h*.001));ctx.globalAlpha=1;
  ctx.fillStyle=colors.accent;rect(ctx,pad,h*.94,w*.82*clamp(time/project.brief.duration),Math.max(2,h*.002));
  if(options.safeArea) {ctx.strokeStyle='#f09965';ctx.lineWidth=2;ctx.setLineDash([8,8]);ctx.strokeRect(w*.08,h*.12,w*.84,h*.7);ctx.setLineDash([]);}
  const end=scene.duration-local;
  if(scene.transition!=='cut'&&end<.22&&index<project.scenes.length-1){
    const progress=clamp(1-end/.22);ctx.fillStyle=colors.accent;
    if(scene.transition==='dissolve'){ctx.globalAlpha=progress;ctx.fillRect(0,0,w,h);}
    else if(scene.transition==='iris'){
      ctx.beginPath();ctx.rect(0,0,w,h);ctx.arc(w/2,h/2,Math.hypot(w,h)/2*(1-progress),0,Math.PI*2,true);ctx.fill('evenodd');
    }else{ctx.save();ctx.translate(w*progress*2-w,h/2);ctx.rotate(-.12);ctx.fillRect(-w,-h,w*1.3,h*2);ctx.restore();}
  }
  ctx.restore();
}
