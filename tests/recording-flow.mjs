import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1280,height:720}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
const wait=fn=>p.waitForFunction(fn,null,{timeout:16000});
const sample=()=>p.evaluate(()=>{const a=globalThis.probe;const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);return Math.max(...data.map(Math.abs));});
try {
 await p.goto(process.env.PINKBOX_URL||'http://localhost:3000');await p.click('#play');
 await p.evaluate(async()=>{globalThis.e=(await import('/src/main.js')).engine;const a=e.context.rawContext.createAnalyser();a.fftSize=1024;e.master.connect(a);globalThis.probe=a;});
 await wait(()=>e.state.status==='running');
 await p.locator('#motion').evaluate(el=>{el.value=100;el.dispatchEvent(new Event('input',{bubbles:true}));});
 await p.click('#record');await wait(()=>e.state.rec?.phase==='recording');const began=Date.now();
 await p.click('[data-toggle="keys"]'); // user's original sequence: turning LIVE off must finish capture
 await wait(()=>Boolean(e.state.tracks.keys.clip)&&!e.state.rec);
 const elapsed=Date.now()-began;assert(elapsed>7400&&elapsed<9000,`Four bars at 120 BPM: ${elapsed}ms`);
 const saved=await p.evaluate(()=>structuredClone(e.state.tracks.keys.clip));
 assert.equal(saved.length,64);assert(saved.every(event=>event.notes.length===1));
 assert.equal(await p.evaluate(()=>e.state.tracks.keys.active),false);
 assert.equal(await p.evaluate(()=>e.state.tracks.keys.loopActive),true);
 assert((await sample())>0.0001,'Saved loop is silent with LIVE off');
 await p.locator('#motion').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input',{bubbles:true}));});
 await p.click('[data-toggle="keys"]');await wait(()=>e.state.tracks.keys.active);
 await p.waitForTimeout(2300);assert.deepEqual(await p.evaluate(()=>e.state.tracks.keys.clip),saved);
 await p.click('[data-toggle="keys"]');await wait(()=>!e.state.tracks.keys.active);await p.waitForTimeout(350);
 assert((await sample())>0.0001,'Disabling LIVE also muted LOOP');
 await p.click('[data-loop="keys"]');await wait(()=>!e.state.tracks.keys.loopActive);await p.waitForTimeout(400);
 assert((await sample())<0.00001,'LOOP mute did not silence saved phrase');
 await p.click('[data-loop="keys"]');await wait(()=>e.state.tracks.keys.loopActive);
 await p.click('#stop');await p.waitForTimeout(40);assert((await sample())<0.00001);
 await p.click('#play');await wait(()=>e.state.step>=2);assert.deepEqual(await p.evaluate(()=>e.state.tracks.keys.clip),saved);
 assert((await sample())>0.0001,'Restart lost saved loop');
 await p.click('#stop');
 // Worst case: all four live channels plus four loops, different phases and maximum volume.
 await p.evaluate(()=>{for(const id of Object.keys(e.state.tracks)){const t=e.state.tracks[id];t.clip=e.state.tracks.keys.clip.map(event=>({...event,notes:id==='keys'?event.notes:[id==='bass'?36:id==='synth'?75:67]}));t.loopDesired=true;if(!t.desired)e.toggle(id);}e.setMotion(100);e.setVolume(100);});
 await p.click('#play');await wait(()=>e.state.step>=1);let peak=0;for(let i=0;i<40;i++){peak=Math.max(peak,await sample());await p.waitForTimeout(50);}assert(peak<0.95,`Eight-channel clipping: ${peak}`);
 await p.click('#stop');
 await p.locator('#motion').focus();await p.keyboard.press('ArrowLeft');assert.equal(await p.evaluate(()=>e.state.motion),99);
 await p.locator('#motion').evaluate(el=>{el.value=50;el.dispatchEvent(new Event('input',{bubbles:true}));});
 const dial=p.locator('#motion-dial');const r=await dial.boundingBox();await p.mouse.move(r.x+20,r.y+20);await p.mouse.down();await p.mouse.move(r.x+20,r.y-10);await p.mouse.up();assert.equal(await p.evaluate(()=>e.state.motion),80);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({fourBarRecordingMs:elapsed,recordedNotes:saved.length,independentLiveLoop:true,stopRestart:true,eightChannelPeak:peak,keyboardAndDial:true,browserErrors:errors}));
}finally{await b.close();}
