import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
const url = process.env.PINKBOX_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--autoplay-policy=user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 850 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const results = [];
const check = (name, detail) => {
  results.push({ name, detail });
  console.log(`PASS ${name}: ${JSON.stringify(detail)}`);
};
const evaluate = (callback, argument) =>
  page.evaluate(
    async ({ source, argument }) => {
      const { engine } = await import("/src/main.js");
      return (0, eval)(`(${source})`)(engine, argument);
    },
    { source: callback.toString(), argument },
  );
const wait = async (callback, argument = null, timeout = 22000) => {
  await page.waitForFunction(
    ({ source, argument }) => {
      return (0, eval)(`(${source})`)(globalThis.__testEngine, argument);
    },
    { source: callback.toString(), argument },
    { timeout },
  );
};
const sample = () =>
  page.evaluate(() => {
    const data = new Float32Array(globalThis.__probe.analyser.fftSize);
    globalThis.__probe.analyser.getFloatTimeDomainData(data);
    return {
      peak: Math.max(...data.map(Math.abs)),
      rms: Math.sqrt(
        data.reduce((sum, value) => sum + value * value, 0) / data.length,
      ),
    };
  });
try {
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.waitForSelector("#play");
  await evaluate((engine) => {
    globalThis.__testEngine = engine;
  });
  let diag = await evaluate((engine) => engine.diagnostics());
  assert.equal(diag.sessions, 0);
  assert.equal(diag.scheduleCount, 0);
  assert.equal(diag.snapshot.status, "stopped");
  check("no autoplay / one ready layer", diag.snapshot.tracks);
  await page.click("#play");
  await wait((engine) => engine.state.status === "running");
  await evaluate((engine) => {
    const context = engine.context.rawContext;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const silent = context.createGain();
    silent.gain.value = 0;
    engine.master.connect(analyser);
    analyser.connect(silent);
    silent.connect(context.destination);
    globalThis.__probe = { analyser, silent };
  });
  await page.waitForTimeout(200);
  let signal = await sample();
  assert(signal.rms > 0.0001);
  assert(signal.peak < 0.95);
  check("actual Web Audio signal", signal);
  await page.click("#record");
  await wait((engine) => engine.state.rec?.phase === "recording");
  await evaluate((engine) => engine.setBpm(160));
  await page.click('[data-select="bass"]');
  assert.equal(await evaluate((engine) => engine.state.rec.target), "keys");
  await page.click('[data-toggle="bass"]');
  await page.click('[data-toggle="arp"]');
  await page.click('[data-toggle="synth"]');
  await wait(
    (engine) => Boolean(engine.state.tracks.keys.clip) && !engine.state.rec,
  );
  const clip = await evaluate((engine) =>
    structuredClone(engine.state.tracks.keys.clip),
  );
  assert(clip.length > 0);
  assert(clip.every((event) => event.tick + event.duration <= 3072));
  check("REC 4 bars with tempo change and fixed target", {
    events: clip.length,
    bpm: await evaluate((engine) => engine.state.bpm),
  });
  await wait((engine) =>
    Object.values(engine.state.tracks).every((track) => track.active),
  );
  const baselineStep = await evaluate((engine) => engine.state.step);
  await wait(
    (engine, minimum) => engine.state.step >= minimum,
    baselineStep + 128,
  );
  assert.deepEqual(
    await evaluate((engine) => engine.state.tracks.keys.clip),
    clip,
  );
  diag = await evaluate((engine) => engine.diagnostics());
  for (let i = 1; i < diag.history.length; i++) {
    const previous = diag.history[i - 1],
      current = diag.history[i];
    assert.equal(current.step, previous.step + 1);
    assert(Math.abs(current.ticks - current.step * 48) < 0.0001);
    assert(
      Math.abs(current.time - previous.time - 60 / previous.bpm / 4) < 0.003,
    );
  }
  signal = { peak: 0, rms: 0 };
  for (let i = 0; i < 10; i++) {
    const reading = await sample();
    signal.peak = Math.max(signal.peak, reading.peak);
    signal.rms = Math.max(signal.rms, reading.rms);
    await page.waitForTimeout(50);
  }
  assert(signal.rms > 0.0001, "Four-role signal remained silent for 500ms");
  assert(signal.peak < 0.95, "Four-role signal clipped");
  check("two saved loops / four-role timing / headroom", {
    frames: diag.history.length,
    voices: diag.voices,
    signal,
  });
  await page.locator("#filter").evaluate((input) => {
    input.value = "12";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await evaluate((engine) => engine.state.tracks.bass.filter), 12);
  assert.equal(
    await evaluate((engine) => engine.state.tracks.keys.filter),
    100,
  );
  assert.deepEqual(
    await evaluate((engine) => engine.state.tracks.keys.clip),
    clip,
  );
  await evaluate((engine) => engine.setVolume(0));
  await page.waitForTimeout(100);
  signal = await sample();
  assert(signal.peak < 0.00001);
  assert.equal(await evaluate((engine) => engine.state.status), "running");
  await evaluate((engine) => engine.setVolume(80));
  await page.waitForTimeout(150);
  check("independent FILTER / VOL 0 retains clock and clip", signal);
  await page.click('[data-select="keys"]');
  await page.click("#record");
  await wait((engine) => engine.state.rec?.phase === "recording");
  await page.click("#stop");
  await page.waitForTimeout(35);
  signal = await sample();
  assert(signal.peak < 0.00001);
  assert.deepEqual(
    await evaluate((engine) => engine.state.tracks.keys.clip),
    clip,
  );
  await page.waitForTimeout(250);
  diag = await evaluate((engine) => engine.diagnostics());
  assert.equal(diag.sessions, 0);
  assert.equal(diag.scheduleCount, 0);
  assert.equal(diag.snapshot.rec, null);
  check("STOP signal silent at 35 ms / cancel replacement / dispose", {
    signal,
    created: diag.createdSessions,
    disposed: diag.disposedSessions,
  });
  for (let i = 0; i < 35; i++) {
    await evaluate(async (engine) => {
      await engine.play();
      engine.stop();
    });
  }
  await page.waitForTimeout(350);
  diag = await evaluate((engine) => engine.diagnostics());
  assert.equal(diag.sessions, 0);
  assert.equal(diag.createdSessions, diag.disposedSessions);
  assert.equal(diag.listeners, 1);
  check("35 rapid START / STOP / no resource growth", {
    created: diag.createdSessions,
    disposed: diag.disposedSessions,
    listeners: diag.listeners,
  });
  await page.click("#play");
  await wait((engine) => engine.state.step >= 2);
  const restart = await evaluate((engine) => engine.diagnostics());
  assert(restart.history.some((frame) => frame.step === 0));
  assert.deepEqual(
    await evaluate((engine) => engine.state.tracks.keys.clip),
    clip,
  );
  // Suspending the real context must stop safely; another gesture resumes it.
  await evaluate((engine) => engine.context.rawContext.suspend());
  await wait((engine) => engine.state.status === "error");
  await page.click("#play");
  await wait((engine) => engine.state.status === "running");
  await page.click("#stop");
  check(
    "context interruption / gesture retry / saved phrase retained",
    await evaluate((engine) => engine.state.status),
  );
  await page.click("#play");
  await wait((engine) => engine.state.step >= 1);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await page.waitForTimeout(250);
  assert.equal(await evaluate((engine) => engine.diagnostics().listeners), 1);
  await page.click("#play");
  await page.waitForFunction(() =>
    document.querySelector("#play").textContent.includes("PLAYING"),
  );
  assert.deepEqual(
    await evaluate((engine) => engine.state.tracks.keys.clip),
    clip,
  );
  await page.click("#stop");
  check("cached page lifecycle keeps UI and saved phrases", true);
  // Keyboard activation and range adjustment without mouse.
  await page.locator('[data-select="arp"]').focus();
  await page.keyboard.press("Enter");
  assert.equal(await evaluate((engine) => engine.state.selected), "arp");
  await page.locator("#filter").focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await evaluate((engine) => engine.state.tracks.arp.filter), 99);
  check(
    "keyboard buttons and ranges",
    await page.evaluate(() => document.activeElement.id),
  );
  const geometries = [];
  for (const [width, height] of [
    [1512, 850],
    [1280, 720],
    [1024, 768],
    [800, 700],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => {
      const rect = document.querySelector(".machine").getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bottom: rect.bottom,
        controls: [...document.querySelectorAll("button,input")].map(
          (element) => ({
            label: element.getAttribute("aria-label") || element.textContent,
            id: element.id,
            rect: element.getBoundingClientRect().toJSON(),
          }),
        ),
      };
    });
    assert(geometry.documentWidth <= width);
    if (width >= 1024)
      assert(
        geometry.documentHeight <= height,
        `Vertical overflow ${width}x${height}: ${geometry.documentHeight}`,
      );
    geometries.push({ width, height, documentHeight: geometry.documentHeight });
  }
  await page.setViewportSize({ width: 1512, height: 850 });
  await mkdir("/tmp/pinkbox-validation", { recursive: true });
  await page.screenshot({ path: "/tmp/pinkbox-validation/desktop.png" });
  check("responsive geometry", geometries);
  assert.deepEqual(errors, []);
  check("no browser errors", errors);
  await Bun.write(
    "/tmp/pinkbox-validation/results.json",
    JSON.stringify({ browser: browser.version(), results }, null, 2),
  );
} finally {
  await browser.close();
}
