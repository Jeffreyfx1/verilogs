// Nitro bundles @electric-sql/pglite into the server chunk, but the Postgres
// data/wasm files stay beside the original package. The bundled loader then
// looks for them next to the chunk and crashes on preview (ENOENT pglite.data).
// Copy them next to every bundled pglite module after the build.
import { copyFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const roots = [join(root, ".vercel/output"), join(root, ".output")];

async function walk(dir, hits) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, hits);
    else if (/pglite.*\.mjs$/i.test(entry.name)) hits.add(dirname(path));
  }
}

let copied = 0;
for (const dir of roots) {
  const hits = new Set();
  await walk(dir, hits);
  for (const dest of hits) {
    for (const file of files) {
      await copyFile(join(srcDir, file), join(dest, file));
    }
    copied += 1;
    console.log("[pglite] assets beside", dest);
  }
}
if (!copied) console.log("[pglite] no bundled pglite chunk; skipped");
