import {spawn} from 'node:child_process';
import path from 'node:path';
for(const name of process.argv.slice(2)){
 const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(import.meta.dirname,'moon-pilot.mjs'),'generate',path.resolve('exports/kai-moon-mirror/specs',name+'.json')],{stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('exit',resolve)});
 if(code!==0)process.exit(code||1);
}
