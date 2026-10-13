import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
const seconds = Number(process.env.STRESS_SECONDS) || 60;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.PINKBOX_URL || "http://localhost:3000");
  await page.waitForSelector("#play");
  await page.evaluate(async () => {
    globalThis.e = (await import("/src/main.js")).engine;
    e.setBpm(160);
    e.edit("setRichness", 2);
  });
  await page.keyboard.down("a");
  await page.waitForFunction(() => e.state.status === "running");
  // Five real four-bar recordings, no fabricated loop fixtures.
  for (let i = 0; i < 5; i++) {
    await page.click("#record");
    await page.waitForFunction((i) => Boolean(e.state.slots[i]), i, {
      timeout: 12000,
    });
  }
  await page.evaluate(() => {
    globalThis.probe = e.context.rawContext.createAnalyser();
    probe.fftSize = 1024;
    e.master.connect(probe);
    e.setVolume(100);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const metric = async () =>
    (await cdp.send("Performance.getMetrics")).metrics.find(
      (m) => m.name === "JSHeapUsedSize",
    ).value;
  const baseline = await metric();
  let peak = 0,
    samples = 0,
    lastStep = -1,
    edits = -1;
  const began = Date.now();
  while (Date.now() - began < seconds * 1000) {
    const result = await page.evaluate(() => {
      const data = new Float32Array(probe.fftSize);
      probe.getFloatTimeDomainData(data);
      return { peak: Math.max(...data.map(Math.abs)), diag: e.diagnostics() };
    });
    assert.equal(result.diag.snapshot.status, "running");
    assert.equal(result.diag.sessions, 1);
    assert.equal(result.diag.instruments, 6);
    assert.equal(result.diag.scheduleCount, 1);
    assert.equal(result.diag.listeners, 1);
    assert(result.peak < 0.95);
    peak = Math.max(peak, result.peak);
    samples++;
    for (const frame of result.diag.history) {
      if (frame.step <= lastStep) continue;
      if (lastStep >= 0) assert.equal(frame.step, lastStep + 1);
      lastStep = frame.step;
    }
    const edit = Math.floor((Date.now() - began) / 5000);
    if (edit !== edits) {
      edits = edit;
      await page.evaluate((edit) => {
        e.edit("setKey", edit % 12);
        e.edit("setArp", edit % 4);
        e.edit("setTimbre", edit % 3);
        e.setFilter(30 + (edit % 7) * 10);
        e.setSlotVolume(edit % 5, 30 + (edit % 7) * 10);
        e.setBpm([60, 120, 160][edit % 3]);
      }, edit);
    }
    await page.waitForTimeout(100);
  }
  await cdp.send("HeapProfiler.collectGarbage");
  const retained = (await metric()) - baseline;
  assert(retained < 20 * 1024 * 1024);
  assert(peak > 0.001);
  await page.keyboard.up("a");
  await page.click("#stop");
  await page.waitForTimeout(250);
  const diag = await page.evaluate(() => e.diagnostics());
  assert.equal(diag.sessions, 0);
  assert.equal(diag.createdSessions, diag.disposedSessions);
  assert.deepEqual(errors, []);
  await mkdir("/tmp/pinkbox-validation", { recursive: true });
  const report = {
    seconds,
    samples,
    peak,
    retainedHeapBytes: retained,
    lastStep,
    loops: 5,
    channels: 6,
    errors,
  };
  await Bun.write(
    "/tmp/pinkbox-validation/stress.json",
    JSON.stringify(report, null, 2),
  );
  console.log("STRESS PASS", JSON.stringify(report));
} finally {
  await browser.close();
}
