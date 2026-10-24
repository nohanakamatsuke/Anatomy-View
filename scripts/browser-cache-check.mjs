import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
let revision = 0;
const buildVersion = (await readFile(root + "/sw.js", "utf8")).match(
  /CACHE = PREFIX \+ "([a-f0-9]+)"/,
)[1];
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".gz": "application/gzip",
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/__legacy-model") {
    const bytes = await readFile(root + "/models/skeletal.bin.gz");
    res.writeHead(200, { "Content-Type": "application/gzip" });
    res.end(bytes);
    return;
  }
  if (url.pathname.endsWith("sw.js"))
    console.log("SW REQUEST", revision, url.search);
  if (url.pathname === "/__update" && req.method === "POST") {
    revision++;
    res.end(String(revision));
    return;
  }
  if (!url.pathname.startsWith("/Anatomy-View/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const relative = url.pathname.slice("/Anatomy-View/".length) || "index.html",
    file = path.resolve(root, relative);
  if (!file.startsWith(root + "/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    let bytes = await readFile(file);
    if ([".js", ".html", ".css"].includes(path.extname(file)))
      bytes = Buffer.from(
        bytes.toString().replaceAll(buildVersion, "test-app-" + revision),
      );
    if (relative === "app.js")
      bytes = Buffer.from(
        bytes.toString() + "\nglobalThis.testShellRevision=" + revision + ";\n",
      );
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Content-Length": bytes.length,
      "Cache-Control": relative === "sw.js" ? "no-store" : "max-age=600",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port,
  app = base + "/Anatomy-View/";
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
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const navigations = [];
  page.on("response", (r) => {
    if (r.request().isNavigationRequest())
      navigations.push({
        url: r.url(),
        fromServiceWorker: r.fromServiceWorker(),
      });
  });
  let modelRequests = 0;
  context.on("request", (request) => {
    if (request.url().includes("/models/render-")) modelRequests++;
  });
  const ready = async () => {
    try {
      await page.waitForFunction(
        () =>
          document.querySelector("#loader").hidden ||
          !document.querySelector("#error-panel").hidden,
        {},
        { timeout: 30000 },
      );
    } catch (error) {
      console.log(
        "READINESS FAILURE",
        await page.evaluate(() => ({
          loading: document.querySelector("#loading-text").textContent,
          error: document.querySelector("#error-text").textContent,
          marks: performance
            .getEntriesByType("measure")
            .map((e) => ({ name: e.name, detail: e.detail })),
        })),
        errors,
      );
      throw error;
    }
    assert.equal(
      await page.locator("#error-panel").isVisible(),
      false,
      await page.locator("#error-text").textContent(),
    );
  };
  const waitForVersion = async (version) =>
    page.waitForFunction(
      (version) =>
        new Promise((resolve) => {
          const controller = navigator.serviceWorker.controller;
          if (!controller || controller.state !== "activated") {
            resolve(false);
            return;
          }
          const channel = new MessageChannel(),
            timer = setTimeout(() => {
              channel.port1.close();
              resolve(false);
            }, 500);
          channel.port1.onmessage = (e) => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(String(e.data).endsWith("test-app-" + version));
          };
          controller.postMessage({ type: "APP_CACHE_VERSION" }, [
            channel.port2,
          ]);
        }),
      version,
    );
  const metric = () =>
    page.evaluate(
      () =>
        performance
          .getEntriesByType("measure")
          .find((e) => e.name === "model-load:skeletal")?.detail,
    );
  await page.goto(app);
  await ready();
  const first = await metric();
  assert.equal(first.source, "network");
  assert.equal(first.persisted, true);
  assert.ok(modelRequests > 0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  modelRequests = 0;
  await page.reload();
  await ready();
  const warm = await metric();
  assert.equal(warm.source, "ready-cache");
  assert.equal(warm.decode, 0);
  assert.equal(warm.prepare, 0);
  assert.equal(modelRequests, 0);
  console.log(
    "PASS repeat launch: no model downloads, decompression or assembly",
    JSON.stringify({ first, warm }),
  );
  // Loss of the ready-to-render storage must still use the compressed disk cache.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("human-anatomy-ready-v1", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("geometry", "readwrite");
          tx.objectStore("geometry").clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  modelRequests = 0;
  await page.reload();
  await ready();
  assert.equal((await metric()).source, "model-cache");
  assert.equal(modelRequests, 0);
  // An app-shell update must not delete either model cache.
  await fetch(base + "/__update", { method: "POST" });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await waitForVersion(1);
  modelRequests = 0;
  await page.reload();
  await ready();
  assert.equal((await metric()).source, "ready-cache");
  assert.equal(modelRequests, 0);
  if ((await page.evaluate(() => globalThis.testShellRevision)) !== 1)
    console.log(
      "NAV DIAGNOSIS",
      navigations,
      await page.evaluate(async () => ({
        state: navigator.serviceWorker.controller?.state,
        active: (await navigator.serviceWorker.getRegistration()).active?.state,
        url: location.href,
      })),
    );
  if ((await page.evaluate(() => globalThis.testShellRevision)) !== 1)
    console.log(
      "SHELL DIAGNOSIS",
      await page.evaluate(async () => {
        const keys = await caches.keys(),
          entries = [];
        for (const key of keys.filter((k) =>
          k.includes("human-anatomy-app:"),
        )) {
          const cache = await caches.open(key);
          const requests = await cache.keys();
          for (const request of requests.filter(
            (r) =>
              r.url.includes("app.js") || new URL(r.url).pathname.endsWith("/"),
          )) {
            const text = await (await cache.match(request)).text();
            entries.push({
              cache: key,
              url: request.url,
              tail: text.slice(-100),
              scripts: text.match(/app\.js[^"']*/g),
            });
          }
        }
        return { script: [...document.scripts].map((s) => s.src), entries };
      }),
    );
  assert.equal(
    await page.evaluate(() => globalThis.testShellRevision),
    1,
    "new app shell must bypass stale HTTP cache",
  );
  await context.setOffline(true);
  await page.reload();
  await ready();
  assert.equal((await metric()).source, "ready-cache");
  assert.equal(
    await page.evaluate(() => globalThis.testShellRevision),
    1,
    "offline must retain the latest app shell",
  );
  await context.setOffline(false);
  // Existing installs can upgrade their old compressed model without downloading the new format.
  await page.evaluate(async () => {
    const raw = await fetch(location.origin + "/__legacy-model");
    const cache = await caches.open(
      "anatomia-" + new URL("./", location.href).href + "-old",
    );
    await cache.put(new URL("models/skeletal.bin.gz", location.href), raw);
    const names = await caches.keys();
    for (const name of names.filter((n) =>
      n.startsWith("human-anatomy-models-v2:"),
    )) {
      const c = await caches.open(name);
      for (const key of await c.keys())
        if (key.url.includes("render-skeletal-")) await c.delete(key);
    }
    await new Promise((resolve) => {
      const r = indexedDB.open("human-anatomy-ready-v1", 1);
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("geometry", "readwrite");
        tx.objectStore("geometry").clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await fetch(base + "/__update", { method: "POST" });
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await waitForVersion(2);
  modelRequests = 0;
  await page.reload();
  await ready();
  assert.equal((await metric()).source, "legacy-model-cache");
  assert.equal(modelRequests, 0);
  console.log(
    "PASS upgrade migrates legacy compressed models without downloading replacements.",
  );
  await page.touchscreen.tap(195, 300);
  assert.equal(await page.locator("#inspector-detail").isVisible(), true);
  await page.locator("#hide-part").tap();
  await page.locator("#tools-toggle").tap();
  await page.locator("#restore-hidden").tap();
  await page.locator("#close-tools").tap();
  await page.locator("#reset-camera").tap();
  await page.waitForTimeout(1500);
  const beforeClip = createHash("sha256")
    .update(await page.locator("canvas").screenshot())
    .digest("hex");
  await page.locator("#tools-toggle").tap();
  await page.locator("#clip-enabled").check();
  await page.locator("#clip-axis").selectOption("y");
  await page.waitForTimeout(500);
  const afterClip = createHash("sha256")
    .update(await page.locator("canvas").screenshot())
    .digest("hex");
  assert.notEqual(afterClip, beforeClip);
  await page.locator("#clip-enabled").uncheck();
  await page.locator("#close-tools").tap();
  // Search, raycasting, hiding, clipping and additional layers must survive the new attributes.
  await page.locator("#menu").tap();
  await page.locator("#search").fill("頭蓋骨");
  await page.locator("#search-results .quick-item").first().tap();
  assert.equal(await page.locator("#part-title").textContent(), "頭蓋骨");
  await page.locator("#isolate").tap();
  assert.equal(
    await page.locator("#isolate").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#reset-camera").tap();
  await page.locator('[data-preset="organs"]').tap();
  await ready();
  await page.locator("#menu").tap();
  await page.locator("#search").fill("心臓");
  await page.locator("#search-results .quick-item").first().tap();
  assert.equal(await page.locator("#part-title").textContent(), "心臓");
  await page.locator("#favorite").tap();
  assert.equal(await page.locator("#favorite-count").textContent(), "1");
  await page.reload();
  await ready();
  assert.equal(await page.locator("#favorite-count").textContent(), "1");
  assert.deepEqual(errors, []);
  console.log(
    "PASS app update preserves caches; offline launch, compact attributes, organ selection and favorites.",
  );
  await context.close();
  const fallback = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await fallback.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw Error("worker unavailable");
      }
    };
    Object.defineProperty(window, "indexedDB", { value: undefined });
    Object.defineProperty(window, "caches", { value: undefined });
  });
  const fp = await fallback.newPage();
  await fp.goto(app);
  await fp.waitForFunction(
    () =>
      document.querySelector("#loader").hidden ||
      !document.querySelector("#error-panel").hidden,
    {},
    { timeout: 90000 },
  );
  assert.equal(await fp.locator("#error-panel").isVisible(), false);
  const fm = await fp.evaluate(
    () =>
      performance
        .getEntriesByType("measure")
        .find((e) => e.name === "model-load:skeletal").detail,
  );
  assert.equal(fm.persisted, false);
  assert.equal(fm.source, "network");
  console.log("PASS display without Worker, IndexedDB or CacheStorage.");
  await fallback.close();
  const stalled = await browser.newContext({ serviceWorkers: "block" });
  await stalled.addInitScript(() => {
    window.Worker = class {
      postMessage() {}
      terminate() {}
    };
  });
  const sp = await stalled.newPage();
  await sp.goto(app);
  await sp.waitForFunction(
    () =>
      document.querySelector("#loader").hidden ||
      !document.querySelector("#error-panel").hidden,
    {},
    { timeout: 15000 },
  );
  assert.equal(await sp.locator("#error-panel").isVisible(), false);
  console.log(
    "PASS a worker that never starts falls back without hanging at 0%.",
  );
  await stalled.close();
  const corrupt = await browser.newContext({ serviceWorkers: "block" });
  const cp = await corrupt.newPage();
  await cp.goto(app);
  await cp.waitForFunction(
    () => document.querySelector("#loader").hidden,
    {},
    { timeout: 90000 },
  );
  const failure = await cp.evaluate(async () => {
    const atlas = await (await fetch("./models/atlas.json")).json();
    atlas.layers[0].prepared.sha256 = "0".repeat(64);
    const { loadGeometryData } = await import("./model-storage.js");
    try {
      await loadGeometryData({ atlas, id: "skeletal" });
      return null;
    } catch (error) {
      return error.message;
    }
  });
  assert.ok(failure.includes("整合性"));
  console.log("PASS invalid model checksum rejected.");
  await corrupt.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
