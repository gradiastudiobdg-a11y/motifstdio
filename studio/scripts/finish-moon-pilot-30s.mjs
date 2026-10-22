import path from 'node:path';
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {finishVideo,parseMediaMetadata} from '../automation/finish-video-core.mjs';
import {moonPilotScore} from './moon-pilot-score.mjs';
const studio=path.resolve(import.meta.dirname,'..'),root=path.resolve(studio,'../exports/kai-moon-mirror'),ffmpeg=path.join(studio,'tools/ffmpeg.exe');
const sourceRoot=root;const editRoot=path.join(root,'revision-30s');
const ledger=JSON.parse(await readFile(path.join(sourceRoot,'pilot.json'),'utf8'));
const cuts=[
 ['teaser','night-video-v1',1,3,'Make a little moon.',{x:.5,y:.25,width:.45,height:.45}],
 ['ring','ring-video-v1',3.5,2.2,'A simple wood hoop.'],
 ['spread','spread-video-v1',3,1,'Shape the crescent.'],
 ['texture','texture-video-v1',2.5,0,'Give it a moon surface.'],
 ['texture-detail','texture-video-v1',1.5,2.5,'',{x:.24,y:.2,width:.72,height:.72}],
 ['fit','fit-video-v1',3.5,1.5,'A mirror in the middle.'],
 ['led','led-video-v1',3,1.5,'Hide a little light.'],
 ['day','day-video-v1',2,0,'Wait for it.'],
 ['reveal','reveal-video-v2',5,0,''],
 ['night','night-video-v1',5,1,'A little moonlight.'],
];
const project={version:1,id:'kai-moon-mirror-pilot',title:'A Little Moonlight',brief:{style:'kai',duration:30,aspectRatio:'9:16',fps:30},captions:false,musicVolume:0,kaiLayout:{openingFontSize:88,revealFontSize:84,showProcessNotes:true,showTimestamp:false,showProgressBar:true,darkHero:true},scenes:cuts.map(([id,assetId,duration,trimStart,headline,mediaCrop])=>({id,assetId,duration,trimStart,headline,mediaCrop,label:id,voiceover:'',visual:'Actual Flow footage from pilot receipt',motion:'',transition:'cut'}))};
const assets=new Map();
for(const a of ledger.attempts.filter(a=>a.kind==='video'&&a.result?.jobs?.length))assets.set(a.id,{id:a.id,path:path.join(sourceRoot,'sources',a.id+'.mp4'),type:'video/mp4',source:{provider:'google-flow',projectId:ledger.project.id,mediaId:a.result.jobs[0].mediaId,testFixture:false}});
await mkdir(editRoot,{recursive:true});
await writeFile(path.join(editRoot,'project.json'),JSON.stringify(project,null,2));
const run=(args)=>new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-nostdin',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';p.stderr.on('data',d=>out=(out+d).slice(-12000));p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(Error(out)));});
const renderVersion=path.join(editRoot,'render-dark-hero-v2.json');
if(!await stat(renderVersion).catch(()=>null)){await finishVideo({project,jobDir:editRoot,ffmpegPath:ffmpeg,getAsset:async id=>assets.get(id)});await writeFile(renderVersion,JSON.stringify({darkHero:true}));}
await mkdir(path.join(editRoot,'audio-edit'),{recursive:true});
for(const [i,scene]of project.scenes.entries()){
 await run(['-y','-hide_banner','-loglevel','error','-ss',String(scene.trimStart),'-i',assets.get(scene.assetId).path,'-vn','-af',`aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${scene.duration},afade=t=in:d=0.025,afade=t=out:st=${scene.duration-.055}:d=0.055`,'-t',String(scene.duration),'-c:a','pcm_s16le',path.join(editRoot,'audio-edit',i+'.wav')]);
}
await writeFile(path.join(editRoot,'audio-edit/list.txt'),project.scenes.map((_,i)=>`file '${i}.wav'`).join('\n'));
await run(['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(editRoot,'audio-edit/list.txt'),'-af','loudnorm=I=-22:TP=-2:LRA=8','-t','30','-c:a','pcm_s16le',path.join(editRoot,'native-flow-sound.wav')]);
const final=path.join(editRoot,'kai-moon-mirror-30s.mp4');
await writeFile(path.join(editRoot,'original-music.wav'),moonPilotScore(48000,30,22));
await run(['-y','-hide_banner','-loglevel','error','-i',path.join(editRoot,'final.mp4'),'-i',path.join(editRoot,'native-flow-sound.wav'),'-i',path.join(editRoot,'original-music.wav'),'-filter_complex',"[2:a]volume=0.75[music];[1:a]acompressor=threshold=0.15:ratio=3:attack=5:release=100[fx];[fx][music]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-20:TP=-1.5:LRA=9,aresample=48000[mix]",'-map','0:v:0','-map','[mix]','-c:v','copy','-c:a','aac','-b:a','192k','-t','30','-movflags','+faststart',final]);
const decoded=await run(['-hide_banner','-i',final,'-af','volumedetect','-f','null','-']);const info=parseMediaMetadata(decoded);
if(info.width!==1080||info.height!==1920||Math.abs(info.duration-30)>.05||info.fps!==30||!info.audio||info.meanVolume<=-45)throw Error('Final validation failed');
const report={budget:200,creditsReserved:ledger.spentReserved,photoGenerations:ledger.attempts.filter(x=>x.kind==='image').length,videoGenerations:ledger.attempts.filter(x=>x.kind==='video').length,retakes:['reveal-video-v2'],sources:cuts.map(c=>({scene:c[0],attempt:c[1],mediaId:assets.get(c[1]).source.mediaId})),output:info,audio:'Edited native Flow-generated sound plus quiet original procedural instrumental; not recorded real-world Foley',canvas:'shared public/motion.mjs with two-colour progress bar',final};
await writeFile(path.join(editRoot,'production-report.json'),JSON.stringify(report,null,2));
await writeFile(path.join(editRoot,'publish.txt'),'A Little Moonlight 🌙\n\nA simple hoop, a textured crescent, and a little hidden light. Wait for the glow.\n\nKai Makes Do is an AI-created DIY inspiration series. Visuals and source sound are AI-generated; this is a concept, not a tested construction tutorial.\n\n#KaiMakesDo #MoonMirror #HomeDecor #DIYInspiration #Shorts\n');
console.log(JSON.stringify(report));
