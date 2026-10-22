import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folders=['tests','flow-bridge/tests','automation/tests'];
const files=[];
for(const folder of folders){
  const names=await readdir(path.join(root,folder)).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  files.push(...names.filter(name=>name.endsWith('.test.mjs')).sort().map(name=>path.join(root,folder,name)));
}
if(!files.length)throw Error('No studio tests were found.');
const child=spawn(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('close',code=>{process.exitCode=code??1;});
