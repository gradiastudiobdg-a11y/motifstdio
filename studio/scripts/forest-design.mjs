import {writeFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '../automation/node_modules/@napi-rs/canvas/index.js';
import path from 'node:path';
const dest=path.resolve(import.meta.dirname,'../../exports/kai-a-forest-inside/design');
const pine=(x,y,w,h)=>`M${x} ${y}l${-w*.25} ${h*.26}h${w*.14}l${-w*.32} ${h*.3}h${w*.18}l${-w*.3} ${h*.3}h${w*.28}v${h*.14}h${w*.54}v${-h*.14}h${w*.28}l${-w*.3} ${-h*.3}h${w*.18}l${-w*.32} ${-h*.3}h${w*.14}Z`;
const ground='M0 420 Q85 397 175 418 T400 410 V500 H0Z';
const shapes=[
 {id:'sky',path:'M0 0H400V500H0Z'},
 {id:'cabin-hill',path:'M0 405 Q110 365 210 382 L240 382 V321 H226 L267 280 L309 321 H295 V387 Q350 381 400 402 V500H0Z',hole:'M258 333H277V359H258Z'},
 {id:'distant-trees',path:ground+' '+pine(83,241,37,183)+' '+pine(145,275,34,149)+' '+pine(345,238,40,187)},
 {id:'right-pine',path:ground+' '+pine(365,80,83,343)},
 {id:'left-pine',path:ground+' '+pine(37,54,90,370)},
 {id:'foreground',path:'M0 455L60 451L68 429L75 450L100 443L108 421L115 449L154 452L164 435L173 455L242 446L253 423L259 447L308 453L320 430L326 454L400 448V500H0Z'}
];
await writeFile(path.join(dest,'layer-geometry.json'),JSON.stringify({origin:'Code-drawn design reference only, not Flow photography or footage',order:shapes},null,2));
let groups='';
for(const [i,s]of shapes.entries()){
 const border=i?'M0 0H400V500H0Z M14 14V486H386V14Z':'';
 groups+=`<g transform="translate(${105-i*3} ${166-i*2})" filter="url(#shadow)"><path fill="${['#e3ded4','#eee9df','#f2ede3','#f5f1e9','#f7f3ec','#f9f5ed'][i]}" fill-rule="evenodd" d="${border} ${s.path} ${s.hole||''}"/></g>`;
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="850" viewBox="0 0 600 850"><defs><filter id="shadow" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="4" dy="6" stdDeviation="3" flood-color="#413a2d" flood-opacity=".30"/></filter></defs><rect width="600" height="850" fill="#e7e2d9"/><path d="M65 110H530V726H65Z" fill="#957851"/><path fill="#c6ac83" fill-rule="evenodd" d="M50 95H515V710H50Z M80 125V680H485V125Z"/><rect x="80" y="125" width="405" height="555" fill="#ded7c8"/>${groups}<path fill="#c4a477" fill-rule="evenodd" d="M50 95H515V710H50Z M88 136V671H477V136Z"/></svg>`;
await writeFile(path.join(dest,'forest-design-reference.svg'),svg);const c=createCanvas(600,850);c.getContext('2d').drawImage(await loadImage(Buffer.from(svg)),0,0);await writeFile(path.join(dest,'forest-design-reference.png'),await c.encode('png'));
console.log('Saved six-plane design reference and editable geometry; not claimed Flow media.');
