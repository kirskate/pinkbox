import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1502, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.text().includes("Max polyphony"))
    errors.push(m.text());
});
const wait = (fn) => page.waitForFunction(fn, null, { timeout: 18000 });
const evalEngine = (fn) => page.evaluate(fn);
const sample = () =>
  page.evaluate(() => {
    const data = new Float32Array(__probe.fftSize);
    __probe.getFloatTimeDomainData(data);
    return Math.max(...data.map(Math.abs));
  });
const setRange = (id, value) =>
  page.locator(`#${id}`).evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(value));
const results = [];
const pass = (name, data = true) => {
  results.push({ name, data });
  console.log("PASS", name, JSON.stringify(data));
};
try {
  assert.equal(
    (
      await page.goto(process.env.PINKBOX_URL || "http://localhost:3000")
    ).status(),
    200,
  );
  await page.waitForSelector("[data-key=KeyA]");
  await page.evaluate(async () => {
    globalThis.__engine = (await import("/src/main.js")).engine;
  });
  assert.equal(await evalEngine(() => __engine.state.status), "stopped");
  await page.keyboard.down("a");
  await wait(
    () =>
      __engine.state.status === "running" &&
      __engine.state.live.notes.length > 0,
  );
  await page.evaluate(() => {
    globalThis.__probe = __engine.context.rawContext.createAnalyser();
    __probe.fftSize = 1024;
    __engine.master.connect(__probe);
  });
  assert.deepEqual(
    await evalEngine(() => __engine.state.live.notes),
    [60, 63, 67],
  );
  await wait(() => {
    const d = new Float32Array(__probe.fftSize);
    __probe.getFloatTimeDomainData(d);
    return Math.max(...d.map(Math.abs)) > 0.0001;
  });
  assert((await sample()) > 0.0001);
  pass("keyboard gesture starts audio and held chord");
  await page.selectOption("#key", "2");
  await wait(() => __engine.state.live.notes[0] === 62);
  assert.deepEqual(
    await evalEngine(() => __engine.state.live.notes),
    [62, 65, 69],
  );
  await page.selectOption("#key", "0");
  await wait(() => __engine.state.live.notes[0] === 60);
  await page.click("#record");
  await wait(() => __engine.state.rec?.phase === "recording");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
    "Recording overflows 1502px viewport",
  );
  const start = Date.now();
  await wait(() => Boolean(__engine.state.slots[0]));
  const elapsed = Date.now() - start;
  assert(elapsed > 7400 && elapsed < 9000);
  assert((await evalEngine(() => __engine.state.live.notes.length)) > 0);
  const first = await evalEngine(() =>
    structuredClone(__engine.state.slots[0]),
  );
  assert.equal(first.events[0].duration, 3072);
  await page.keyboard.up("a");
  await wait(() => __engine.state.live.notes.length === 0);
  await page.waitForTimeout(180);
  assert((await sample()) > 0.0001, "Saved loop stopped on key release");
  pass(
    "four bars, held note captured, live survives REC, loop survives release",
    { ms: elapsed },
  );
  await page.selectOption("#key", "2");
  await setRange("timbre", 5);
  assert.deepEqual(
    await evalEngine(() => __engine.state.slots[0].events),
    first.events,
  );
  assert.deepEqual(
    await evalEngine(() => __engine.state.slots[0].settings),
    first.settings,
  );
  await page.keyboard.down("s");
  await wait(() => __engine.state.live.notes.length > 0);
  await setRange("arp", 3);
  await wait(() => __engine.state.live.notes.length === 1);
  await page.click("#arp-options summary");
  await page.click('[data-direction="updown"]');
  await page.click("#arp-options summary");
  assert.equal(await evalEngine(() => __engine.state.direction), "updown");
  await page.locator("#bpm").fill("160");
  await page.locator("#bpm").press("Tab");
  await wait(() => __engine.state.bpm === 160);
  await page.click("#record");
  await wait(() => Boolean(__engine.state.slots[1]));
  await page.keyboard.up("s");
  assert(
    (await evalEngine(() => __engine.state.slots[1].events)).every(
      (e) => e.notes.length === 1,
    ),
  );
  pass("ARP replaces chord and second REC adds independent fixed-timbre loop");
  await page.click("[data-mode=bass]");
  await page.keyboard.down("d");
  await wait(
    () =>
      __engine.state.live.notes.length === 1 &&
      __engine.state.live.notes[0] < 60,
  );
  await page.click("#record");
  await wait(() => Boolean(__engine.state.slots[2]));
  await page.keyboard.up("d");
  assert.equal(
    await evalEngine(() => __engine.state.slots[2].settings.timbre),
    "bass",
  );
  pass("linked bass is sole live voice and records independently");
  const pad = page.locator('[data-pad="4"]');
  const r = await pad.boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await wait(
    () =>
      __engine.state.bassMode === "manual" &&
      __engine.state.live.notes.length === 1,
  );
  await page.mouse.up();
  await wait(() => __engine.state.live.notes.length === 0);
  await page.click("[data-mode=keys]");
  await setRange("arp", 0);
  await setRange("richness", 2);
  await page.keyboard.down("w");
  await wait(() => __engine.state.live.notes.length === 3);
  await page.keyboard.up("w");
  await page.keyboard.down("f");
  await wait(() => __engine.state.live.notes.length === 5);
  await page.click("#record");
  await wait(() => Boolean(__engine.state.slots[3]));
  await page.keyboard.up("f");
  assert(await page.locator("#record").isDisabled());
  assert.equal(await page.locator("#slot-count").textContent(), "4 / 4");
  pass(
    "four genuine recordings, richness, black chords, manual pads, REC capacity guard",
  );
  await page.locator('[data-volume="0"]').evaluate((input) => {
    input.value = 25;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await evalEngine(() => __engine.state.slots[0].volume), 25);
  await page.click('[data-loop="1"]');
  await wait(() => !__engine.state.slots[1].active);
  assert.deepEqual(
    await evalEngine(() => __engine.state.slots[0].events),
    first.events,
  );
  await page.click('[data-delete="3"]');
  assert.equal(await evalEngine(() => __engine.state.slots[3]), null);
  assert(!(await page.locator("#record").isDisabled()));
  pass("individual mute, volume, deletion and reusable slot");
  await page.keyboard.down("a");
  await page.click("#record");
  await wait(() => Boolean(__engine.state.slots[3]));
  await setRange("volume", 100);
  let peak = 0;
  for (let i = 0; i < 12; i++) {
    peak = Math.max(peak, await sample());
    await page.waitForTimeout(80);
  }
  assert(peak > 0.0001 && peak < 0.95);
  assert.equal(await evalEngine(() => __engine.diagnostics().instruments), 5);
  pass("four loops plus live, bounded audio graph and headroom", { peak });
  await page.keyboard.up("a");
  await page.click("#stop");
  await page.waitForTimeout(40);
  assert((await sample()) < 0.00001);
  await page.waitForTimeout(240);
  assert.equal(await evalEngine(() => __engine.diagnostics().sessions), 0);
  await page.click("#play");
  await wait(() => __engine.state.step > 1);
  assert((await sample()) > 0.0001);
  await page.click("#stop");
  for (let i = 0; i < 15; i++)
    await evalEngine(async () => {
      await __engine.play();
      __engine.stop();
    });
  await page.waitForTimeout(250);
  const diag = await evalEngine(() => __engine.diagnostics());
  assert.equal(diag.createdSessions, diag.disposedSessions);
  assert.equal(diag.listeners, 1);
  pass("immediate STOP, preserved loops, restart, repeated session disposal");
  await page.click("#play");
  await page.keyboard.down("a");
  await wait(() => __engine.state.live.notes.length > 0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await wait(() => __engine.state.live.notes.length === 0);
  await page.keyboard.up("a");
  await page.click('[data-delete="3"]');
  await page.click("#record");
  await wait(() => Boolean(__engine.state.rec));
  await page.click("#stop");
  assert.equal(await evalEngine(() => __engine.state.rec), null);
  await page.click("#reset");
  assert.equal(
    await evalEngine(() => __engine.state.slots.filter(Boolean).length),
    0,
  );
  assert.equal(await evalEngine(() => __engine.state.status), "stopped");
  pass("lost focus releases keys, STOP cancels REC, RESET clears four slots");
  const geometries = [];
  for (const [width, height] of [
    [1502, 640],
    [1502, 700],
    [1280, 640],
    [1512, 850],
    [1280, 720],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    assert(geometry.width <= width, `Horizontal overflow: ${width}`);
    if (width >= 1024)
      assert(
        geometry.height <= height,
        `Vertical overflow: ${width}x${height}: ${geometry.height}`,
      );
    geometries.push({ width, height, ...geometry });
  }
  pass("desktop viewport and mobile width", geometries);
  await page.setViewportSize({ width: 1512, height: 850 });
  await mkdir("/tmp/pinkbox-validation", { recursive: true });
  await page.screenshot({ path: "/tmp/pinkbox-validation/desktop.png" });
  assert.deepEqual(errors, []);
  await Bun.write(
    "/tmp/pinkbox-validation/results.json",
    JSON.stringify({ browser: browser.version(), results, errors }, null, 2),
  );
  pass("no browser errors");
} finally {
  await browser.close();
}
