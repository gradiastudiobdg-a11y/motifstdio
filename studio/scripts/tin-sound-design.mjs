// Original non-musical Foley. Cue times are editable editorial placements.
export function tinSoundDesign(cues,duration=30,rate=48000){
 const count=Math.round(duration*rate),data=Buffer.alloc(44+count*4);let seed=0x74696e,low=0,mid=0;
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*4,40);
 for(let i=0;i<count;i++){
  const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low=.985*low+.015*noise;mid=.65*mid+.35*noise;
  let v=low*.035;
  for(const cue of cues){const d=t-cue.time,span=cue.duration||.4;if(d<0||d>span)continue;const fade=Math.min(1,d/.018,(span-d)/.04);
   if(cue.kind==='metal')v+=(Math.sin(2*Math.PI*870*d)*Math.exp(-d*25)*.025+Math.sin(2*Math.PI*1377*d)*Math.exp(-d*32)*.014+mid*.14*Math.exp(-d*55))*fade;
   if(cue.kind==='spool'||cue.kind==='pot'||cue.kind==='wood')v+=(Math.sin(2*Math.PI*(cue.kind==='wood'?155:110)*d)*Math.exp(-d*33)*.075+mid*.10*Math.exp(-d*48))*fade;
   if(cue.kind==='rope')v+=(mid-low)*.055*(.5+.5*Math.sin(2*Math.PI*8*d)**2)*fade;
   if(cue.kind==='press')v+=(mid-low)*.025*fade;
   if(cue.kind==='snip')v+=((noise-mid)*.18*Math.exp(-d*80)+(Math.sin(2*Math.PI*1800*d)+Math.sin(2*Math.PI*2450*d))*.018*Math.exp(-d*60))*Math.min(1,d/.002);
   if(cue.kind==='leaf')v+=(noise-mid)*.014*fade;
  }
  const env=Math.min(1,t/.08,(duration-t)/.2),s=Math.round(Math.max(-.9,Math.min(.9,v*env))*32767);data.writeInt16LE(s,44+i*4);data.writeInt16LE(s,46+i*4);
 }
 return data;
}
