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
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const modeReady = async () => {
    await page.waitForFunction(
      () =>
        document.body.classList.contains("acupuncture-mode") &&
        !document.querySelector("#mode-acupuncture").disabled,
    );
    assert.equal(await page.locator("#error-panel").isVisible(), false);
  };
  await page.goto(base + "?mode=acupuncture");
  await modeReady();
  assert.equal(await page.locator("#acu-list [data-acu-code]").count(), 20);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#menu").tap();
  await page.locator('[data-acu-popular="LI4"]').tap();
  assert.equal(await page.locator("#acu-point-name").textContent(), "合谷");
  assert.equal(await page.locator("#acu-point-code").textContent(), "LI4");
  await page.waitForTimeout(1200);
  const tag = await page
    .locator("#acu-tag")
    .evaluate((el) => ({
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
    }));
  assert.ok(tag);
  const canvas = await page.locator("#canvas-host").boundingBox(),
    tap = { x: canvas.x + tag.x - 18, y: canvas.y + tag.y + 55 };
  await page.locator("#acu-close-detail").tap();
  await page.touchscreen.tap(tap.x, tap.y);
  assert.equal(await page.locator("#acu-point-code").textContent(), "LI4");
  assert.equal(await page.locator("#acu-detail").isVisible(), true);
  await page.screenshot({ path: "/tmp/acupuncture-v13-mobile.png" });
  await page.locator("#menu").tap();
  await page.locator("#acu-search").fill("ＳＪ－０５");
  await page.locator('[data-acu-code="TE5"]').tap();
  assert.equal(await page.locator("#acu-point-code").textContent(), "TE5");
  assert.equal(await page.locator("#acu-point-name").textContent(), "外関");
  assert.ok(
    (await page.locator("#acu-point-aliases").textContent()).includes("SJ5"),
  );
  await page.locator("#acu-point-prev").tap();
  assert.equal(await page.locator("#acu-point-code").textContent(), "TE4");
  await page.locator("#acu-point-next").tap();
  assert.equal(await page.locator("#acu-point-code").textContent(), "TE5");
  await page.locator("#acu-expand").tap();
  await page.locator("#acu-detail-right").tap();
  assert.ok(
    (await page.locator("#acu-detail-right").getAttribute("class")).includes(
      "active",
    ),
  );
  await page.locator("#acu-favorite").tap();
  assert.equal(
    await page.locator("#acu-favorite").getAttribute("aria-pressed"),
    "true",
  );
  await page.reload();
  await modeReady();
  await page.locator("#menu").tap();
  await page.locator("#acu-only-favorites").check();
  assert.equal(await page.locator("#acu-list [data-acu-code]").count(), 1);
  assert.equal(
    await page
      .locator("#acu-list [data-acu-code]")
      .getAttribute("data-acu-code"),
    "TE5",
  );
  await page.locator("#acu-only-favorites").uncheck();
  await page.locator("#acu-start-study").tap();
  const answer = await page.locator("#acu-point-code").textContent();
  await page
    .locator("#acu-answers")
    .getByRole("button", { name: answer, exact: true })
    .tap();
  assert.equal(
    await page.locator("#acu-study-score").textContent(),
    "1 / 1 正解",
  );
  await page.locator("#acu-study-direction").selectOption("code-kanji");
  const kanji = await page.locator("#acu-point-name").textContent();
  await page
    .locator("#acu-answers")
    .getByRole("button", { name: kanji, exact: true })
    .tap();
  assert.equal(
    await page.locator("#acu-study-score").textContent(),
    "2 / 2 正解",
  );
  await page.locator("#acu-end-study").tap();
  await page.locator("#acu-search").fill("GV28");
  await page.locator('[data-acu-code="GV28"]').tap();
  assert.equal(await page.locator("#acu-point-name").textContent(), "齦交");
  assert.ok(
    (await page.locator("#acu-point-location").textContent()).includes(
      "口腔内",
    ),
  );
  assert.equal(await page.locator("#acu-tag").isVisible(), false);
  await page.locator("#menu").tap();
  await page.locator("#acu-search").fill("GV24+");
  assert.equal(await page.locator("#acu-list [data-acu-code]").count(), 0);
  await page.locator("#acu-search").fill("");
  await page.locator("#acu-meridian").selectOption("all");
  assert.ok(
    (await page.locator("#acu-result-count").textContent()).startsWith("361穴"),
  );
  assert.equal(await page.locator("#acu-list [data-acu-code]").count(), 80);
  await page.locator("#acu-more").tap();
  assert.equal(await page.locator("#acu-list [data-acu-code]").count(), 160);
  await page.locator("#mode-anatomy").tap();
  await page.waitForFunction(
    () => !document.querySelector("#mode-anatomy").disabled,
  );
  assert.equal(await page.locator("#anatomy-panel").isVisible(), true);
  assert.equal(
    await page.locator('[data-layer="skeletal"]').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#search").fill("左大腿骨");
  await page.locator("#search-results .quick-item").first().tap();
  assert.equal(await page.locator("#part-title").textContent(), "左大腿骨");
  await page.locator("#isolate").tap();
  await page.locator("#mode-acupuncture").tap();
  await modeReady();
  await page.locator("#mode-anatomy").tap();
  await page.waitForFunction(
    () => !document.querySelector("#mode-anatomy").disabled,
  );
  assert.equal(await page.locator("#part-title").textContent(), "左大腿骨");
  assert.equal(
    await page.locator("#isolate").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#mode-acupuncture").tap();
  await modeReady();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await modeReady();
  await page.locator("#menu").tap();
  await page.locator('[data-acu-popular="LI4"]').tap();
  assert.equal(await page.locator("#acu-point-name").textContent(), "合谷");
  assert.deepEqual(errors, []);
  console.log(
    "PASS mobile raycast, Japanese/code/alias search, sides, sequence, favorites, two quiz directions, GV28 exception, WHO scope, mode state restoration and offline.",
  );
  await context.close();
  const dc = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    dp = await dc.newPage();
  dp.setDefaultTimeout(60000);
  await dp.goto(base + "?mode=acupuncture&point=ST36&side=right");
  await dp.waitForFunction(
    () =>
      document.body.classList.contains("acupuncture-mode") &&
      !document.querySelector("#mode-acupuncture").disabled,
  );
  assert.equal(await dp.locator("#acu-point-name").textContent(), "足三里");
  assert.equal(await dp.locator("#acu-point-code").textContent(), "ST36");
  await dp.locator("#acu-expand").click();
  await dp.locator("#acu-detail-source").click();
  assert.ok(
    (await dp.locator("#info-content").textContent()).includes(
      "WHO配布の3D座標は確認できていません",
    ),
  );
  await dp.locator("#close-info").click();
  await dp.screenshot({ path: "/tmp/acupuncture-v13-desktop.png" });
  await dp.setViewportSize({ width: 320, height: 568 });
  assert.ok(
    await dp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await dp.setViewportSize({ width: 844, height: 390 });
  assert.ok(
    await dp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  console.log(
    "PASS desktop deep link, source disclosure, 320px and landscape layouts.",
  );
  await dc.close();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
