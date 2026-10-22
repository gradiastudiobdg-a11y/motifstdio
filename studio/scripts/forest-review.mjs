import path from 'node:path';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createCanvas,loadImage} from '../automation/node_modules/@napi-rs/canvas/index.js';
const root=path.resolve(import.meta.dirname,'../../exports/kai-a-forest-inside'),src=path.join(root,'sources'),out=path.join(root,'review'),ffmpeg=path.resolve(import.meta.dirname,'../tools/ffmpeg.exe');await mkdir(out,{recursive:true});
const mode=process.argv[2]||'photos';
if(mode==='photos'){
 const files=(await readdir(src)).filter(f=>/photo.*\.png$/.test(f));
 for(let s=0;s<files.length;s+=4){const chosen=files.slice(s,s+4),c=createCanvas(960,910);const x=c.getContext('2d');x.fillStyle='#e8e2d8';x.fillRect(0,0,c.width,c.height);x.font='19px sans-serif';
  for(const[i,file]of chosen.entries()){const img=await loadImage(path.join(src,file)),left=i%2*480,top=Math.floor(i/2)*455;x.fillStyle='#29332d';x.fillText(file,left+12,top+23);x.drawImage(img,left+125,top+35,230,412)}
  await writeFile(path.join(out,'photos-'+Math.floor(s/4)+'.jpg'),await c.encode('jpeg',90));
 }
}
if(mode==='videos'){
 const selected=process.argv.slice(3),files=(await readdir(src)).filter(f=>f.endsWith('.mp4')&&(!selected.length||selected.some(s=>f.startsWith(s))));
 for(const file of files){await new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-y','-nostdin','-hide_banner','-loglevel','error','-i',path.join(src,file),'-vf','fps=4,scale=180:320,tile=8x4','-frames:v','1',path.join(out,file.replace('.mp4','-contact.jpg'))],{windowsHide:true,stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',b=>err+=b);p.on('exit',code=>code?reject(Error(err)):resolve())});console.log(file)}
}
