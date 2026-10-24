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
  "asset-url.js",
  "acupoint-data.js",
  "acupuncture-scene.js",
  "acupuncture-ui.js",
  "acupuncture/catalog.json",
  "acupuncture/SOURCES.md",
  "licenses/acupoint-positions-MIT.txt",
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
      .then((cache) =>
        Promise.all(
          ASSETS.map(async (url) => {
            const versioned = new URL(url);
            versioned.searchParams.set("v", "__BUILD__");
            const response = await fetch(
              new Request(versioned, { cache: "reload" }),
            );
            if (!response.ok) throw Error("App asset unavailable: " + url);
            await cache.put(url, response);
          }),
        ),
      )
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
      const model = isModel(event.request),
        url = new URL(event.request.url);
      let cache;
      try {
        cache = await caches.open(model ? MODEL_CACHE : CACHE);
      } catch {}
      // Navigations revalidate the small HTML document; offline still uses the shell.
      // A client of another build must not receive this build's cached JS modules.
      const requested = url.searchParams.get("v"),
        differentBuild =
          !model && requested && requested !== CACHE.slice(PREFIX.length);
      const navigation = event.request.mode === "navigate";
      if (!navigation && !differentBuild && cache) {
        const hit = await cache.match(event.request, { ignoreSearch: !model });
        if (hit) return hit;
      }
      try {
        const response = await fetch(
          navigation || differentBuild
            ? new Request(event.request, { cache: "no-store" })
            : event.request,
        );
        if (response.ok && cache && !differentBuild) {
          const copy = response.clone();
          const key = navigation
            ? new URL(url.pathname, url.origin).href
            : event.request;
          event.waitUntil(cache.put(key, copy).catch(() => {}));
        }
        return response;
      } catch (error) {
        if (cache && !differentBuild) {
          const hit = await cache.match(event.request, {
            ignoreSearch: !model,
          });
          if (hit) return hit;
        }
        throw error;
      }
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "APP_CACHE_VERSION")
    event.ports?.[0]?.postMessage(CACHE);
});
