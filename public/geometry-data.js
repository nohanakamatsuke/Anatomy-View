// Shared by the build pipeline and the browser worker. No DOM or rendering work.
export const GEOMETRY_FORMAT = 1;
const COLORS = {
  skeletal: "#dfd9bf",
  muscular: "#ac6460",
  cardiac: "#b56469",
  respiratory: "#c69baf",
  digestive: "#bc9279",
  urinary: "#b47164",
  nervous: "#d4bca4",
  endocrine: "#c0a7a0",
  lymphatic: "#9aab83",
  arterial: "#b75d62",
  venous: "#648fb7",
  sensory: "#aabdc4",
  connective: "#bbc4b0",
  reproductive: "#b5959b",
  integumentary: "#bca18c",
};
const align = (n) => Math.ceil(n / 4) * 4;
const linear = (n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
export function prepareGeometry(atlas, id, source) {
  const parts = atlas.parts
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.layer === id);
  if (!parts.length) throw Error("モデルに形状がありません");
  const vertexCount = parts.reduce((n, p) => n + p.vertexCount, 0);
  const indexCount = parts.reduce((n, p) => n + p.indexCount, 0);
  const positionOffset = 0,
    normalOffset = align(vertexCount * 12);
  const indexOffset = align(normalOffset + vertexCount * 6);
  const partOffset = align(indexOffset + indexCount * 4);
  const colorOffset = align(partOffset + vertexCount * 2);
  const byteLength = align(colorOffset + vertexCount * 3);
  const layout = {
    format: GEOMETRY_FORMAT,
    vertexCount,
    indexCount,
    positionOffset,
    normalOffset,
    indexOffset,
    partOffset,
    colorOffset,
    byteLength,
    bounds: [
      [Infinity, Infinity, Infinity],
      [-Infinity, -Infinity, -Infinity],
    ],
  };
  for (const p of parts)
    for (let axis = 0; axis < 3; axis++) {
      layout.bounds[0][axis] = Math.min(
        layout.bounds[0][axis],
        p.bounds[0][axis],
      );
      layout.bounds[1][axis] = Math.max(
        layout.bounds[1][axis],
        p.bounds[1][axis],
      );
    }
  const buffer = new ArrayBuffer(byteLength),
    views = geometryViews(buffer, layout);
  let vertex = 0,
    index = 0;
  for (const p of parts) {
    views.positions.set(
      new Float32Array(source, p.positions, p.vertexCount * 3),
      vertex * 3,
    );
    views.normals.set(
      new Int16Array(source, p.normals, p.vertexCount * 3),
      vertex * 3,
    );
    const indices = new Uint32Array(source, p.indices, p.indexCount);
    for (let i = 0; i < indices.length; i++)
      views.indices[index + i] = indices[i] + vertex;
    views.partIndices.fill(p.index, vertex, vertex + p.vertexCount);
    const hex = p.color || COLORS[p.system] || "#bdaf9c";
    const factor = id === "muscular" ? 0.94 + (p.index % 7) * 0.018 : 1;
    const rgb = [1, 3, 5].map((offset) =>
      Math.round(
        Math.min(
          1,
          linear(parseInt(hex.slice(offset, offset + 2), 16) / 255) * factor,
        ) * 255,
      ),
    );
    for (let i = vertex * 3; i < (vertex + p.vertexCount) * 3; i += 3)
      views.colors.set(rgb, i);
    for (let axis = 0; axis < 3; axis++) {
      layout.bounds[0][axis] = Math.min(
        layout.bounds[0][axis],
        p.bounds[0][axis],
      );
      layout.bounds[1][axis] = Math.max(
        layout.bounds[1][axis],
        p.bounds[1][axis],
      );
    }
    vertex += p.vertexCount;
    index += p.indexCount;
  }
  return { buffer, layout };
}
export function geometryViews(buffer, l) {
  if (
    l.format !== GEOMETRY_FORMAT ||
    !(buffer instanceof ArrayBuffer) ||
    buffer.byteLength !== l.byteLength ||
    !Number.isSafeInteger(l.vertexCount) ||
    l.vertexCount <= 0 ||
    !Number.isSafeInteger(l.indexCount) ||
    l.indexCount <= 0 ||
    l.indexCount % 3 !== 0 ||
    !Array.isArray(l.bounds) ||
    l.bounds.length !== 2 ||
    l.bounds.some(
      (b) =>
        !Array.isArray(b) ||
        b.length !== 3 ||
        b.some((n) => !Number.isFinite(n)),
    ) ||
    l.bounds[0].some((n, i) => n > l.bounds[1][i])
  )
    throw Error("表示用モデルの形式が正しくありません");
  return {
    positions: new Float32Array(buffer, l.positionOffset, l.vertexCount * 3),
    normals: new Int16Array(buffer, l.normalOffset, l.vertexCount * 3),
    indices: new Uint32Array(buffer, l.indexOffset, l.indexCount),
    partIndices: new Uint16Array(buffer, l.partOffset, l.vertexCount),
    colors: new Uint8Array(buffer, l.colorOffset, l.vertexCount * 3),
  };
}
