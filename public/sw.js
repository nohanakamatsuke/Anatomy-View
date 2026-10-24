const scope = self.registration.scope;
const PREFIX = "human-anatomy-app:" + scope + ":",
  CACHE = PREFIX + "__BUILD__";
const MODEL_CACHE = "human-anatomy-models-v2:" + scope;
const LEGACY_PREFIX = "anatomia-" + scope + "-";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "scene.js",
  "catalog.js",
  "model-loader.js",
  "model-worker.js",
  "model-storage.js",
  "geometry-data.js",
  "vendor/three.module.js",
  "vendor/three.core.js",
  "vendor/OrbitControls.js",
  "models/atlas.json",
  "models/checksums.json",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "ATTRIBUTION.md",
].map((p) => new URL(p, scope).href);
const isModel = (request) => {
  const path = new URL(request.url).pathname;
  return path.includes("/models/") && path.endsWith(".bin.gz");
};
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys(),
        models = await caches.open(MODEL_CACHE);
      const preserved = new Set();
      // Carry forward models downloaded by previous app versions before removing their shell caches.
      for (const name of names.filter((n) => n.startsWith(LEGACY_PREFIX))) {
        const old = await caches.open(name);
        for (const request of await old.keys())
          if (isModel(request) && !(await models.match(request))) {
            const response = await old.match(request);
            if (response)
              try {
                await models.put(request, response);
              } catch {
                preserved.add(name);
              }
          }
      }
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith(PREFIX) && name !== CACHE) ||
              (name.startsWith(LEGACY_PREFIX) && !preserved.has(name)),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(scope))
    return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(isModel(event.request) ? MODEL_CACHE : CACHE);
        const hit = await cache.match(event.request);
        if (hit) return hit;
      } catch {}
      const response = await fetch(event.request);
      if (response.ok && cache) {
        const copy = response.clone();
        event.waitUntil(cache.put(event.request, copy).catch(() => {}));
      }
      return response;
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "APP_CACHE_VERSION")
    event.ports?.[0]?.postMessage(CACHE);
});
