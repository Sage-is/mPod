// Runs every suite in turn, starting and stopping the dev server around them.
//   node tests/run.mjs            all suites
//   node tests/run.mjs t8 t10     suites whose name contains a word given
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const SUITES = ["brick-vectors", "tags-unit", "font-unit", "smoke", "t1-nav", "t2-play", "t3-states", "t4-brick", "t5-misc",
  "t6-more", "t7-last", "t8-import", "t9-idle-timing", "t10-no-catalogue", "t11-font"];
const words = process.argv.slice(2);
const chosen = SUITES.filter((name) => !words.length || words.some((w) => name.includes(w)));
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const up = () => fetch("http://127.0.0.1:8432/").then((r) => r.ok, () => false);

let server = null;
if (!(await up())) {
  server = spawn(process.execPath, ["dev/serve.mjs", "8432"], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await up()); i++) await sleep(100);
}
const results = [];
for (const name of chosen) {
  console.log(`\n=== ${name}`);
  const start = Date.now();
  const { status } = spawnSync(process.execPath, [`tests/${name}.mjs`], { stdio: "inherit", timeout: 600000 });
  results.push({ name, ok: status === 0, seconds: Math.round((Date.now() - start) / 1000) });
  await sleep(600);
}
server?.kill();
spawnSync("pkill", ["-f", "remote-debugging-port=9334"]);
console.log("\n=== summary");
for (const { name, ok, seconds } of results) console.log(`${ok ? "pass" : "FAIL"}  ${name}  ${seconds}s`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
