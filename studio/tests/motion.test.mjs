import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFrame, sceneAt, dimensions, spring } from '../public/motion.mjs';
import { createProject } from '../public/planner.mjs';
import { KAI_BRIEF } from '../public/kai-brand.mjs';
import { kaiOverlayState } from '../public/kai-motion.mjs';

test('Kai overlays are seek-safe, sparse, and contain neither disclosure labels nor counters',()=>{
  const project=createProject(KAI_BRIEF), canvas=recordingCanvas(1080,1920);
  const times=[0,.1,.85,2.4,2.5,6,10.5,15,26.9,27.3,28.5,29.99];
  const expected=new Map(times.map(t=>[t,canvas.capture(project,t)]));
  for(const t of [...times].reverse())assert.equal(canvas.capture(project,t),expected.get(t));
  for(const commands of expected.values()) {
    const texts=JSON.parse(commands).filter(([name])=>name==='fillText').map(command=>command[1]);
    assert.ok(texts.every(text=>! /AI VISUAL|^0{1,2}\d$|STEP\s*\d|MOTIF|CATATAN UNTUK/i.test(text)));
  }
  assert.equal(kaiOverlayState(project,.85).opening,true);
  assert.equal(kaiOverlayState(project,6).hook,'');
  assert.equal(kaiOverlayState(project,12).note,'Cut to fit.');
  assert.equal(kaiOverlayState(project,28).reveal,true);
  assert.equal(project.captions,false);
});

// This records Canvas API operations and checks numeric geometry/state balance.
// It deliberately does not claim to compare pixels, fonts, browser video seeking,
// or visual quality; those are checked with the actual browser/export preview.
function recordingCanvas(width, height) {
  const events = [], stack = [];
  let state = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, font: '10px sans-serif', textAlign: 'start', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
  const serial = (value) => value?.gradient ? { gradient: value.gradient, args: value.args, stops: [...value.stops] } : value;
  const record = (name, args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${name} received non-finite geometry`);
    if (name === 'arc') assert.ok(args[2] >= 0, 'Circle radius must not be negative.');
    if (['roundRect', 'rect', 'fillRect', 'clearRect', 'strokeRect'].includes(name)) assert.ok(args[2] >= 0 && args[3] >= 0, `${name} received a negative extent`);
    events.push([name, ...args.map(serial)]);
  };
  const gradient = (name, args) => { record(name, args); return { gradient: name, args, stops: [], addColorStop(at, color) { assert.ok(at >= 0 && at <= 1); this.stops.push([at, color]); } }; };
  const methods = {
    save() { record('save', []); stack.push({ ...state }); },
    restore() { record('restore', []); assert.ok(stack.length, 'Canvas restore must have a matching save.'); state = stack.pop(); },
    measureText(value) { const size = Number(/([\d.]+)px/.exec(state.font)?.[1] || 10); return { width: [...String(value)].length * size * 0.58 }; },
    createLinearGradient(...args) { return gradient('linear', args); },
    createRadialGradient(...args) { return gradient('radial', args); },
    drawImage(media, ...args) { record('drawImage', [media.id || 'media', ...args]); },
  };
  const ctx = new Proxy(methods, {
    get(target, key) { if (key in target) return target[key]; if (key in state) return state[key]; return (...args) => record(key, args); },
    set(target, key, value) { if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} must be finite`); if (key === 'globalAlpha') assert.ok(value >= 0 && value <= 1); state[key] = value; events.push(['set', key, serial(value)]); return true; },
  });
  return { width, height, getContext(type) { assert.equal(type, '2d'); return ctx; },
    capture(project, time, options) { events.length = 0; const before = { ...state }; drawFrame(this, project, time, options); assert.equal(stack.length, 0); assert.deepEqual(state, before, 'A frame must restore Canvas state.'); return JSON.stringify(events); } };
}

test('frame operations stay deterministic after backward and out-of-order seeks', () => {
  for (const style of ['kinetic', 'cinematic', 'editorial', 'stickman']) {
    const project = createProject({ topic: 'Mulai kecil', style, duration: 30, clipDuration: 6, aspectRatio: '9:16', fps: 30 });
    const original = structuredClone(project);
    for (const ratio of ['9:16', '16:9', '1:1']) {
      const size = dimensions(ratio, 540), canvas = recordingCanvas(size.width, size.height);
      const times = [0, 0.03, 0.75, 5.9, 6, 12.5, 18.5, 24.5, 29.99];
      const expected = new Map(times.map((time) => [time, canvas.capture(project, time)]));
      for (const time of [29.99, 0.75, 18.5, 6, 0, 12.5, 5.9, 24.5, 0.03]) assert.equal(canvas.capture(project, time), expected.get(time), `${style}, ${ratio}, t=${time} changed after seeking`);
      const options = { safeArea: true, captions: false, media: { id: 'reference-image', naturalWidth: 1920, naturalHeight: 1080 } };
      const mediaFrame = canvas.capture(project, 4.75, options);
      canvas.capture(project, 21.3);
      assert.equal(canvas.capture(project, 4.75, options), mediaFrame, 'Crop, captions and safe area must also be seekable.');
      const commands = JSON.parse(mediaFrame), media = commands.find(([name]) => name === 'drawImage');
      const [x, y, width, height] = media.slice(-4);
      assert.ok(x <= 0 && y <= 0 && width >= size.width && height >= size.height, 'Cover crop must completely fill the frame.');
      assert.ok(Math.abs(width / height - 16 / 9) < 0.00001, 'Media crop must preserve source aspect ratio.');
    }
    assert.deepEqual(project, original, 'Drawing must never mutate the editable project.');
  }
});

test('portrait close-up keeps the selected book area and is stable after seeking', () => {
  const project=createProject({topic:'Mulai kecil',style:'cinematic',duration:30,clipDuration:6,aspectRatio:'9:16',fps:30});
  project.scenes[0].mediaCrop={x:.225,y:.44,width:.55,height:.55};
  const canvas=recordingCanvas(1080,1920), options={media:{id:'flow',width:720,height:1280}};
  const before=canvas.capture(project,2,options);
  const command=JSON.parse(before).find(([name])=>name==='drawImage');
  const [sx,sy,sw,sh,x,y,w,h]=command.slice(2);
  assert.ok(Math.abs(sx-162)<.001&&Math.abs(sy-563.2)<.001);
  assert.ok(Math.abs(sw-396)<.001&&Math.abs(sh-704)<.001);
  assert.ok(x<=.001&&y<=.001&&w>=1079.999&&h>=1919.999);
  canvas.capture(project,20,options);
  assert.equal(canvas.capture(project,2,options),before);
});

test('timeline boundaries and output dimensions are valid for each export ratio', () => {
  const project = { scenes: [{ duration: 2 }, { duration: 3 }, { duration: 1 }] };
  assert.deepEqual(sceneAt(project, -1), { scene: project.scenes[0], index: 0, start: 0, local: 0 });
  assert.equal(sceneAt(project, 1.999).index, 0);
  assert.deepEqual(sceneAt(project, 2), { scene: project.scenes[1], index: 1, start: 2, local: 0 });
  assert.deepEqual(sceneAt(project, 99), { scene: project.scenes[2], index: 2, start: 5, local: 1 });
  for (const ratio of ['9:16', '16:9', '1:1']) for (const quality of [360, 540, 720, 1080]) {
    const { width, height } = dimensions(ratio, quality);
    assert.equal(width % 2, 0); assert.equal(height % 2, 0);
    assert.ok(width <= 1920 && height <= 1920 && width * height <= 1080 * 1920);
    const expected = ratio === '1:1' ? 1 : ratio === '16:9' ? 16 / 9 : 9 / 16;
    assert.ok(Math.abs(width / height - expected) < 0.003, `Invalid ${ratio} export dimensions.`);
  }
});

test('analytic springs remain finite across under-, critical-, and overdamped settings', () => {
  for (const damping of [16, 2 * Math.sqrt(170), 60]) {
    assert.equal(spring(-0.5, 170, damping), 0); assert.equal(spring(0, 170, damping), 0);
    for (const time of [0.001, 0.1, 0.5, 1, 3, 180]) assert.ok(Number.isFinite(spring(time, 170, damping)));
    assert.ok(Math.abs(spring(5, 170, damping) - 1) < 0.001, 'Springs must settle at their final position.');
  }
});

test('headline fitting keeps ordinary Indonesian words intact at portrait size', () => {
  const project=createProject({duration:30,style:'kinetic'}),canvas=recordingCanvas(540,960);
  for(const headline of ['PERASAANMU BOLEH BERUBAH','KECILKAN LANGKAHNYA','BUAT LANGKAHNYA JELAS']){
    project.scenes[0].headline=headline;
    const commands=JSON.parse(canvas.capture(project,1,{captions:false}));
    const headlineParts=commands.filter(([name,value])=>name==='fillText'&&headline.split(' ').some(word=>String(value).split(' ').includes(word))).map(([,value])=>value);
    assert.equal(headlineParts.join(' '),headline,'Fit font size before breaking a word across lines.');
  }
});
