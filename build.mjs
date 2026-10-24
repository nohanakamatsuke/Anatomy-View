import { cp, mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { prepareRender } from "./scripts/prepare-render.mjs";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await cp("public", "dist", { recursive: true });
await prepareRender("dist");
const hash = createHash("sha256");
async function fingerprint(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await fingerprint(file);
    else {
      hash.update(file);
      hash.update(await readFile(file));
    }
  }
}
await fingerprint("public");
hash.update(await readFile("scripts/prepare-render.mjs"));
hash.update(await readFile("dist/models/atlas.json"));
const version = hash.digest("hex").slice(0, 16);
const sw = await readFile("dist/sw.js", "utf8");
await writeFile("dist/sw.js", sw.replace("__BUILD__", version));
console.log("Built anatomy PWA in dist/, version " + version);
