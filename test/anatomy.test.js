import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
  FEATURED,
  filterEntries,
  isTap,
  escapeHTML,
} from "../public/catalog.js";
const atlas = JSON.parse(
  await readFile(new URL("../public/models/atlas.json", import.meta.url)),
);
test("all 2,234 meshes and 15 source systems retain valid geometry and source identities", async () => {
  assert.equal(atlas.parts.length, 2234);
  assert.equal(new Set(atlas.parts.map((p) => p.system)).size, 15);
  assert.equal(atlas.layers.length, 10);
  assert.equal(new Set(atlas.parts.map((p) => p.id)).size, atlas.parts.length);
  for (const layer of atlas.layers) {
    const bin = gunzipSync(
      await readFile(new URL("../public/" + layer.url, import.meta.url)),
    );
    assert.equal(bin.byteLength, layer.bytes);
    const buf = bin.buffer.slice(
      bin.byteOffset,
      bin.byteOffset + bin.byteLength,
    );
    let triangles = 0;
    for (const p of atlas.parts.filter((p) => p.layer === layer.id)) {
      assert.ok(p.vertexCount > 0);
      assert.ok(p.indexCount > 0);
      assert.equal(p.indexCount % 3, 0);
      assert.ok(p.positions + p.vertexCount * 12 <= buf.byteLength);
      assert.ok(p.normals + p.vertexCount * 6 <= buf.byteLength);
      const positions = new Float32Array(buf, p.positions, p.vertexCount * 3);
      for (const value of positions) assert.ok(Number.isFinite(value));
      for (const index of new Uint32Array(buf, p.indices, p.indexCount))
        assert.ok(index < p.vertexCount);
      triangles += p.indexCount / 3;
    }
    assert.ok(triangles > 1000);
  }
});
test("featured anatomy maps to actual mesh groups, including heart and skull", () => {
  const ids = new Set(atlas.parts.map((p) => p.id));
  for (const f of FEATURED) {
    const c = atlas.concepts.find((c) => c.name.toLowerCase() === f.name);
    assert.ok(c, f.name);
    assert.ok(c.elements.length > 0);
    assert.ok(c.elements.every((id) => ids.has(id)));
  }
});
test("Japanese search and input safety", () => {
  const parts = [
    { id: "femur", name: "Left femur" },
    { id: "stomach", name: "Stomach" },
  ];
  assert.equal(filterEntries(parts, "大腿骨")[0].id, "femur");
  assert.equal(filterEntries(parts, "STOMACH")[0].id, "stomach");
  assert.equal(filterEntries(parts, "unknown").length, 0);
  assert.equal(escapeHTML("<script>"), "&lt;script&gt;");
});
test("rotation, pinch and cancelled drag cannot select a structure as a tap", () => {
  assert.equal(isTap({ x: 0, y: 0, count: 1 }, { x: 3, y: 4 }), true);
  assert.equal(isTap({ x: 0, y: 0, count: 1 }, { x: 15, y: 4 }), false);
  assert.equal(isTap({ x: 0, y: 0, count: 2 }, { x: 0, y: 0 }), false);
  assert.equal(
    isTap({ x: 0, y: 0, count: 1, moved: true }, { x: 0, y: 0 }),
    false,
  );
  assert.equal(isTap(null, { x: 0, y: 0 }), false);
});
test("packaged model checksums match the validated assets", async () => {
  const { createHash } = await import("node:crypto");
  const checks = JSON.parse(
    await readFile(new URL("../public/models/checksums.json", import.meta.url)),
  );
  for (const [file, expected] of Object.entries(checks)) {
    const content = await readFile(
      new URL("../public/models/" + file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(content).digest("hex"),
      expected,
      file,
    );
  }
});
test("solid liver segments are available in the organ layer", () => {
  const segments = atlas.parts.filter((p) =>
    p.name.startsWith("Hepatovenous segment"),
  );
  assert.ok(segments.length > 0);
  assert.ok(segments.every((p) => p.layer === "organs"));
  const brain = atlas.concepts.find((c) => c.name === "brain");
  const ids = new Set(brain.elements);
  assert.ok(
    atlas.parts.filter((p) => ids.has(p.id)).every((p) => p.layer === "organs"),
  );
});
