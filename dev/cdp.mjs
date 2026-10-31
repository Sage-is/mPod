// Minimal Chrome DevTools client on Node's built-in WebSocket. No npm packages.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch({ port = 9333, profile, width = 1000, height = 900 }) {
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check",
    "--mute-audio", `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    await new Promise((r) => setTimeout(r, 200));
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!version) throw new Error("Chrome did not start");
  const browser = await connect(version.webSocketDebuggerUrl);
  return { browser, close: async () => { proc.kill(); } };
}

export function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else {
        listeners.forEach((fn) => fn(msg));
      }
    };
    ws.onerror = reject;
    ws.onopen = () => resolve({
      send: (method, params = {}, sessionId) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
      }),
      on: (fn) => listeners.push(fn),
    });
  });
}

export async function openPage(browser, url) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p) => browser.send(m, p, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  const page = {
    send,
    evaluate: async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    goto: async (u) => {
      await send("Page.navigate", { url: u });
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        if (await page.evaluate("document.documentElement.dataset.ready === '1'").catch(() => false)) return;
      }
      throw new Error("page did not become ready: " + u);
    },
    key: async (key, code = key, windowsVirtualKeyCode = 0) => {
      const base = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    },
    mouse: (type, x, y, buttons = 0) => send("Input.dispatchMouseEvent",
      { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1, pointerType: "mouse" }),
    click: async (x, y, holdMs = 30) => {
      await page.mouse("mouseMoved", x, y);
      await page.mouse("mousePressed", x, y, 1);
      await sleep(holdMs);
      await page.mouse("mouseReleased", x, y);
    },
    // Rotates around (cx, cy) from startDeg by sweepDeg; 0 is 12 o'clock, positive is clockwise.
    rotate: async (cx, cy, radius, startDeg, sweepDeg, steps = 24, stepMs = 8) => {
      const at = (d) => [cx + radius * Math.sin(d * Math.PI / 180), cy - radius * Math.cos(d * Math.PI / 180)];
      const [sx, sy] = at(startDeg);
      await page.mouse("mouseMoved", sx, sy);
      await page.mouse("mousePressed", sx, sy, 1);
      for (let i = 1; i <= steps; i++) {
        const [x, y] = at(startDeg + sweepDeg * i / steps);
        await page.mouse("mouseMoved", x, y, 1);
        await sleep(stepMs);
      }
      const [ex, ey] = at(startDeg + sweepDeg);
      await page.mouse("mouseReleased", ex, ey);
    },
    screenshot: async () => Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"),
  };
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 2, mobile: false });
  await page.goto(url);
  return page;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const workDir = (root) => join(root, "work");
