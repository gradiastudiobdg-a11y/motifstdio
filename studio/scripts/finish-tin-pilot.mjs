import path from 'node:path';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {finishVideo,parseMediaMetadata} from '../automation/finish-video-core.mjs';
import {tinSoundDesign} from './tin-sound-design.mjs';
const studio=path.resolve(import.meta.dirname,'..'),root=path.resolve(studio,'../exports/kai-keep-the-tin'),ffmpeg=path.join(studio,'tools/ffmpeg.exe');
const ledger=JSON.parse(await readFile(path.join(root,'pilot.json'),'utf8'));
const cuts=[
 ['notice','notice-video-v1',3,.5,'Keep the tin.'],
 ['materials','materials-video-v1',3,.5,''],
 ['anchor','anchor-video-v1',4,.5,''],
 ['wrap','wrap-video-v3',5,.5,''],
 ['trim','trim-video-v1',4,.7,''],
 ['insert','insert-video-v1',3,.5,'Once dry.'],
 ['place','place-video-v1',5,.5,''],
 ['final','final-video-v1',3,.5,'A little greener.'],
];
const project={version:1,id:'kai-keep-the-tin',title:'Keep the Tin.',brief:{style:'kai',duration:30,aspectRatio:'9:16',fps:30},captions:false,musicVolume:0,kaiLayout:{openingFontSize:64,revealFontSize:72,openingHookY:220,revealHookY:220,openingMaxLines:1,revealMaxLines:1,compactFooter:true,showProcessNotes:true,showTimestamp:false,showProgressBar:true},scenes:cuts.map(([id,assetId,duration,trimStart,headline])=>({id,assetId,duration,trimStart,headline,label:id,voiceover:'',visual:'Real Flow footage; same Kai, room and planter reference',motion:'',transition:'cut'}))};
const assets=new Map();for(const a of ledger.attempts.filter(a=>a.kind==='video'&&a.result?.jobs?.length))assets.set(a.id,{id:a.id,path:path.join(root,'sources',a.id+'.mp4'),type:'video/mp4',source:{provider:'google-flow',projectId:ledger.project.id,mediaId:a.result.jobs[0].mediaId,testFixture:false}});
await writeFile(path.join(root,'project.json'),JSON.stringify(project,null,2));
const run=args=>new Promise((resolve,reject)=>{const p=spawn(ffmpeg,['-nostdin',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';p.stderr.on('data',d=>out=(out+d).slice(-18000));p.on('error',reject);p.on('exit',c=>c===0?resolve(out):reject(Error(out)))});
if(!await stat(path.join(root,'render-v1.json')).catch(()=>null)){await finishVideo({project,jobDir:root,ffmpegPath:ffmpeg,getAsset:async id=>assets.get(id)});await writeFile(path.join(root,'render-v1.json'),'{}');}
const cues=[{kind:'metal',time:.25,duration:.3},{kind:'spool',time:4.1,duration:.35},{kind:'press',time:6.45,duration:1.6},{kind:'rope',time:10.2,duration:4.5},{kind:'snip',time:16.2,duration:.18},{kind:'pot',time:20.4,duration:.35},{kind:'wood',time:22.7,duration:.4},{kind:'leaf',time:27.4,duration:.75}];
await writeFile(path.join(root,'sound-cues.json'),JSON.stringify(cues,null,2));await writeFile(path.join(root,'tin-sound-design.wav'),tinSoundDesign(cues));
const final=path.join(root,'kai-keep-the-tin-30s-no-music.mp4');
await run(['-y','-hide_banner','-loglevel','error','-i',path.join(root,'final.mp4'),'-i',path.join(root,'tin-sound-design.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-24:TP=-2:LRA=9,aresample=48000:ocl=stereo','-c:a','aac','-b:a','192k','-t','30','-movflags','+faststart',final]);
const decoded=await run(['-hide_banner','-i',final,'-af','volumedetect','-f','null','-']),info=parseMediaMetadata(decoded);if(info.width!==1080||info.height!==1920||Math.abs(info.duration-30)>.05||info.fps!==30||!info.audio||info.meanVolume<=-45)throw Error('Final file validation failed');
const report={budgetCredits:ledger.budgetCredits,creditsReserved:ledger.spentReserved,photos:ledger.attempts.filter(a=>a.kind==='image').length,videoAttempts:ledger.attempts.filter(a=>a.kind==='video').length,output:info,foley:{origin:'Original procedural non-musical sound design',timing:'Editorial cue placements guided by reviewed actions; approximate synchronization',music:false,dialogue:false,cues},sources:cuts.map(c=>({sceneId:c[0],attempt:c[1],mediaId:assets.get(c[1]).source.mediaId})),final};
await writeFile(path.join(root,'production-report.json'),JSON.stringify(report,null,2));
await writeFile(path.join(root,'publish.txt'),'Keep the tin. A little greener.\n\nAn empty tin gets a second job as a cotton-wrapped cover for a small nursery pot. The plant stays in its own inner pot.\n\nKai is a fictional AI-created character. Visuals are AI-generated; this is DIY inspiration, not a tested construction tutorial.\n\n#KaiMakesDo #KeepTheTin #LittleMakes #PlantPot #DIYInspiration #Shorts\n');console.log(JSON.stringify(report));
