// Original designed Foley; cue positions are editorial estimates from reviewed actions.
// No samples, speech, melody or music. Seeded noise makes offline renders repeatable.
export function forestSoundDesign(cues,duration=30,rate=48000){
 const count=Math.round(duration*rate),data=Buffer.alloc(44+count*4);let seed=0x666f7265,low=0,mid=0,air=0;
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*4,40);
 for(let i=0;i<count;i++){
  const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
  low=.992*low+.008*noise;mid=.58*mid+.42*noise;air=.90*air+.10*noise;
  let left=low*.045+air*.0018,right=low*.044+air*.0017;
  for(const c of cues){const d=t-c.time,span=c.duration||.4;if(d<0||d>span)continue;
   const env=Math.min(1,d/.015,(span-d)/.055),texture=(mid-air),swell=.48+.27*Math.sin(d*31.1)+.17*Math.sin(d*77.3+1.2);let v=0;
   if(c.kind==='paper')v=(texture*.060+noise*.007)*swell*env;
   if(c.kind==='seat')v=(texture*.026*env+mid*.038*Math.exp(-d*65)+Math.sin(d*2*Math.PI*230)*.022*Math.exp(-d*36));
   if(c.kind==='wood')v=(Math.sin(2*Math.PI*145*d)*.080*Math.exp(-d*36)+Math.sin(2*Math.PI*391*d)*.016*Math.exp(-d*50)+mid*.095*Math.exp(-d*55))*Math.min(1,d/.002);
   if(c.kind==='panel')v=(texture*.045*env+Math.sin(d*2*Math.PI*181)*.045*Math.exp(-d*33));
   if(c.kind==='switch')v=((noise-mid)*.16*Math.exp(-d*120)+Math.sin(2*Math.PI*2150*d)*.025*Math.exp(-d*100))*Math.min(1,d/.001);
   if(c.kind==='cloth')v=texture*.017*swell*env;
   const pan=Math.max(-.6,Math.min(.6,c.pan||0));left+=v*(1-pan*.4);right+=v*(1+pan*.4);
  }
  const fade=Math.min(1,t/.08,(duration-t)/.22);data.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,left*fade))*32767),44+i*4);data.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,right*fade))*32767),46+i*4);
 }
 return data;
}
