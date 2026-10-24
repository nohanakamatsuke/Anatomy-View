import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url))),
  types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".gz": "application/gzip",
  };
const server = http.createServer(async (req, res) => {
  try {
    const relative =
        new URL(req.url, "http://localhost").pathname.replace(
          /^\/Anatomy-View\//,
          "",
        ) || "index.html",
      file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw Error();
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port + "/Anatomy-View/";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ready = () =>
    page.waitForFunction(
      () =>
        !document.querySelector("#mode-anatomy").disabled &&
        document.querySelector("#loader").hidden,
    );
  const fits = async () =>
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
      "viewport must not scroll",
    );
  await page.goto(base);
  await ready();
  for (const selector of [
    "#inspector",
    "#acu-detail",
    "#view-options",
    "#advanced-tools",
  ])
    assert.equal(
      await page.locator(selector).isVisible(),
      false,
      selector + " starts hidden",
    );
  assert.equal(
    await page.locator("#inspector-empty, #acu-overview").count(),
    0,
  );
  await page.screenshot({ path: "/tmp/anatomy-v13-mobile-initial.png" });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await fits();
    for (const selector of [
      "#menu",
      "#view-toggle",
      "#reset-camera",
      "#mobile-layers button",
    ]) {
      const boxes = await page.locator(selector).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }),
      );
      assert.ok(
        boxes.every((r) => r.w >= 44 && r.h >= 44),
        selector + " touch target",
      );
    }
  }
  await page.locator("#view-toggle").tap();
  assert.equal(await page.locator("#view-options").isVisible(), true);
  await page.locator('[data-view="back"]').tap();
  await page.locator("#zoom-in").tap();
  await page.locator("#close-view").tap();
  await page.locator("#reset-camera").tap();
  await page.locator("#menu").tap();
  await page.locator("#search").fill("左大腿骨");
  await page.locator("#search-results .quick-item").first().tap();
  assert.equal(await page.locator("#inspector").isVisible(), true);
  assert.equal(await page.locator("#anatomy-details").isVisible(), false);
  const compact = await page.locator("#inspector").boundingBox();
  assert.ok(compact.height < 190, "compact anatomy sheet");
  await page.locator("#anatomy-expand").tap();
  assert.equal(await page.locator("#part-description").isVisible(), true);
  await page.waitForTimeout(1200);
  const anatomyPosition = await page.evaluate(() => ({
    y:
      parseFloat(document.querySelector("#selection-label").style.top) +
      15 +
      document.querySelector("#canvas-host").getBoundingClientRect().top,
    top: document.querySelector("#inspector").getBoundingClientRect().top,
  }));
  assert.ok(
    anatomyPosition.y <= anatomyPosition.top - 20,
    "selected anatomy stays above expanded details",
  );
  await page.screenshot({ path: "/tmp/anatomy-v13-mobile-details.png" });
  await page.locator("#close-detail").tap();
  assert.equal(await page.locator("#inspector").isVisible(), false);
  await page.locator("#mode-acupuncture").tap();
  await ready();
  assert.equal(await page.locator("#acu-detail").isVisible(), false);
  assert.equal(await page.locator("#acu-tag").isVisible(), false);
  await page.screenshot({ path: "/tmp/acupuncture-v13-mobile-initial.png" });
  await page.locator("#menu").tap();
  await page.locator('[data-acu-popular="LI4"]').tap();
  assert.equal(await page.locator("#acu-details").isVisible(), false);
  assert.equal(await page.locator("#acu-tag").isVisible(), false);
  assert.equal(await page.locator("#acu-point-code").textContent(), "LI4");
  const sheet = await page.locator("#acu-detail").boundingBox();
  assert.ok(sheet.height < 190, "compact acupoint sheet");
  await page.locator("#acu-expand").tap();
  assert.equal(await page.locator("#acu-point-location").isVisible(), true);
  await page.waitForTimeout(1200);
  const acupointPosition = await page.evaluate(() => ({
    y:
      parseFloat(document.querySelector("#acu-tag").style.top) +
      55 +
      document.querySelector("#canvas-host").getBoundingClientRect().top,
    top: document.querySelector("#acu-detail").getBoundingClientRect().top,
  }));
  assert.ok(
    acupointPosition.y <= acupointPosition.top - 20,
    "selected acupoint stays above expanded details",
  );
  await page.screenshot({ path: "/tmp/acupuncture-v13-mobile-expanded.png" });
  await page.locator("#acu-expand").tap();
  await page.locator("#acu-close-detail").tap();
  assert.equal(await page.locator("#acu-detail").isVisible(), false);
  await page.locator("#menu").tap();
  await page.locator('[data-acu-popular="LI4"]').tap();
  await page.locator("#reset-camera").tap();
  assert.equal(await page.locator("#acu-detail").isVisible(), false);
  await page.setViewportSize({ width: 844, height: 390 });
  await fits();
  await page.locator("#view-toggle").tap();
  await fits();
  const views = await page.locator("#view-options").boundingBox();
  assert.ok(
    views.y >= 60 && views.y + views.height <= 390,
    "landscape settings within viewport",
  );
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS clean initial canvas, progressive details, mobile touch targets, 320/390/430px and landscape layouts, view controls, close actions and no runtime errors.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
