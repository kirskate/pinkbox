import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  await page.goto(process.env.PINKBOX_URL || "http://localhost:3000");
  await page.waitForSelector("#play");
  const results = await page.evaluate(() => {
    function rgb(value) {
      return value.match(/[\d.]+/g).map(Number);
    }
    function blend(foreground, background) {
      const alpha = foreground[3] ?? 1;
      return foreground
        .slice(0, 3)
        .map((value, i) => value * alpha + background[i] * (1 - alpha));
    }
    function background(element) {
      if (!element) return [255, 255, 255];
      const color = rgb(getComputedStyle(element).backgroundColor);
      return blend(color, background(element.parentElement));
    }
    function luminance(color) {
      return color
        .map((value) => {
          value /= 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
          0,
        );
    }
    const entries = [];
    for (const element of document.querySelectorAll(
      "button,input,span,h1,output",
    )) {
      if (
        element.closest("button:disabled") ||
        element.hidden ||
        getComputedStyle(element).visibility === "hidden"
      )
        continue;
      const ownText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
      if (!ownText && element.tagName !== "INPUT") continue;
      const foreground = blend(
        rgb(getComputedStyle(element).color),
        background(element),
      );
      const l1 = luminance(foreground),
        l2 = luminance(background(element));
      entries.push({
        text:
          element.getAttribute("aria-label") ||
          element.textContent.trim().slice(0, 40),
        ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
      });
    }
    return entries;
  });
  for (const item of results)
    assert(item.ratio >= 4.5, `Contrast ${item.text}: ${item.ratio}`);
  await page.click("#play");
  await page.waitForFunction(() =>
    document.querySelector("#play").disabled,
  );
  await page.locator("#bpm").focus();
  await page.locator("#bpm").fill("100");
  await page.waitForTimeout(600);
  assert.equal(
    await page.locator("#bpm").inputValue(),
    "100",
    "Playback redraw reset a draft value",
  );
  await page.locator("#filter").focus();
  const tempo = await page.evaluate(async () => {
    const { engine } = await import("/src/main.js");
    return engine.state.pendingBpm?.value ?? engine.state.bpm;
  });
  assert.equal(tempo, 100);
  const focusStyle = await page
    .locator("#filter")
    .evaluate((input) => ({
      width: getComputedStyle(input).outlineWidth,
      style: getComputedStyle(input).outlineStyle,
    }));
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const keyboardFocus = await page
    .locator("#filter")
    .evaluate((input) => ({
      width: getComputedStyle(input).outlineWidth,
      style: getComputedStyle(input).outlineStyle,
    }));
  assert.notEqual(keyboardFocus.style, "none");
  assert(parseFloat(keyboardFocus.width) >= 2);
  await page.click("#stop");
  await Bun.write(
    "/tmp/pinkbox-validation/accessibility.json",
    JSON.stringify(
      {
        contrast: results,
        minContrast: Math.min(...results.map((x) => x.ratio)),
        draftTempo: "passed",
        keyboardFocus,
      },
      null,
      2,
    ),
  );
  console.log(
    "ACCESSIBILITY PASS",
    JSON.stringify({
      minContrast: Math.min(...results.map((x) => x.ratio)),
      controls: results.length,
      keyboardFocus,
    }),
  );
} finally {
  await browser.close();
}
