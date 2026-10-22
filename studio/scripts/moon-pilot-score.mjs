// Original 96 BPM instrumental, composed for the 40-second moon reveal.
// No sampled recordings or third-party melodies.
export function moonPilotScore(rate=48000,seconds=40,reveal=30){
 const n=Math.round(seconds*rate),left=new Float32Array(n),right=new Float32Array(n);
 const hz=m=>440*2**((m-69)/12),beat=.625,bar=2.5;
 const chords=[[48,55,59,64,67],[45,52,55,59,64],[41,48,52,57,60],[43,50,55,57,62]];
 function note(at,midi,length,gain,pan=0){
  const f=hz(midi),start=Math.round(at*rate),end=Math.min(n,start+Math.round(length*rate));
  for(let i=Math.max(0,start);i<end;i++){const t=(i-start)/rate;
   const env=(1-Math.exp(-t*110))*Math.exp(-t*2.3/length)*Math.min(1,(length-t)/.16);
   const v=(Math.sin(2*Math.PI*f*t)+.24*Math.sin(2*Math.PI*f*2.001*t)*Math.exp(-t*3)+.075*Math.sin(2*Math.PI*f*3*t)*Math.exp(-t*6))*env*gain;
   left[i]+=v*(.75-pan*.2);right[i]+=v*(.75+pan*.2);
   const echo=i+Math.round(.19*rate);if(echo<n){left[echo]+=v*.12;right[echo]+=v*.17;}
  }
 }
 for(let b=0;b<Math.ceil(seconds/bar);b++){
  const chord=b*bar>=reveal?[48,55,59,64,67]:chords[Math.floor(b/2)%4];
  note(b*bar,chord[0]-12,2.45,.047);
  for(let k=1;k<chord.length;k++)note(b*bar+.025*k,chord[k],2.4,.018,k%2?.6:-.6);
  for(let k=0;k<4;k++){
   if(b*bar>=reveal&&k%2)continue;
   note(b*bar+k*beat,chord[[2,4,3,1][k]]+12,1.5,b*bar>=reveal?.036:.042,k%2?.45:-.45);
  }
 }
 // Gentle high piano colour after the practical LED click at 30 seconds.
 note(reveal+.22,84,3.5,.018,-.5);note(reveal+.37,79,3.3,.022,.5);
 let seed=2317,low=0;
 for(let i=0;i<n;i++){
  const t=i/rate,phase=t%beat;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low=.94*low+.06*noise;
  const pulse=t<reveal-.5?Math.sin(2*Math.PI*48*phase)*Math.exp(-phase*32)*.025:0;
  const brush=t<reveal-.5?(noise-low)*Math.exp(-((t+beat/2)%beat)*65)*.0018:0;
  const fade=Math.min(1,t/.4,(seconds-t)/1.5);
  const pause=t>=reveal-.45&&t<reveal+.22?.14:1;
  left[i]=(left[i]+pulse+brush)*fade*pause;right[i]=(right[i]+pulse+brush)*fade*pause;
 }
 const data=Buffer.alloc(44+n*4);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(2,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*4,28);data.writeUInt16LE(4,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++){data.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,left[i]))*32767),44+i*4);data.writeInt16LE(Math.round(Math.max(-.95,Math.min(.95,right[i]))*32767),46+i*4)}
 return data;
}
