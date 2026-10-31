// Scenario harness for the build side. Run after starting dev/serve.mjs on 8432.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, sleep } from "../dev/cdp.mjs";

// Scratch output and fixtures are named from the project root, whatever the caller's directory.
process.chdir(join(dirname(fileURLToPath(import.meta.url)), ".."));

export const BASE = "http://127.0.0.1:8432/";
export { sleep };
const SCHEME = process.env.SCHEME ?? "dark";

export async function boot() {
  const { browser, close } = await launch({ port: 9334, profile: "work/chrome" });
  const page = await openPage(browser, BASE);
  const logs = [];
  // Spec 01: the page may report dark. Pin it, so results do not follow the time of day,
  // and keep it pinned when a section resets its other media features.
  const send = page.send;
  const injected = [];
  page.send = async (method, params) => {
    if (method === "Emulation.setEmulatedMedia") {
      const features = params.features ?? [];
      const pinned = features.some((f) => f.name === "prefers-color-scheme");
      return send(method, { features: pinned ? features : [...features, { name: "prefers-color-scheme", value: SCHEME }] });
    }
    const out = await send(method, params);
    if (method === "Page.addScriptToEvaluateOnNewDocument") injected.push(out.identifier);
    return out;
  };
  page.resetSection = async () => {
    for (const identifier of injected.splice(0)) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    await page.send("Emulation.setEmulatedMedia", { features: [] });
  };
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  await page.send("Log.enable");
  browser.on((m) => {
    if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) logs.push(m.params.type + " " + m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") { if (!String(m.params.entry.url).endsWith("favicon.ico")) logs.push("LOG " + m.params.entry.text + " " + (m.params.entry.url ?? "")); }
  });
  return { browser, page, close, logs };
}

export function driver(page) {
  const d = {
    state: () => page.evaluate("document.querySelector('pod-player').debugState()"),
    fresh: async ({ waitBoot = true, clear = true, before } = {}) => {
      if (clear) {
        await page.evaluate("localStorage.clear()");
      }
      await page.send("Page.bringToFront");
      if (before) await before();
      await page.goto(BASE);
      if (waitBoot) await sleep(2150);
    },
    rect: async () => {
      const r = await page.evaluate("document.querySelector('pod-player').getWheelRect()");
      return { ...r, cx: r.x + r.width / 2, cy: r.y + r.width / 2 };
    },
    press: async (name, ms = 30) => {
      const r = await d.rect();
      const off = 0.447 * r.width;
      const p = { select: [0, 0], menu: [0, -off], back: [-off, 0], forward: [off, 0], play: [0, off] }[name];
      await page.click(r.cx + p[0], r.cy + p[1], ms);
      await sleep(40);
    },
    rotate: async (deg, { steps, stepMs } = {}) => {
      const r = await d.rect();
      const n = steps ?? Math.max(6, Math.round(Math.abs(deg) / 4));
      await page.rotate(r.cx, r.cy, 0.27 * r.width, 0, deg, n, stepMs ?? Math.round((Math.abs(deg) / 350 * 1000) / n));
      await sleep(40);
    },
    key: async (key, code) => { await page.key(key, code ?? key); await sleep(30); },
    keyDown: (key) => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key }),
    keyUp: (key) => page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key }),
    shot: async (name) => { writeFileSync(`work/${name}.png`, await page.screenshot()); },
    sel: async () => (await d.state()).rows.findIndex((r) => r.selected),
    timed: async (check, ms) => {
      const start = Date.now();
      await waitFor(check, ms);
      return Date.now() - start;
    },
  };
  return d;
}

export class T {
  pass = 0;
  fail = [];
  eq(label, got, want) {
    const a = JSON.stringify(got), b = JSON.stringify(want);
    if (a === b) { this.pass++; console.log("  ok  ", label); }
    else { this.fail.push(label); console.log("  FAIL", label, "got", a, "want", b); }
  }
  ok(label, cond, extra = "") {
    if (cond) { this.pass++; console.log("  ok  ", label); }
    else { this.fail.push(label); console.log("  FAIL", label, extra); }
  }
  crash(e) { this.fail.push("crash"); console.log("CRASH", e); }
  done() { console.log(`\n${this.pass} passed, ${this.fail.length} failed`); this.fail.forEach((f) => console.log(" -", f)); }
  get exitCode() { return this.fail.length ? 1 : 0; }
}

export async function waitFor(check, ms, step = 20) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(step);
  }
  return !!(await check());
}
