import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const combinations = [
  ["keys"],
  ["synth"],
  ["bass"],
  ["arp"],
  ["keys", "synth"],
  ["keys", "bass"],
  ["keys", "arp"],
  ["synth", "bass"],
  ["synth", "arp"],
  ["bass", "arp"],
  ["keys", "synth", "bass", "arp"],
];
const results = [];
try {
  await page.goto(process.env.PINKBOX_URL || "http://localhost:3000");
  await page.waitForSelector("#play");
  await page.evaluate(async () => {
    globalThis.__engine = (await import("/src/main.js")).engine;
    globalThis.__engine.setBpm(160);
    globalThis.__engine.setVolume(100);
  });
  for (const roles of combinations) {
    await page.evaluate((roles) => {
      const engine = globalThis.__engine;
      for (const [id, track] of Object.entries(engine.state.tracks))
        if (track.desired !== roles.includes(id)) engine.toggle(id);
    }, roles);
    await page.click("#play");
    await page.waitForFunction(
      () => globalThis.__engine.state.status === "running",
    );
    await page.evaluate(() => {
      if (!globalThis.__analyser) {
        const e = globalThis.__engine,
          c = e.context.rawContext;
        const analyser = c.createAnalyser();
        analyser.fftSize = 1024;
        const silent = c.createGain();
        silent.gain.value = 0;
        e.master.connect(analyser);
        analyser.connect(silent);
        silent.connect(c.destination);
        globalThis.__analyser = analyser;
      }
    });
    let peak = 0,
      rms = 0;
    const start = Date.now();
    while (Date.now() - start < 6100) {
      const sample = await page.evaluate(() => {
        const buffer = new Float32Array(__analyser.fftSize);
        __analyser.getFloatTimeDomainData(buffer);
        return {
          peak: Math.max(...buffer.map(Math.abs)),
          rms: Math.sqrt(buffer.reduce((s, x) => s + x * x, 0) / buffer.length),
          status: __engine.state.status,
        };
      });
      assert.equal(sample.status, "running");
      peak = Math.max(peak, sample.peak);
      rms = Math.max(rms, sample.rms);
      await page.waitForTimeout(80);
    }
    assert(rms > 0.0001);
    assert(peak < 0.95);
    results.push({ roles, peak, rms });
    console.log("AUDIO MATRIX PASS", JSON.stringify(results.at(-1)));
    await page.click("#stop");
    await page.waitForTimeout(220);
  }
  // Negative initialization and start/STOP race using the same public controller.
  await page.evaluate(async () => {
    const e = globalThis.__engine,
      original = e.createSession;
    e.createSession = () => {
      throw new Error("injected initialization failure");
    };
    await e.play();
    e.createSession = original;
  });
  assert.equal(await page.evaluate(() => __engine.state.status), "error");
  assert.equal(await page.evaluate(() => __engine.diagnostics().sessions), 0);
  await page.evaluate(async () => {
    const e = globalThis.__engine;
    const starting = e.play();
    e.stop();
    await starting;
  });
  assert.equal(await page.evaluate(() => __engine.state.status), "stopped");
  assert.equal(await page.evaluate(() => __engine.diagnostics().sessions), 0);
  await page.click("#play");
  await page.waitForFunction(() => __engine.state.status === "running");
  // Test background policy by dispatching the browser lifecycle event.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  assert.equal(await page.evaluate(() => __engine.state.status), "error");
  assert.equal(await page.evaluate(() => __engine.state.rec), null);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => __engine.diagnostics().sessions), 0);
  assert.deepEqual(errors, []);
  await Bun.write(
    "/tmp/pinkbox-validation/audio-matrix.json",
    JSON.stringify(
      {
        browser: browser.version(),
        results,
        initializationFailure: "passed",
        staleStart: "passed",
        backgroundLifecycle: "simulated event, passed",
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
