import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { prepareGeometry } from "../public/geometry-data.js";
export async function prepareRender(root) {
  const atlas = JSON.parse(await readFile(root + "/models/atlas.json", "utf8"));
  const checksums = JSON.parse(
    await readFile(root + "/models/checksums.json", "utf8"),
  );
  for (const layer of atlas.layers) {
    const compressed = await readFile(root + "/" + layer.url);
    const expected = checksums[layer.url.split("/").pop()];
    if (createHash("sha256").update(compressed).digest("hex") !== expected)
      throw Error("Model integrity mismatch: " + layer.id);
    const raw = gunzipSync(compressed),
      source = raw.buffer.slice(
        raw.byteOffset,
        raw.byteOffset + raw.byteLength,
      );
    const { buffer, layout } = prepareGeometry(atlas, layer.id, source),
      gzip = gzipSync(new Uint8Array(buffer), { level: 9 });
    const sha256 = createHash("sha256").update(gzip).digest("hex"),
      file = "render-" + layer.id + "-" + sha256.slice(0, 16) + ".bin.gz";
    await writeFile(root + "/models/" + file, gzip);
    layer.prepared = {
      url: "models/" + file,
      sha256,
      dataSha256: createHash("sha256")
        .update(new Uint8Array(buffer))
        .digest("hex"),
      bytes: buffer.byteLength,
      compressedBytes: gzip.byteLength,
      layout,
    };
  }
  await writeFile(root + "/models/atlas.json", JSON.stringify(atlas));
  return atlas;
}
