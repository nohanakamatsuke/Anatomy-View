const PREFIX = "anatomia-" + self.registration.scope + "-",
  CACHE = PREFIX + "__BUILD__";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "scene.js",
  "catalog.js",
  "vendor/three.module.js",
  "vendor/three.core.js",
  "vendor/OrbitControls.js",
  "vendor/BufferGeometryUtils.js",
  "models/atlas.json",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "ATTRIBUTION.md",
].map((p) => new URL(p, self.registration.scope).href);
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    !e.request.url.startsWith(self.registration.scope)
  )
    return;
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            e.waitUntil(
              caches
                .open(CACHE)
                .then((c) => c.put(e.request, clone))
                .catch(() => {}),
            );
          }
          return response;
        }),
    ),
  );
});
