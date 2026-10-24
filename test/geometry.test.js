import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { prepareGeometry, geometryViews } from "../public/geometry-data.js";
import { Color } from "../public/vendor/three.module.js";
const atlas = JSON.parse(
  await readFile(new URL("../public/models/atlas.json", import.meta.url)),
);
test("preparing all layers preserves every vertex, normal, triangle and selection identity", async () => {
  for (const layer of atlas.layers) {
    const raw = gunzipSync(
        await readFile(new URL("../public/" + layer.url, import.meta.url)),
      ),
      source = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      );
    const result = prepareGeometry(atlas, layer.id, source),
      out = geometryViews(result.buffer, result.layout);
    let vertex = 0,
      index = 0;
    for (let partIndex = 0; partIndex < atlas.parts.length; partIndex++) {
      const p = atlas.parts[partIndex];
      if (p.layer !== layer.id) continue;
      assert.deepEqual(
        out.positions.subarray(vertex * 3, (vertex + p.vertexCount) * 3),
        new Float32Array(source, p.positions, p.vertexCount * 3),
      );
      assert.deepEqual(
        out.normals.subarray(vertex * 3, (vertex + p.vertexCount) * 3),
        new Int16Array(source, p.normals, p.vertexCount * 3),
      );
      for (const part of out.partIndices.subarray(
        vertex,
        vertex + p.vertexCount,
      ))
        assert.equal(part, partIndex);
      const originalIndices = new Uint32Array(source, p.indices, p.indexCount);
      for (let i = 0; i < p.indexCount; i++)
        assert.equal(out.indices[index + i], originalIndices[i] + vertex);
      vertex += p.vertexCount;
      index += p.indexCount;
    }
    assert.equal(vertex, result.layout.vertexCount);
    assert.equal(index, result.layout.indexCount);
  }
});
test("compact linear vertex colors retain the original bone material within 8-bit precision", async () => {
  const layer = atlas.layers[0],
    raw = gunzipSync(
      await readFile(new URL("../public/" + layer.url, import.meta.url)),
    ),
    source = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const result = prepareGeometry(atlas, layer.id, source),
    colors = geometryViews(result.buffer, result.layout).colors,
    reference = new Color("#dfd9bf");
  for (const [i, value] of [reference.r, reference.g, reference.b].entries())
    assert.ok(Math.abs(colors[i] / 255 - value) <= 0.5 / 255);
});
test("invalid and stale prepared data are rejected before rendering", () => {
  assert.throws(() =>
    geometryViews(new ArrayBuffer(1), { format: 99, byteLength: 1 }),
  );
  assert.throws(() =>
    geometryViews(new ArrayBuffer(4), { format: 1, byteLength: 5 }),
  );
  assert.throws(() =>
    prepareGeometry(atlas, "not-a-layer", new ArrayBuffer(0)),
  );
});
