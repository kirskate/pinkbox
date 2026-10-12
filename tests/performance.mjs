// Test artifact only: PCM capture demonstrates the performance, not the app's REC format.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 850 } });
const actions = [];
async function atStep(step) {
  await page.waitForFunction((step) => __engine.state.step >= step, step, {
    timeout: 45000,
  });
}
async function action(name, callback) {
  await page.evaluate(callback);
  actions.push({ name, step: await page.evaluate(() => __engine.state.step) });
  console.log("PERFORMANCE", name, actions.at(-1).step);
}
try {
  await page.goto(process.env.PINKBOX_URL || "http://localhost:3000");
  await page.waitForSelector("#play");
  await page.evaluate(async () => {
    globalThis.__engine = (await import("/src/main.js")).engine;
  });
  await page.click("#play");
  await page.waitForFunction(() => __engine.master !== null);
  await page.click("#stop");
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    const context = __engine.context.rawContext;
    const code = `class Capture extends AudioWorkletProcessor {
      constructor(){super();this.remaining=44*sampleRate;this.buffer=[];this.count=0;}
      process(inputs){const input=inputs[0]?.[0];if(this.remaining<=0)return false;const data=input||new Float32Array(128);const length=Math.min(data.length,this.remaining);const copy=new Float32Array(length);copy.set(data.subarray(0,length));this.buffer.push(copy);this.count+=length;this.remaining-=length;
        if(this.count>=8192||this.remaining===0){const chunk=new Float32Array(this.count);let offset=0;for(const block of this.buffer){chunk.set(block,offset);offset+=block.length;}this.port.postMessage({chunk,done:this.remaining===0},[chunk.buffer]);this.buffer=[];this.count=0;}return this.remaining>0;}
    } registerProcessor('capture-performance',Capture);`;
    const url = URL.createObjectURL(
      new Blob([code], { type: "text/javascript" }),
    );
    await __engine.context.addAudioWorkletModule(url);
    URL.revokeObjectURL(url);
    const capture = __engine.context.createAudioWorkletNode(
      "capture-performance",
    );
    const silent = context.createGain();
    silent.gain.value = 0;
    __engine.master.connect(capture);
    capture.connect(silent);
    silent.connect(context.destination);
    globalThis.__captured = {
      chunks: [],
      done: false,
      sampleRate: context.sampleRate,
      capture,
      silent,
    };
    capture.port.onmessage = ({ data }) => {
      __captured.chunks.push(data.chunk);
      __captured.done = data.done;
    };
  });
  await page.click("#play");
  await atStep(2);
  await action("begin: record keys", () => __engine.record());
  await page.waitForFunction(
    () => Boolean(__engine.state.tracks.keys.clip),
    null,
    { timeout: 16000 },
  );
  const original = await page.evaluate(() =>
    structuredClone(__engine.state.tracks.keys.clip),
  );
  await action("development: add bass", () => __engine.toggle("bass"));
  await atStep(112);
  await action("shape bass / add arp", () => {
    __engine.select("bass");
    __engine.setFilter(35);
    __engine.toggle("arp");
  });
  await atStep(144);
  await action("add synth", () => __engine.toggle("synth"));
  await atStep(176);
  await action("climax: open bass, darken saved keys", () => {
    __engine.setFilter(100);
    __engine.select("keys");
    __engine.setFilter(40);
  });
  await atStep(192);
  await action("tempo movement", () => __engine.setBpm(132));
  await atStep(240);
  await action("ending: remove synth", () => __engine.toggle("synth"));
  await atStep(272);
  await action("remove arp", () => __engine.toggle("arp"));
  await atStep(304);
  await action("remove bass / open keys", () => {
    __engine.toggle("bass");
    __engine.setFilter(100);
  });
  await atStep(328);
  await action("finish: STOP", () => __engine.stop());
  assert.deepEqual(
    await page.evaluate(() => __engine.state.tracks.keys.clip),
    original,
  );
  await page.waitForFunction(() => __captured.done, null, { timeout: 12000 });
  const captured = await page.evaluate(() => ({
    sampleRate: __captured.sampleRate,
    chunks: __captured.chunks.map((chunk) => Array.from(chunk)),
  }));
  const samples = Float32Array.from(captured.chunks.flat());
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  assert(peak > 0.001 && peak < 0.95);
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(captured.sampleRate, 24);
  buffer.writeUInt32LE(captured.sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    buffer.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767),
      44 + i * 2,
    );
  await Bun.write("/tmp/pinkbox-validation/performance.wav", buffer);
  await Bun.write(
    "/tmp/pinkbox-validation/performance.json",
    JSON.stringify(
      {
        actions,
        seconds: samples.length / captured.sampleRate,
        sampleRate: captured.sampleRate,
        peak,
        clipPreserved: true,
        authorListening: "pending",
      },
      null,
      2,
    ),
  );
  console.log(
    "PERFORMANCE PASS",
    JSON.stringify({
      seconds: samples.length / captured.sampleRate,
      peak,
      actions: actions.length,
      clipPreserved: true,
    }),
  );
} finally {
  await browser.close();
}
