import { cp, mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await cp("public", "dist", { recursive: true });
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
const version = hash.digest("hex").slice(0, 16);
const sw = await readFile("dist/sw.js", "utf8");
await writeFile("dist/sw.js", sw.replace("__BUILD__", version));
console.log("Built ANATOMIA static PWA in dist/, version " + version);
