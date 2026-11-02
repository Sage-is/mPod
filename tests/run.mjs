// Runs every suite, a few side by side, starting and stopping the dev server around them.
//   node tests/run.mjs            all suites
//   node tests/run.mjs t8 t10     suites whose name contains a word given
//   node tests/run.mjs --jobs 1   one suite at a time, in list order, with live output
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// --jobs comes off the command line here, so that only filter words reach the list below.
const jobsAt = process.argv.indexOf("--jobs");
const jobs = jobsAt < 0 ? Math.min(4, Math.max(1, availableParallelism() >> 1)) : Number(process.argv.splice(jobsAt, 2)[1]);
if (!Number.isInteger(jobs) || jobs < 1) {
  console.error("--jobs needs a whole number above 0");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const SUITES = ["brick-vectors", "tags-unit", "font-unit", "smoke", "t1-nav", "t2-play", "t3-states", "t4-brick", "t5-misc",
  "t6-more", "t7-last", "t8-import", "t9-idle-timing", "t10-no-catalogue", "t11-font",
  "t12-library", "t13-name", "t14-pwa", "t15-media", "extras-unit", "t16-one-window", "t17-resume", "t18-main-menu",
  "t19-sound-look", "t20-extras", "t21-power", "review-unit", "dates-unit", "t22-review-playback", "t23-review-library"];
const words = process.argv.slice(2);
const chosen = SUITES.filter((name) => !words.length || words.some((w) => name.includes(w)));
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const up = () => fetch("http://127.0.0.1:8532/").then((r) => r.ok, () => false);
// Suites that must run alone after the pool. See "Parallel runs" in tests/README.md before adding one.
const SERIAL = new Set([]);

await import("./gen-samples.mjs"); // Written once, here, so that no suite can wipe them under another.
process.env.SAMPLES_READY = "1";
mkdirSync("work/logs", { recursive: true });

let server = null;
if (!(await up())) {
  server = spawn(process.execPath, ["dev/serve.mjs", "8532"], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await up()); i++) await sleep(100);
}

// The next suite on a worker needs its port and profile, and a suite that crashed never closed Chrome.
async function stopChrome(worker) {
  const flag = `remote-debugging-port=${9434 + worker}`;
  spawnSync("pkill", ["-f", flag]);
  for (let i = 0; i < 50 && spawnSync("pgrep", ["-f", flag]).status === 0; i++) await sleep(100);
  spawnSync("pkill", ["-9", "-f", flag]);
}

const results = [];
async function runSuite(name, worker) {
  await stopChrome(worker);
  // The queue changes who follows whom, so no suite may inherit a profile from the one before.
  const profile = `work/chrome-${worker}`;
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  // A file, not a pipe: suites end in process.exit, which drops whatever a pipe has not yet taken.
  const log = `work/logs/${name}.log`;
  const live = jobs === 1;
  const out = live ? "inherit" : openSync(log, "w");
  if (live) console.log(`\n=== ${name}`);
  const start = Date.now();
  const proc = spawn(process.execPath, [`tests/${name}.mjs`], {
    stdio: ["ignore", out, out],
    timeout: 600000,
    env: { ...process.env, CHROME_PORT: `${9434 + worker}`, CHROME_PROFILE: profile, COPY_PORT: `${8533 + worker}` },
  });
  const [status] = await once(proc, "close");
  results.push({ name, ok: status === 0, seconds: Math.round((Date.now() - start) / 1000) });
  if (live) return;
  closeSync(out);
  process.stdout.write(`\n=== ${name}\n${readFileSync(log)}`);
}
const drain = async (queue, worker) => { while (queue.length) await runSuite(queue.shift(), worker); };

const alone = jobs === 1 ? [] : chosen.filter((name) => SERIAL.has(name));
const pool = chosen.filter((name) => !alone.includes(name));
await Promise.all(Array.from({ length: jobs }, (_, worker) => drain(pool, worker)));
await drain(alone, 0);
server?.kill();
for (let worker = 0; worker < jobs; worker++) await stopChrome(worker);
results.sort((a, b) => chosen.indexOf(a.name) - chosen.indexOf(b.name));
console.log("\n=== summary");
for (const { name, ok, seconds } of results) console.log(`${ok ? "pass" : "FAIL"}  ${name}  ${seconds}s`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1; // process.exit could drop output still on its way to a pipe.
