import { assetURL } from "./asset-url.js";
import {
  prepareGeometry,
  geometryViews,
  GEOMETRY_FORMAT,
} from "./geometry-data.js";
const scope = new URL("./", import.meta.url).href;
export const MODEL_CACHE = "human-anatomy-models-v2:" + scope;
const DATABASE = "human-anatomy-ready-v1";
let databasePromise;
function database() {
  if (!databasePromise)
    databasePromise = new Promise((resolve) => {
      if (!globalThis.indexedDB) {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = (db) => {
        if (settled) {
          db?.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), 1500);
      try {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("geometry", {
            keyPath: "key",
          });
          store.createIndex("layerKey", "layerKey");
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            databasePromise = undefined;
          };
          finish(request.result);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
  return databasePromise;
}
async function readReady(key) {
  const db = await database();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("geometry", "readonly"),
        request = tx.objectStore("geometry").get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function writeReady(record) {
  const db = await database();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("geometry", "readwrite"),
        store = tx.objectStore("geometry");
      store.put(record);
      const old = store.index("layerKey").getAllKeys(record.layerKey);
      old.onsuccess = () => {
        for (const key of old.result) if (key !== record.key) store.delete(key);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
async function deleteReady(key) {
  const db = await database();
  if (!db) return;
  try {
    db.transaction("geometry", "readwrite").objectStore("geometry").delete(key);
  } catch {}
}
async function compressedData(url, onProgress) {
  let cache;
  try {
    cache = await caches.open(MODEL_CACHE);
  } catch {}
  let response;
  try {
    response = await cache?.match(url);
  } catch {}
  const source = response ? "model-cache" : "network";
  if (!response) response = await fetch(url);
  if (!response.ok)
    throw Error("モデルを取得できませんでした (" + response.status + ")");
  const total = Number(response.headers.get("content-length"));
  const pieces = [];
  let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pieces.push(value);
      received += value.byteLength;
      onProgress(
        total ? Math.min(75, (received / total) * 75) : 30,
        source === "model-cache"
          ? "端末のモデルを読み込み中"
          : "モデルをダウンロード中",
      );
    }
  } else pieces.push(new Uint8Array(await response.arrayBuffer()));
  const blob = new Blob(pieces);
  return { blob, source, cache };
}

async function hexDigest(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function restoreLegacy(atlas, layer, onProgress) {
  if (!layer.prepared?.dataSha256) return null;
  try {
    const cache = await caches.open(MODEL_CACHE),
      url = new URL(layer.url, scope).href,
      response = await cache.match(url);
    if (!response) return null;
    const manifestResponse = await fetch(
      new URL("models/checksums.json", scope),
    );
    if (!manifestResponse.ok) return null;
    const checks = await manifestResponse.json(),
      compressed = await response.arrayBuffer();
    if ((await hexDigest(compressed)) !== checks[layer.url.split("/").pop()]) {
      await cache.delete(url);
      return null;
    }
    onProgress(35, "保存済みモデルを新形式に更新中");
    const decodeStart = performance.now(),
      unpacked = await new Response(
        new Blob([compressed])
          .stream()
          .pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer();
    const decode = performance.now() - decodeStart;
    if (unpacked.byteLength !== layer.bytes) return null;
    const metadata = atlas.parts
      ? atlas
      : await (await fetch(assetURL("models/atlas.json"))).json();
    const started = performance.now(),
      result = prepareGeometry(metadata, layer.id, unpacked);
    if ((await hexDigest(result.buffer)) !== layer.prepared.dataSha256)
      return null;
    return {
      ...result,
      source: "legacy-model-cache",
      timings: { decode, prepare: performance.now() - started },
    };
  } catch {
    return null;
  }
}
export async function loadGeometryData(
  { atlas, id, checksums },
  onProgress = () => {},
) {
  const started = performance.now(),
    layer = atlas.layers.find((l) => l.id === id);
  if (!layer) throw Error("モデルが見つかりません");
  const prepared = layer.prepared;
  if (!prepared && !checksums) {
    const response = await fetch(assetURL("models/checksums.json"));
    if (!response.ok) throw Error("モデルの整合性情報を取得できませんでした");
    checksums = await response.json();
  }
  const key =
    scope +
    "|" +
    GEOMETRY_FORMAT +
    "|" +
    (prepared?.sha256 ||
      checksums?.[layer.url.split("/").pop()] +
        "|" +
        checksums?.["atlas.json"] ||
      "source") +
    "|" +
    id;
  onProgress(1, "保存済みデータを確認中");
  const record = await readReady(key);
  if (record) {
    try {
      geometryViews(record.buffer, record.layout);
      onProgress(90, "保存済みデータを表示中");
      return {
        ...record,
        source: "ready-cache",
        timings: { total: performance.now() - started, decode: 0, prepare: 0 },
        persisted: true,
      };
    } catch {
      await deleteReady(key);
    }
  }
  const legacy = await restoreLegacy(atlas, layer, onProgress);
  if (legacy) {
    onProgress(90, "次回のために端末へ保存中");
    const persisted = await writeReady({
      key,
      layerKey: scope + "|" + id,
      buffer: legacy.buffer,
      layout: legacy.layout,
    });
    return {
      ...legacy,
      persisted,
      timings: { ...legacy.timings, total: performance.now() - started },
    };
  }
  const url = new URL(prepared?.url || layer.url, scope).href;
  const { blob, source, cache } = await compressedData(url, onProgress);
  const compressed = await blob.arrayBuffer();
  const expected = prepared?.sha256 || checksums?.[layer.url.split("/").pop()];
  if (!/^[a-f0-9]{64}$/.test(expected || ""))
    throw Error("モデルの整合性情報が正しくありません");
  if (expected) {
    const digest = await crypto.subtle.digest("SHA-256", compressed),
      actual = [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    if (actual !== expected) {
      try {
        await cache?.delete(url);
      } catch {}
      throw Error(
        "モデルの整合性を確認できませんでした。再読み込みしてください。",
      );
    }
  }
  // Cache here as well: the first visit may not yet be controlled by a service worker.
  if (source === "network" && cache) {
    try {
      await cache.put(
        url,
        new Response(compressed.slice(0), {
          headers: { "Content-Type": "application/gzip" },
        }),
      );
    } catch {}
  }
  onProgress(78, "モデルを展開中");
  if (typeof DecompressionStream === "undefined")
    throw Error(
      "モデルの展開に対応していません。最新版のブラウザをご利用ください。",
    );
  const decodeStart = performance.now();
  const unpacked = await new Response(
    new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
  const decode = performance.now() - decodeStart;
  if (unpacked.byteLength !== (prepared?.bytes || layer.bytes))
    throw Error("モデルのデータ長が正しくありません");
  onProgress(85, "表示データを準備中");
  const prepareStart = performance.now(),
    result = prepared
      ? { buffer: unpacked, layout: prepared.layout }
      : prepareGeometry(atlas, id, unpacked);
  geometryViews(result.buffer, result.layout);
  const prepare = performance.now() - prepareStart;
  onProgress(90, "次回のために端末へ保存中");
  const persisted = await writeReady({
    key,
    layerKey: scope + "|" + id,
    ...result,
  });
  return {
    ...result,
    source,
    persisted,
    timings: { total: performance.now() - started, decode, prepare },
  };
}
