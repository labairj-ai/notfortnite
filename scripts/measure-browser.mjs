import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl"],
});
const results = [];
try {
  for (const [label, port] of [
    ["baseline-b9277c7", 5174],
    ["candidate", 5175],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      Date.now = () => 42;
      Math.random = () => 0.5;
    });
    await page.goto(`http://127.0.0.1:${port}/notfortnite/`);
    await page.waitForFunction(
      () =>
        document.getElementById("play-solo-btn")?.onclick ||
        document.querySelector("#build-time")?.textContent,
    );
    const menuReadyMs = await page.evaluate(() => performance.now());
    // Wait for network completion, not an asserted device-performance threshold.
    await page.waitForLoadState("networkidle");
    const menuResources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((r) => r.name.endsWith(".glb"))
        .map((r) => ({
          name: r.name.split("/").pop(),
          transfer: r.transferSize,
          encoded: r.encodedBodySize,
          decodedTransfer: r.decodedBodySize,
        })),
    );
    await page.locator("#play-solo-btn").click();
    await page.waitForFunction(
      () => window.__gameTest?.getSession()?.me || window.__S?.me,
    );
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const samples = [];
          let last = performance.now();
          function step(t) {
            samples.push(t - last);
            last = t;
            if (samples.length < 180) requestAnimationFrame(step);
            else {
              samples.shift();
              samples.sort((a, b) => a - b);
              resolve({
                samples: samples.length,
                p50: samples[Math.floor(samples.length * 0.5)],
                p95: samples[Math.floor(samples.length * 0.95)],
              });
            }
          }
          requestAnimationFrame(step);
        }),
    );
    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((r) => r.name.endsWith(".glb"))
        .map((r) => ({
          name: r.name.split("/").pop(),
          transfer: r.transferSize,
          encoded: r.encodedBodySize,
        })),
    );
    const runtime = await page.evaluate(
      () => window.__performanceReport?.() || null,
    );
    if (label === "candidate") {
      await page.screenshot({ path: "docs/candidate-mobile.png" });
      await page.evaluate(() => window.__gameTest.endSession());
      await page.locator("#practice-btn").click();
      await page.screenshot({ path: "docs/candidate-practice.png" });
    }
    results.push({
      label,
      menuReadyMs,
      menuModelCount: menuResources.length,
      menuModelTransferBytes: menuResources.reduce((n, r) => n + r.transfer, 0),
      matchModelCount: resources.length,
      matchModelTransferBytes: resources.reduce((n, r) => n + r.transfer, 0),
      frames,
      runtime,
      errors,
    });
    await context.close();
  }
  fs.writeFileSync(
    "docs/browser-performance.json",
    JSON.stringify(
      {
        implementationSha: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        methodology:
          "Local cold Chromium headless SwiftShader, 844x390 touch emulation, DPR1, seed42. Baseline b9277c7 vs working candidate. 179 rAF intervals after start; no physical-device FPS acceptance. Asset decodedTransfer means HTTP decoded transfer, not decoded GPU memory. GPU stalls unavailable in this runner.",
        environment: {
          node: process.version,
          browser: browser.version(),
          platform: process.platform,
          arch: process.arch,
        },
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
