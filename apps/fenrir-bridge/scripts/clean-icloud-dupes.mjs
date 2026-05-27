#!/usr/bin/env node
import { readdir, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const NODE_MODULES = join(ROOT, "node_modules");
const DUPE = / \d+$/;

let removed = 0;

async function walk(dir, depth) {
  if (depth > 5) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (DUPE.test(e.name)) {
      await rm(full, { recursive: true, force: true });
      removed++;
      console.log(`  removed ${full.replace(ROOT + "/", "")}`);
      continue;
    }
    if (e.isDirectory() && (e.name.startsWith("@") || depth < 2)) {
      await walk(full, depth + 1);
    }
  }
}

try { await stat(NODE_MODULES); } catch { process.exit(0); }
await walk(NODE_MODULES, 0);
if (removed > 0) {
  console.log(`clean-icloud-dupes: removed ${removed} entr${removed === 1 ? "y" : "ies"}`);
} else {
  console.log("clean-icloud-dupes: nothing to remove");
}
