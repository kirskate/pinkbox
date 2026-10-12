import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const seconds = Number(process.env.STRESS_SECONDS || 300);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PINKBOX_URL || "http://localhost:3000");
  await page.waitForSelector("#play");
  await page.evaluate(async () => {
    globalThis.__engine = (await import("/src/main.js")).engine;
    for (const role of ["bass", "synth", "arp"]) __engine.toggle(role);
    __engine.setBpm(160);
  });
  await page.click("#play");
  await page.waitForFunction(
    () => globalThis.__engine.state.status === "running",
  );
  await page.evaluate(() => {
    const e = globalThis.__engine,
      c = e.context.rawContext;
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    const gain = c.createGain();
    gain.gain.value = 0;
    e.master.connect(analyser);
    analyser.connect(gain);
    gain.connect(c.destination);
    globalThis.__analyser = analyser;
    e.record();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const baselineMetrics = await cdp.send("Performance.getMetrics");
  const baselineHeap = baselineMetrics.metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  ).value;
  const start = Date.now(),
    metrics = [];
  let peak = 0,
    samples = 0,
    longestSilent = 0,
    silentSince = null,
    replacements = 0,
    lastStep = -1,
    lastTime = -1;
  while (Date.now() - start < seconds * 1000) {
    const sample = await page.evaluate(() => {
      const e = globalThis.__engine,
        data = new Float32Array(__analyser.fftSize);
      __analyser.getFloatTimeDomainData(data);
      const diagnostics = e.diagnostics();
      return {
        peak: Math.max(...data.map(Math.abs)),
        state: diagnostics.snapshot.status,
        step: diagnostics.snapshot.step,
        diagnostics,
      };
    });
    assert.equal(sample.state, "running");
    assert(sample.peak < 0.95, "Audio peak overload");
    peak = Math.max(peak, sample.peak);
    samples++;
    if (sample.peak < 0.00001) silentSince ??= Date.now();
    else {
      if (silentSince)
        longestSilent = Math.max(longestSilent, Date.now() - silentSince);
      silentSince = null;
    }
    for (const frame of sample.diagnostics.history) {
      if (frame.step <= lastStep) continue;
      if (lastStep >= 0)
        assert.equal(frame.step, lastStep + 1, "Missed sixteenth step");
      assert(Math.abs(frame.ticks - frame.step * 48) < 0.0001);
      assert(frame.time > lastTime);
      lastStep = frame.step;
      lastTime = frame.time;
    }
    const elapsed = Date.now() - start;
    if (Math.floor(elapsed / 20000) > replacements) {
      replacements++;
      await page.evaluate((count) => {
        const e = globalThis.__engine;
        e.setBpm([160, 120, 60][count % 3]);
        e.select(["keys", "bass", "synth", "arp"][count % 4]);
        e.setFilter(30 + (count % 7) * 10);
        if (!e.state.rec) e.record();
      }, replacements);
      const data = await cdp.send("Performance.getMetrics");
      const selected = Object.fromEntries(
        data.metrics
          .filter((m) =>
            [
              "JSHeapUsedSize",
              "Nodes",
              "Documents",
              "JSEventListeners",
              "TaskDuration",
              "ScriptDuration",
            ].includes(m.name),
          )
          .map((m) => [m.name, m.value]),
      );
      metrics.push({ seconds: Math.round(elapsed / 1000), ...selected });
      console.log(
        `STRESS ${Math.round(elapsed / 1000)}s: step=${sample.step} peak=${peak.toFixed(3)} sessions=${sample.diagnostics.sessions} heap=${(selected.JSHeapUsedSize / 1024 / 1024).toFixed(1)}MiB`,
      );
    }
    await page.waitForTimeout(100);
  }
  const final = await page.evaluate(() => __engine.diagnostics());
  assert.equal(final.sessions, 1);
  assert.equal(final.scheduleCount, 1);
  assert.equal(final.listeners, 1);
  assert(final.voices <= 7, "Unbounded scheduled voices");
  assert(longestSilent < 600, `Unexpected silent window: ${longestSilent}ms`);
  // Compare retained memory, not temporary allocation by the test's polling itself.
  await cdp.send("HeapProfiler.collectGarbage");
  const finalMetrics = await cdp.send("Performance.getMetrics");
  const finalHeap = finalMetrics.metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  ).value;
  assert(
    finalHeap - baselineHeap < 20 * 1024 * 1024,
    `Retained heap growth: ${finalHeap - baselineHeap}`,
  );
  await page.click("#stop");
  await page.waitForTimeout(250);
  const stopped = await page.evaluate(() => __engine.diagnostics());
  assert.equal(stopped.sessions, 0);
  assert.deepEqual(errors, []);
  const result = {
    seconds,
    samples,
    maxPeak: peak,
    longestObservedSilenceMs: longestSilent,
    finalStep: lastStep,
    replacements,
    clips: final.snapshot.tracks,
    metrics,
    collectedHeap: {
      baseline: baselineHeap,
      final: finalHeap,
      growth: finalHeap - baselineHeap,
    },
    stopped: {
      created: stopped.createdSessions,
      disposed: stopped.disposedSessions,
      sessions: stopped.sessions,
    },
    errors,
  };
  await Bun.write(
    "/tmp/pinkbox-validation/stress.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    "STRESS PASS",
    JSON.stringify({
      seconds,
      samples,
      peak,
      longestSilent,
      lastStep,
      replacements,
    }),
  );
} finally {
  await browser.close();
}
