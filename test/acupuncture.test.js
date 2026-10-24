import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import * as T from "../public/vendor/three.module.js";
import {
  normalizeCode,
  findAcupoints,
  pointLabel,
} from "../public/acupoint-data.js";
const data = JSON.parse(
  await readFile(
    new URL("../public/acupuncture/catalog.json", import.meta.url),
  ),
);
const expected = {
  LU: 11,
  LI: 20,
  ST: 45,
  SP: 21,
  HT: 9,
  SI: 19,
  BL: 67,
  KI: 27,
  PC: 9,
  TE: 23,
  GB: 44,
  LR: 14,
  GV: 28,
  CV: 24,
};
test("catalog contains exactly the WHO 361 code ranges and fourteen meridians", () => {
  assert.equal(data.points.length, 361);
  assert.equal(data.meridians.length, 14);
  assert.equal(new Set(data.points.map((p) => p.code)).size, 361);
  for (const [code, count] of Object.entries(expected)) {
    assert.deepEqual(
      data.points.filter((p) => p.meridian === code).map((p) => p.code),
      Array.from({ length: count }, (_, i) => code + (i + 1)),
    );
  }
  assert.ok(!data.points.some((p) => p.code === "GV24+"));
  for (const p of data.points) {
    assert.match(p.ja, /\p{Script=Han}/u);
    assert.ok(p.reading);
    assert.equal(p.positionReview, "schematic-unreviewed");
    assert.ok(p.sources.includes("who-2008"));
  }
});
test("Japanese names, readings, full-width codes and alternative codes resolve to the same point", () => {
  for (const [code, ja] of [
    ["LI4", "合谷"],
    ["ST36", "足三里"],
    ["SP6", "三陰交"],
    ["PC6", "内関"],
    ["TE5", "外関"],
    ["LR3", "太衝"],
    ["GV20", "百会"],
    ["CV12", "中脘"],
  ]) {
    const p = findAcupoints(data, code)[0];
    assert.equal(p.ja, ja);
    assert.equal(findAcupoints(data, ja)[0].code, code);
    assert.equal(pointLabel(p), ja + " · " + code);
  }
  assert.equal(findAcupoints(data, "ごうこく")[0].code, "LI4");
  assert.equal(findAcupoints(data, "ゴウコク")[0].code, "LI4");
  assert.equal(findAcupoints(data, "ＬＩ－０４")[0].code, "LI4");
  assert.equal(findAcupoints(data, "SJ5")[0].code, "TE5");
  assert.equal(findAcupoints(data, "LV3")[0].code, "LR3");
  assert.equal(findAcupoints(data, "DU20")[0].code, "GV20");
  assert.equal(findAcupoints(data, "RN12")[0].code, "CV12");
  assert.equal(normalizeCode("li 4"), "LI4");
  assert.equal(findAcupoints(data, "<script>").length, 0);
});
test("intraoral GV28 is listed, never represented as an external facial marker", () => {
  const p = data.points.find((p) => p.code === "GV28");
  assert.equal(p.ja, "齦交");
  assert.equal(p.placement, "intraoral-unmapped");
  assert.deepEqual(p.instances, []);
  assert.equal(data.points.flatMap((p) => p.instances).length, 669);
  for (const p of data.points.filter((p) => p.code !== "GV28")) {
    assert.equal(p.instances.length, p.midline ? 1 : 2);
    if (!p.midline) {
      assert.deepEqual(p.instances.map((i) => i.side).sort(), [
        "left",
        "right",
      ]);
      assert.ok(p.instances.find((i) => i.side === "left").position[0] > 0);
      assert.ok(p.instances.find((i) => i.side === "right").position[0] < 0);
    }
  }
});
test("all displayed positions contact the actual skin mesh, without claiming clinical validation", async () => {
  const atlas = JSON.parse(
      await readFile(new URL("../public/models/atlas.json", import.meta.url)),
    ),
    checks = JSON.parse(
      await readFile(
        new URL("../public/models/checksums.json", import.meta.url),
      ),
    );
  assert.equal(data.anatomy.skinSha256, checks["integumentary.bin.gz"]);
  const skin = atlas.parts.find((p) => p.id === "FJ2810"),
    raw = gunzipSync(
      await readFile(
        new URL("../public/models/integumentary.bin.gz", import.meta.url),
      ),
    ),
    buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    positions = new Float32Array(buffer, skin.positions, skin.vertexCount * 3),
    indices = new Uint32Array(buffer, skin.indices, skin.indexCount);
  for (const p of data.points)
    for (const instance of p.instances) {
      assert.equal(instance.meshId, "FJ2810");
      assert.ok(instance.position.every(Number.isFinite));
      assert.ok(
        Math.abs(new T.Vector3(...instance.normal).length() - 1) < 0.00001,
      );
      const index = instance.faceIndex * 3;
      assert.ok(index >= 0 && index + 2 < indices.length);
      const tri = new T.Triangle(
          ...[0, 1, 2].map((n) =>
            new T.Vector3().fromArray(positions, indices[index + n] * 3),
          ),
        ),
        point = new T.Vector3(...instance.position),
        closest = tri.closestPointToPoint(point, new T.Vector3());
      assert.ok(point.distanceTo(closest) < 0.000002, p.code + " skin contact");
    }
});
