// Writes dist/: exactly the files the app ships, ready for any static host.
//   node dev/build-dist.mjs
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { precacheList } from "./build-sw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
// The share card and robots.txt ship but stay out of the offline cache.
const files = [...precacheList(), "sw.js", "sw-precache.js", "_headers", "robots.txt", "share-card.png"];

rmSync(dist, { recursive: true, force: true });
for (const file of files) cpSync(join(root, file), join(dist, file));
console.log(`dist: ${files.length} files`);
