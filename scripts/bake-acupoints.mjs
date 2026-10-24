// Reproject licensed teaching seeds to this repository's original BodyParts3D skin.
// This validates mesh contact only; it does not validate clinical point locations.
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import * as T from "../public/vendor/three.module.js";
const input = process.argv[2] || "data/acupoint-seeds.json";
const catalog = JSON.parse(await readFile(input)),
  atlas = JSON.parse(await readFile("public/models/atlas.json"));
const skin = atlas.parts.find((p) => p.id === "FJ2810"),
  raw = gunzipSync(await readFile("public/models/integumentary.bin.gz")),
  buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const geometry = new T.BufferGeometry();
geometry.setAttribute(
  "position",
  new T.BufferAttribute(
    new Float32Array(buffer, skin.positions, skin.vertexCount * 3),
    3,
  ),
);
geometry.setIndex(
  new T.BufferAttribute(
    new Uint32Array(buffer, skin.indices, skin.indexCount),
    1,
  ),
);
geometry.computeBoundingSphere();
const mesh = new T.Mesh(
  geometry,
  new T.MeshBasicMaterial({ side: T.DoubleSide }),
);
mesh.updateMatrixWorld();
const ray = new T.Raycaster(),
  missed = [];
let count = 0,
  maxDistance = 0;
for (const point of catalog.points) {
  const instances = [];
  for (const seed of point.instances) {
    const target = new T.Vector3(...seed.seed),
      normal = new T.Vector3(...seed.seedNormal).normalize();
    ray.set(
      target.clone().addScaledVector(normal, 0.06),
      normal.clone().negate(),
    );
    ray.near = 0;
    ray.far = 0.12;
    const hits = ray
      .intersectObject(mesh, false)
      .filter((hit) => hit.point.distanceTo(target) < 0.025)
      .sort((a, b) => a.point.distanceTo(target) - b.point.distanceTo(target));
    let hit = hits[0];
    // If the seed ray misses a narrow surface, find the nearest original triangle.
    if (!hit) {
      let best = 0.012;
      const a = new T.Vector3(),
        b = new T.Vector3(),
        c = new T.Vector3(),
        closest = new T.Vector3(),
        tri = new T.Triangle();
      for (let i = 0; i < geometry.index.count; i += 3) {
        a.fromBufferAttribute(
          geometry.attributes.position,
          geometry.index.getX(i),
        );
        b.fromBufferAttribute(
          geometry.attributes.position,
          geometry.index.getX(i + 1),
        );
        c.fromBufferAttribute(
          geometry.attributes.position,
          geometry.index.getX(i + 2),
        );
        tri.set(a, b, c);
        tri.closestPointToPoint(target, closest);
        const d = closest.distanceTo(target);
        if (d < best) {
          best = d;
          hit = {
            point: closest.clone(),
            faceIndex: i / 3,
            face: { normal: tri.getNormal(new T.Vector3()) },
          };
        }
      }
    }
    if (!hit) {
      missed.push(point.code + ":" + seed.side);
      continue;
    }
    const n = hit.face.normal.clone().normalize();
    maxDistance = Math.max(maxDistance, hit.point.distanceTo(target));
    instances.push({
      side: seed.side,
      position: hit.point.toArray().map((n) => +n.toFixed(6)),
      normal: n.toArray().map((n) => +n.toFixed(6)),
      meshId: "FJ2810",
      faceIndex: hit.faceIndex,
    });
    count++;
  }
  point.instances = instances;
  if (!instances.length && point.placement !== "intraoral-unmapped")
    point.placement = "surface-unmapped";
}
catalog.anatomy = {
  version: atlas.version,
  skinMesh: "FJ2810",
  skinSha256: JSON.parse(await readFile("public/models/checksums.json"))[
    "integumentary.bin.gz"
  ],
};
await writeFile("public/acupuncture/catalog.json", JSON.stringify(catalog));
console.log(
  JSON.stringify({
    mappedInstances: count,
    unmapped: missed,
    maxProjectionAdjustmentMeters: maxDistance,
  }),
);
