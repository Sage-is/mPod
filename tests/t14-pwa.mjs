// Spec 34: installable app. Lighthouse is not available, so each requirement is checked directly.
// The offline and update sections serve a copy of the app on its own port, then stop that server, so
// "no network" is real and no service worker reaches the origin other suites use.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { precacheList, precacheVersion } from "../dev/build-sw.mjs";
import { VERSION } from "../src/version.js";
import { BASE, boot, CLEAR_STORED, driver, sleep, T, waitFor } from "./h.mjs";

const { browser, page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await fn();
  await page.resetSection();
};
const P = "document.querySelector('pod-player')";
const root = `${P}.shadowRoot`;
const PRODUCT = BASE + "app/";
const COPY_PORT = Number(process.env.COPY_PORT ?? 8533);
const COPY = `http://127.0.0.1:${COPY_PORT}/app/`;
const OFFLINE_DIR = "work/pwa-copy";
const TONE = readFileSync("fixtures/audio/tone-0.wav").toString("base64");

const element = () => waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 5000);
const open = async (url = PRODUCT) => {
  await page.send("Page.bringToFront");
  await page.send("Page.navigate", { url });
  await sleep(100);
  await element();
  await waitFor(async () => (await d.state().catch(() => null))?.view === "list", 4000);
};
const state = () => d.state();
const titles = async () => (await state()).rows.map((r) => r.text);
const pick = async (text) => {
  const rows = (await state()).rows;
  const at = rows.findIndex((r) => r.text === text);
  if (at < 0) throw new Error(`no row ${text} in ${rows.map((r) => r.text)}`);
  let sel = rows.findIndex((r) => r.selected);
  while (sel < at) { await d.key("ArrowDown"); sel++; }
  while (sel > at) { await d.key("ArrowUp"); sel--; }
  await d.key("ArrowRight");
  await sleep(280);
};
const focusRing = async () => { await d.press("menu"); await sleep(280); };

function serveCopy() {
  rmSync(OFFLINE_DIR, { recursive: true, force: true });
  mkdirSync(OFFLINE_DIR, { recursive: true });
  for (const name of ["index.html", "sw.js", "sw-precache.js", "manifest.webmanifest", "src", "icons", "dev", "fixtures"]) cpSync(name, join(OFFLINE_DIR, name), { recursive: true });
  return startCopy();
}
async function startCopy() {
  const proc = spawn(process.execPath, [join(OFFLINE_DIR, "dev/serve.mjs"), String(COPY_PORT)], { stdio: "ignore" });
  await waitFor(() => fetch(COPY).then((r) => r.ok, () => false), 3000);
  return proc;
}
const swReady = () => page.evaluate("navigator.serviceWorker.ready.then((r)=>r.active.state)");
const activated = () => waitFor(() => page.evaluate(`navigator.serviceWorker.getRegistration().then((r)=>r?.active?.state==="activated")`), 8000);

try {
  await section("manifest", async () => {
    const m = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
    t.eq("names", [m.name, m.short_name, m.id], ["mPod", "mPod", "mpod"]);
    t.eq("relative start and scope", [m.start_url, m.scope], [".", "."]);
    t.eq("window", [m.display, m.orientation, m.background_color, m.theme_color], ["fullscreen", "any", "#1f1f1f", "#1f1f1f"]);
    t.eq("no screenshots or shortcuts", ["screenshots" in m, "shortcuts" in m], [false, false]);
    t.eq("icons", m.icons.map((i) => [i.sizes, i.purpose]), [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]]);
    for (const icon of m.icons) {
      const png = readFileSync(icon.src);
      t.eq(`${icon.src} is a real PNG of its size`, [png.toString("latin1", 1, 4), png.readUInt32BE(16), png.readUInt32BE(20)], ["PNG", Number(icon.sizes.split("x")[0]), Number(icon.sizes.split("x")[1])]);
    }
    await open();
    t.eq("linked from the page", await page.evaluate(`[document.querySelector('link[rel=manifest]')?.getAttribute('href'), document.querySelector('meta[name=theme-color]')?.content, !!document.querySelector('link[rel=apple-touch-icon]'), document.querySelector('link[rel=icon]')?.getAttribute('href')]`), ["manifest.webmanifest", "#1f1f1f", true, "icons/favicon.png"]);
    const parsed = await page.send("Page.getAppManifest");
    t.eq("Chrome parses it with no errors", parsed.errors, []);
    await activated();
    const install = await page.send("Page.getInstallabilityErrors").catch((e) => ({ failed: e.message }));
    console.log("    installability:", JSON.stringify(install));
    t.eq("Chrome reports no installability errors", install.installabilityErrors, []);
    await page.send("Page.navigate", { url: "about:blank" });
    await sleep(100);
  });

  await section("precache", async () => {
    const generated = readFileSync("sw-precache.js", "utf8");
    const { version, files } = JSON.parse(generated.slice(generated.indexOf("{"), generated.lastIndexOf("}") + 1));
    t.eq("list matches what the builder finds", files, precacheList());
    t.eq("every src file on disk is listed", readdirSync("src").filter((f) => /\.(js|ttf)$/.test(f)).filter((f) => !files.includes(`src/${f}`)), []);
    t.eq("every icon is listed", readdirSync("icons").filter((f) => !files.includes(`icons/${f}`)), []);
    t.eq("page, manifest and font listed", ["index.html", "manifest.webmanifest", "src/pod-screen.ttf"].every((f) => files.includes(f)), true);
    t.eq("version is the hash of the current contents: rerun dev/build-sw.mjs if this fails", version, precacheVersion(files));
    t.eq("the running code states the same version", VERSION, version.slice(0, 8));
    t.eq("version.js is outside the hash", precacheVersion(files.filter((f) => f !== "src/version.js")), version);
  });

  await section("about", async () => {
    await open();
    await page.evaluate(CLEAR_STORED);
    await open();
    await sleep(2100);
    await focusRing();
    await pick("About");
    const rows = async () => (await state()).rows.map((r) => [r.text, r.value]);
    t.eq("true values only", await rows(), [["mPod", null], ["Songs", "0"], ["Library", "0 MB"], ["Version", VERSION]]);
    t.eq("library total", await page.evaluate(`(() => {
      const { songs } = ${P}.importer;
      songs.push({ size: 2_540_000_000 }, { size: 1_000_000 });
      const total = ${P}.importer.librarySize;
      songs.length = 0;
      return [total, ${P}.strings.bytes(total), ${P}.strings.bytes(84_260_000)];
    })()`), [2_541_000_000, "2.5 GB", "84.3 MB"]);
  });

  await section("test-page", async () => {
    await page.send("Storage.clearDataForOrigin", { origin: BASE.slice(0, -1), storageTypes: "service_workers,cache_storage" });
    await page.goto(BASE);
    await sleep(600);
    t.eq("the test page registers no service worker", await page.evaluate("navigator.serviceWorker.getRegistrations().then((r)=>r.length)"), 0);
  });

  await section("offline", async () => {
    let server = await serveCopy();
    try {
      await page.send("Storage.clearDataForOrigin", { origin: new URL(COPY).origin, storageTypes: "service_workers,cache_storage,indexeddb,file_systems" });
      await open(COPY);
      t.ok("worker activates", await activated());
      const scope = await page.evaluate("navigator.serviceWorker.getRegistration().then((r)=>r.scope)");
      t.eq("scope is the app's own path", scope, COPY);
      const cached = await page.evaluate("caches.keys().then((k)=>Promise.all(k.map((n)=>caches.open(n).then((c)=>c.keys()).then((q)=>[n,q.length]))))");
      t.eq("one versioned cache", [cached.length, cached[0][0].startsWith("mpod-"), cached[0][1]], [1, true, precacheList().length]);

      console.log("# a folder linked while online, to play with no network");
      await page.evaluate(`(async () => {
        const tone = Uint8Array.from(atob("${TONE}"), (c) => c.charCodeAt(0));
        const root = await navigator.storage.getDirectory();
        await root.removeEntry("Off", { recursive: true }).catch(() => {});
        const top = await root.getDirectoryHandle("Off", { create: true });
        const alb = await (await top.getDirectoryHandle("Art", { create: true })).getDirectoryHandle("Alb", { create: true });
        const w = await (await alb.getFileHandle("01 Tone.wav", { create: true })).createWritable();
        await w.write(tone); await w.close();
        await ${P}.linkFolder(top);
        return 1;
      })()`);

      server.kill();
      await sleep(300);
      t.eq("the server really is gone", await fetch(COPY).then(() => true, () => false), false);
      await page.send("Network.enable");
      const failed = [];
      browser.on((m) => { if (m.method === "Network.loadingFailed") failed.push(m.params); });
      logs.length = 0;
      await open(COPY);
      const s = await state();
      t.eq("starts with no network", [s.view, s.title], ["list", "mPod"]);
      t.eq("no failed load", failed.length, 0);
      t.eq("no offline overlay, no catalogue", await page.evaluate(`[${root}.querySelector('.offline').hidden, ${P}.hasAttribute("catalogue-url")]`), [true, false]);
      t.eq("font came from the cache", await page.evaluate("document.fonts.ready.then(()=>document.fonts.check('26px PodScreen'))"), true);
      await focusRing();
      await pick("Browse");
      await pick("Songs");
      await d.press("select");
      t.ok("a linked folder plays with no network", await waitFor(async () => (await state()).nowPlaying?.playing, 3000));
      await page.send("Page.navigate", { url: COPY + "some/deep/link" });
      await sleep(400);
      await element();
      await waitFor(async () => (await state()).view === "list", 3000);
      t.eq("a deeper navigation falls back to the cached page, at the app's own path", [await page.evaluate("location.pathname + '|' + document.title"), (await state()).title], ["/app/|mPod", "mPod"]);
      const entries = await page.evaluate("caches.keys().then((k)=>Promise.all(k.map((n)=>caches.open(n).then((c)=>c.keys()).then((q)=>q.map((r)=>r.url))))).then((a)=>a.flat())");
      t.eq("nothing but the precache was cached", entries.filter((u) => !precacheList().some((f) => u.endsWith(f))), []);
      t.eq("no blob or audio in any cache", entries.filter((u) => /blob:|\.wav|fixtures/.test(u)), []);
      t.eq("console clean", logs, []);

      console.log("# new version");
      server = await startCopy();
      await open(COPY);
      await activated();
      const before = await page.evaluate("caches.keys()");
      writeFileSync(join(OFFLINE_DIR, "sw-precache.js"), readFileSync(join(OFFLINE_DIR, "sw-precache.js"), "utf8").replace(/"version": "[0-9a-f]+"/, '"version": "0123456789abcdef"'));
      await page.evaluate("navigator.serviceWorker.getRegistration().then((r)=>r.update()).then(()=>1)");
      t.ok("installs quietly", await waitFor(() => page.evaluate(`navigator.serviceWorker.getRegistration().then((r)=>r.waiting?.state==="installed")`), 5000));
      t.eq("the running page shows no prompt", (await state()).view, "list");
      t.eq("old cache stays until the next start", (await page.evaluate("caches.keys()")).includes(before[0]), true);
      await page.send("Page.navigate", { url: "about:blank" });
      await sleep(400);
      await open(COPY);
      t.ok("used on the next start", await waitFor(async () => (await page.evaluate("navigator.serviceWorker.controller?.scriptURL ? caches.keys() : []")).includes("mpod-0123456789abcdef"), 4000));
      t.ok("old cache deleted on activate", await waitFor(async () => (await page.evaluate("caches.keys()")).length === 1, 4000));
      await page.evaluate(`navigator.storage.getDirectory().then((r)=>r.removeEntry("Off",{recursive:true})).then(()=>1)`).catch(() => {});
      await page.evaluate(CLEAR_STORED);
    } finally {
      server.kill();
    }
  });

  await section("layout", async () => {
    await page.send("Storage.clearDataForOrigin", { origin: BASE.slice(0, -1), storageTypes: "service_workers,cache_storage" });
    await open();
    await page.evaluate("window.__marker=1");
    const size = async (width, height) => {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 3, mobile: true });
      await sleep(400);
      return page.evaluate(`(()=>{const e=document.documentElement;const b=${root}.querySelector('.device').getBoundingClientRect();
        return {x:b.left,right:b.right,y:b.top,bottom:b.bottom,sw:e.scrollWidth,sh:e.scrollHeight,cw:e.clientWidth,ch:e.clientHeight,bodySh:document.body.scrollHeight,mainSh:document.querySelector('main').scrollHeight,wheel:${P}.getWheelRect().width}})()`);
    };
    const views = [["fold, inner", 884, 1104], ["fold, inner, wide", 1104, 884], ["fold, outer", 344, 882], ["fold, outer, on its side", 882, 344], ["phone", 390, 844], ["small phone", 320, 568], ["phone on its side", 844, 390], ["desktop", 1280, 800], ["small window", 500, 400]];
    for (const [name, w, h] of views) {
      const r = await size(w, h);
      const inside = r.x >= 0 && r.right <= w && r.y >= 0 && r.bottom <= h;
      t.ok(`${name} ${w}x${h}: device fits`, inside, JSON.stringify(r));
      t.eq(`${name}: no page scroll`, [r.sw, r.sh, r.bodySh], [w, h, h]);
      console.log(`    wheel ${Math.round(r.wheel)} px`);
    }
    t.eq("rescaled with no reload", await page.evaluate("window.__marker"), 1);
    t.eq("no overscroll, no pull to refresh", await page.evaluate("[getComputedStyle(document.documentElement).overscrollBehaviorY, getComputedStyle(document.body).overscrollBehaviorY]"), ["none", "none"]);
    await size(390, 844);
    await d.shot("pwa-phone");
    const safe = await page.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 40, topMax: 40, bottom: 30, bottomMax: 30, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).then(() => true, () => false);
    if (safe) {
      await sleep(400);
      const r = await size(390, 844);
      t.ok("safe areas stay clear", r.y >= 40 && r.bottom <= 844 - 30, JSON.stringify(r));
      await page.send("Emulation.setSafeAreaInsetsOverride", { insets: {} }).catch(() => {});
    } else {
      console.log("    safe area override unavailable: not run");
    }
  });

  await section("touch", async () => {
    const screen = async (width, height) => page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 3, mobile: true });
    await screen(390, 844);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__buzz = [];
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: (ms) => { window.__buzz.push([ms, performance.now()]); return true; } });
      window.__scrolled = 0;
      addEventListener("scroll", () => { window.__scrolled++; }, true);` });
    await page.evaluate(CLEAR_STORED);
    await open();
    await page.evaluate(`window.__types=[];${P}.shadowRoot.addEventListener("pointerdown",(e)=>__types.push(e.pointerType),true);0`);
    const rect = () => d.rect();
    const touch = (type, points) => page.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const down = (x, y) => touch("touchStart", [{ x, y, id: 1 }]);
    const move = (x, y) => touch("touchMove", [{ x, y, id: 1 }]);
    const up = () => touch("touchEnd", []);
    const tap = async (x, y, ms = 30) => { await down(x, y); await sleep(ms); await up(); await sleep(60); };
    const turn = async (cx, cy, radius, from, sweep, steps = 24) => {
      const at = (a) => [cx + radius * Math.sin(a * Math.PI / 180), cy - radius * Math.cos(a * Math.PI / 180)];
      await down(...at(from));
      for (let i = 1; i <= steps; i++) { await move(...at(from + sweep * i / steps)); await sleep(8); }
      await up();
      await sleep(60);
    };

    let r = await rect();
    await d.press("menu").catch(() => {});
    await sleep(200);
    await page.evaluate("window.__types.length=0;0");
    await tap(r.cx, r.cy - 0.447 * r.width);
    t.eq("input really is touch", await page.evaluate("[...new Set(window.__types)]"), ["touch"]);

    console.log("# wheel");
    await page.evaluate("window.__buzz.length=0;0");
    await turn(r.cx, r.cy, 0.27 * r.width, 0, 95);
    t.ok("a finger turns the ring", (await d.sel()) > 0, await d.sel());
    t.eq("the turn did not fire a tap", (await state()).title, "mPod");
    t.eq("no scrolling", await page.evaluate("[window.__scrolled, scrollY, document.querySelector('main').scrollTop]"), [0, 0, 0]);
    // Spec 50: the ring is no switch, so every tick of a turn is the wheel's.
    const buzz = await page.evaluate("window.__buzz");
    t.ok("haptic tick per detent, 4 ms", buzz.length >= 2 && buzz.every(([ms]) => ms === 4), JSON.stringify(buzz));
    const sel = await d.sel();
    await turn(r.cx, r.cy, 0.447 * r.width, 180, -95);
    t.ok("a finger starting on the outer band turns it too", (await d.sel()) !== sel, await d.sel());
    t.eq("that press did not fire Play/Pause", (await state()).view, "list");
    const sel2 = await d.sel();
    await down(r.cx, r.cy);
    for (let i = 1; i <= 16; i++) { await move(r.cx + 0.27 * r.width * Math.sin(i / 3), r.cy - 0.27 * r.width * Math.cos(i / 3)); await sleep(8); }
    await up(); await sleep(80);
    t.eq("a press on Select that becomes a drag does not select", (await state()).title, "mPod");
    t.ok("and it turned instead", (await d.sel()) !== sel2, sel2);

    console.log("# tap");
    await page.evaluate(`${root}.querySelector('.ring').focus({preventScroll:true});0`);
    await pick("Playlists");
    t.eq("help on empty list", (await state()).title, "Playlists");
    r = await rect();
    await tap(r.cx, r.cy - 0.447 * r.width);
    await sleep(280);
    t.eq("tap on Menu works at once", (await state()).title, "mPod");
    await page.evaluate("window.__t=0");
    await tap(r.cx, r.cy, 20);
    await sleep(280);
    t.ok("tap on Select works", (await state()).title !== "mPod");
    // Spec 50: the wheel only turns, so a still touch on the ring presses nothing.
    const opened = (await state()).title;
    await page.evaluate(`window.__pressed=[];const press=${P}.press.bind(${P});${P}.press=(n)=>{__pressed.push(n);press(n)};0`);
    const ring = 0.32 * r.width;
    for (const [x, y] of [[0, -ring], [ring, 0], [0, ring], [-ring, 0]]) await tap(r.cx + x, r.cy + y);
    await sleep(280);
    t.eq("a still touch on the ring presses nothing", [await page.evaluate("window.__pressed"), (await state()).title], [[], opened]);
    const band = 0.447 * r.width;
    for (const [x, y] of [[0, -band], [band, 0], [0, band], [-band, 0]]) await tap(r.cx + x, r.cy + y);
    t.eq("each outer button is pressed on its own area", await page.evaluate("window.__pressed"), ["menu", "forward", "play", "back"]);

    console.log("# hold");
    await page.evaluate("window.__pressed.length=0;0");
    const lit = (await state()).backlit;
    await down(r.cx, r.cy - 0.447 * r.width); await sleep(1100); await up(); await sleep(100);
    t.eq("hold on Menu toggles the backlight", [(await state()).backlit, (await state()).title], [!lit, "mPod"]);
    // A touch is activity, which lights the backlight, so count the holds that fire instead.
    await page.evaluate(`window.__fired=0;const fire=${P}.buttons.fire.bind(${P}.buttons);${P}.buttons.fire=(...a)=>{__fired++;fire(...a)};0`);
    await down(r.cx, r.cy - 0.32 * r.width); await sleep(1100); await up(); await sleep(100);
    t.eq("a hold on the ring does nothing", [await page.evaluate("window.__fired"), await page.evaluate("window.__pressed"), (await state()).title], [0, [], "mPod"]);
    await down(r.cx, r.cy - 0.447 * r.width); await sleep(1100); await up(); await sleep(100);

    console.log("# drag off a hold");
    await down(r.cx, r.cy - 0.447 * r.width);
    await sleep(100);
    await move(r.cx + 60, r.cy - 0.2 * r.width);
    await sleep(1100);
    await up(); await sleep(100);
    t.eq("moving cancels the hold", (await state()).backlit, lit);

    console.log("# haptic rate");
    await page.evaluate(`window.__buzz.length=0;for(let i=0;i<200;i++)${P}.click(1);0`);
    t.eq("only one call in one burst", await page.evaluate("window.__buzz.length"), 1);
    await page.evaluate(`window.__buzz.length=0;window.__spam=setInterval(()=>${P}.click(1),2);0`);
    await sleep(1000);
    const rate = await page.evaluate("clearInterval(__spam);window.__buzz.length");
    console.log(`    ${rate} calls in 1 s of constant turning`);
    t.ok("limited to 25 per second", rate >= 15 && rate <= 25, rate);
    await page.evaluate(`window.__buzz.length=0;0`);
    await page.evaluate(`${P}.settings.set("clicker","off");0`);
    await sleep(50);
    await page.evaluate(`${P}.click(1);0`);
    t.eq("none with Clicker off", await page.evaluate("window.__buzz.length"), 0);

    console.log("# targets at the smallest scale");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 882, height: 344, deviceScaleFactor: 3, mobile: true });
    await sleep(500);
    const m = await page.evaluate(`(()=>{const w=${P}.getWheelRect().width;const q=(s)=>${root}.querySelector(s).offsetWidth*w/${root}.querySelector('.wheel').offsetWidth;return {select:q('.select'),wheel:w,ring:q('.ring')}})()`);
    console.log("    " + JSON.stringify(m));
    t.ok("Select at least 44 px", m.select >= 44, m.select);
    // Spec 50 makes the outer band the only place to press the four buttons, as on a 1G iPod.
    console.log(`    the outer band is ${Math.round((m.wheel - m.ring) / 2)} px deep here`);
    const small = await rect();
    await tap(small.cx, small.cy - 0.447 * small.width);
    await tap(small.cx, small.cy - 0.447 * small.width);
    await sleep(280);
    t.eq("taps on Menu work at that scale", (await state()).title, "mPod");
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    t.eq("console clean", logs, []);
  });

  await section("test-page-touch", async () => {
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 2, mobile: false });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__buzz=0;Object.defineProperty(navigator,"vibrate",{configurable:true,value:()=>{window.__buzz++;return true}});` });
    await page.evaluate("localStorage.clear()");
    await page.goto(BASE);
    await sleep(2150);
    const r = await d.rect();
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.cx, y: r.cy - 0.3 * r.width, id: 1 }] });
    await sleep(30);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(100);
    await d.key("ArrowDown");
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    t.eq("no ring tap and no haptics without import", [await page.evaluate("window.__buzz"), (await state()).title], [0, "Pod"]);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 2, mobile: false });
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
