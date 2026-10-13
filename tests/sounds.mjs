import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await b.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const wait = (fn) => page.waitForFunction(fn, null, { timeout: 6000 });
const rms = async () => {
  let total = 0,
    peak = 0;
  for (let i = 0; i < 10; i++) {
    const sample = await page.evaluate(() => {
      const a = new Float32Array(probe.fftSize);
      probe.getFloatTimeDomainData(a);
      return {
        rms: Math.sqrt(a.reduce((s, n) => s + n * n, 0) / a.length),
        peak: Math.max(...a.map(Math.abs)),
      };
    });
    total += sample.rms;
    peak = Math.max(peak, sample.peak);
    await page.waitForTimeout(25);
  }
  return { rms: total / 10, peak };
};
try {
  await page.goto(process.env.PINKBOX_URL || "http://localhost:3000");
  await page.waitForSelector("#play");
  await page.evaluate(async () => {
    globalThis.e = (await import("/src/main.js")).engine;
    e.setVolume(100);
    e.edit("setMode", "bass");
  });
  await page.keyboard.down("a");
  await wait(() => e.state.live.notes.length === 1);
  await page.evaluate(() => {
    globalThis.probe = e.context.rawContext.createAnalyser();
    probe.fftSize = 2048;
    e.master.connect(probe);
  });
  await page.waitForTimeout(400);
  const improved = await rms();
  await page.keyboard.up("a");
  await wait(() => e.state.live.notes.length === 0);
  // Render the previous bass preset through the same real instrument for a matched comparison.
  await page.evaluate(() =>
    e.session.channels.live.synth.set({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.008, decay: 0.12, sustain: 0.7, release: 0.08 },
      volume: -19,
    }),
  );
  await page.keyboard.down("a");
  await wait(() => e.state.live.notes.length === 1);
  await page.waitForTimeout(400);
  const previous = await rms();
  assert(
    improved.rms > previous.rms * 1.7,
    `Bass still too quiet: new=${improved.rms}, previous=${previous.rms}`,
  );
  await page.keyboard.up("a");
  await wait(() => e.state.live.notes.length === 0);
  await page.click("[data-mode=keys]");
  const tones = [];
  for (let tone = 0; tone < 6; tone++) {
    await page.locator("#timbre").evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, String(tone));
    assert.equal(await page.evaluate(() => e.state.timbre), tone);
    await page.keyboard.down("a");
    await wait(() => e.state.live.notes.length === 3);
    await page.waitForTimeout(450);
    const sound = await rms();
    assert(sound.rms > 0.0001);
    assert(sound.peak < 0.95);
    tones.push({
      name: await page.locator("#timbre-value").textContent(),
      ...sound,
    });
    await page.keyboard.up("a");
    await wait(() => e.state.live.notes.length === 0);
  }
  assert.equal(new Set(tones.map((t) => t.name)).size, 6);
  await page.click("[data-mode=bass]");
  await page.locator("#bpm").fill("160");
  await page.locator("#bpm").press("Tab");
  await page.keyboard.down("a");
  await wait(() => e.state.live.notes.length === 1 && e.state.bpm === 160);
  for (let i = 0; i < 4; i++) {
    await page.click("#record");
    await page.waitForFunction((i) => Boolean(e.state.slots[i]), i, {
      timeout: 12000,
    });
  }
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) e.setSlotVolume(i, 100);
  });
  await page.waitForTimeout(150);
  const bassStack = await rms();
  assert(bassStack.peak < 0.95);
  assert(bassStack.rms > 0.001);
  assert.deepEqual(errors, []);
  await page.click("#stop");
  console.log(
    "SOUNDS PASS",
    JSON.stringify({
      bass: { improved, previous, gainRatio: improved.rms / previous.rms },
      tones,
      bassStack,
      errors,
    }),
  );
} finally {
  await b.close();
}
