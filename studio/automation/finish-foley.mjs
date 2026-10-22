// Original designed texture, not a claim of location-recorded or aligned Foley.
// Explicit project.soundCues can replace the estimated editorial cue positions.
export function createFoleyTrack(project, rate=48000) {
  const duration=project.scenes.reduce((n,s)=>n+s.duration,0);
  let start=0;
  const estimated=project.scenes.flatMap(scene=>{
    const action=`${scene.visual} ${scene.motion}`;
    const kinds=[/scissor|cut along/i.test(action)&&'cut', /paper|fold|rub/i.test(action)&&'paper', /pencil|mark|ruler/i.test(action)&&'pencil', /place|tap|insert|sort/i.test(action)&&'tap'].filter(Boolean);
    const cues=kinds.map((kind,i)=>({ time:start+Math.min(scene.duration-.2,.6+(i+1)*(scene.duration-1.2)/(kinds.length+1)),kind }));start+=scene.duration;return cues;
  });
  const explicit=project.soundCues;
  if(explicit!==undefined&&(!Array.isArray(explicit)||explicit.length>200||explicit.some(c=>!Number.isFinite(c.time)||c.time<0||c.time>=duration||!['cut','paper','pencil','tap'].includes(c.kind))))throw Error('Invalid Foley cue timeline.');
  const cues=explicit??estimated, samples=Math.ceil(duration*rate), pcm=Buffer.alloc(samples*4);
  let seed=0x4b414931, low=0;
  for(let n=0;n<samples;n++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;low=.97*low+.03*noise;
    const t=n/rate;let v=low*.055 + Math.sin(t*Math.PI*2*95)*.0007;
    for(const cue of cues){const d=t-cue.time;if(d<0||d>.65)continue;
      if(cue.kind==='tap')v+=Math.sin(d*2*Math.PI*230)*Math.exp(-d*32)*.22;
      else {const span=cue.kind==='cut'?.22:.6,env=Math.sin(Math.PI*Math.min(1,d/span))**2;v+=(noise-low)*env*(cue.kind==='paper'?.10:.055);}
    }
    const fade=Math.min(1,t/.15,(duration-t)/.3), value=Math.round(Math.max(-.85,Math.min(.85,v*fade))*32767);
    pcm.writeInt16LE(value,n*4);pcm.writeInt16LE(value,n*4+2);
  }
  const head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(pcm.length+36,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(2,22);head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*4,28);head.writeUInt16LE(4,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(pcm.length,40);
  return { wav:Buffer.concat([head,pcm]), cues, timing:explicit?'editable-cues':'estimated-from-scene-actions', origin:'original-procedural-sound-design' };
}
