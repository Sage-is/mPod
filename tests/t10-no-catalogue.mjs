// Spec 30: no catalogue-url, and the product page.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import "./gen-samples.mjs";
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
const PRODUCT = BASE + "index.html";
const SAMPLES = resolve("work/samples");
const OFFLINE = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
const ONLINE = { ...OFFLINE, offline: false };

function walk(dir, prefix) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = `${prefix}/${name}`;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ path: rel, b64: readFileSync(full).toString("base64") });
  }
  return out;
}
const MAKE = `window.__mk = (items) => items.map(({ path, b64 }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = new File([bytes], path.split("/").pop(), { lastModified: 1000 });
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}); 0`;

const urls = [];
browser.on((m) => { if (m.method === "Network.requestWillBeSent") urls.push(m.params.request.url); });

// The product page has no test hook, so wait for the element rather than dataset.ready.
const open = async (url = PRODUCT, { settle = true } = {}) => {
  await page.evaluate(CLEAR_STORED).catch(() => {});
  urls.length = 0;
  await page.send("Page.bringToFront");
  await page.send("Page.navigate", { url });
  await sleep(100);
  await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 5000);
  if (settle) await waitFor(async () => (await d.state()).view === "list", 4000);
  await page.evaluate(MAKE);
};
const state = () => d.state();
const titles = async () => (await state()).rows.map((r) => r.text);
const value = async (text) => (await state()).rows.find((r) => r.text === text)?.value;
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
const back = async (n = 1) => { for (let i = 0; i < n; i++) { await d.key("ArrowLeft"); await sleep(280); } };
const focusRing = async () => { await d.press("menu"); await sleep(280); };
const NO_MUSIC = [{ text: "No Music", value: null, selected: true, arrow: false }];
const HELP = [
  { text: "No music yet", value: null, selected: false, arrow: false },
  { text: "Choose Add Folder", value: null, selected: false, arrow: false },
  { text: "to link your music.", value: null, selected: false, arrow: false },
  { text: "Add Folder", value: null, selected: true, arrow: false },
];
const catalogueRequests = () => urls.filter((u) => /catalogue\.json|\.json(\?|$)/.test(u));

try {
  await page.send("Network.enable");

  await section("boot", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__fetches = [];
      const f = window.fetch;
      window.fetch = function (...a) { window.__fetches.push(String(a[0])); return f.apply(this, a); };
    ` });
    await open(PRODUCT, { settle: false });
    t.eq("no catalogue attribute, import present", await page.evaluate(`[${P}.hasAttribute("catalogue-url"), ${P}.hasAttribute("import")]`), [false, true]);
    t.eq("boots through the usual boot screen", (await state()).view, "loading");
    t.eq("live text Loading", await page.evaluate(`${root}.querySelector('.live').textContent`), "Loading");
    const ready = await page.evaluate(`new Promise((res)=>{(function f(){${P}.debugState().view==="loading"?setTimeout(f,10):res(performance.now())})()})`);
    console.log(`    menu ${Math.round(ready)} ms after navigation`);
    t.ok("boot timing unchanged, about 2 s", ready >= 2000 && ready < 2700, ready);
    const s = await state();
    t.eq("normal menu, not offline, not an error", [s.view, s.title, await titles()], ["list", "mPod", ["Playlists", "Artists", "Songs", "Settings"]]);
    t.eq("live text Ready", await page.evaluate(`${root}.querySelector('.live').textContent`), "Ready");
    t.eq("no overlay showing", await page.evaluate(`[${root}.querySelector('.offline').hidden, ${root}.querySelector('.boot').hidden]`), [true, true]);
    t.eq("no fetch at all", await page.evaluate("window.__fetches"), []);
    t.eq("no catalogue request", catalogueRequests(), []);
    const own = /^(icons\/|manifest\.webmanifest$|sw\.js$|sw-precache\.js$)/;
    const other = urls.filter((u) => !u.startsWith("data:") && !u.startsWith(BASE + "src/") && u !== PRODUCT && !own.test(u.slice(BASE.length)));
    t.eq("only the page, its modules and its install files were requested", other, []);
    t.eq("no error logged", logs, []);
  });

  await section("empty", async () => {
    await open();
    await focusRing();
    for (const list of ["Playlists", "Artists", "Songs"]) {
      await pick(list);
      const s = await state();
      t.eq(`spec 32: ${list} shows help`, [s.title, s.rows], [list, HELP]);
      await d.key("ArrowDown");
      t.eq(`${list}: the help has one selectable row`, (await state()).rows, HELP);
      await back();
    }
    await d.key("ArrowUp"); await d.key("ArrowUp");
    await d.press("play"); await sleep(120);
    t.eq("Play/Pause with nothing to play", (await state()).view, "list");
    await pick("Settings");
    await pick("About");
    const about = await state();
    t.eq("About reports 0 songs", [about.rows[1].text, about.rows[1].value], ["Songs", "0"]);
    t.eq("no catalogue request", catalogueRequests(), []);
    t.eq("no error logged", logs, []);
    await d.shot("product-empty");
  });

  await section("import", async () => {
    await open();
    await focusRing();
    await pick("Settings");
    t.eq("spec 33: Name row first", (await titles())[0], "Name");
    t.eq("Import row present", (await titles()).includes("Import"), true);
    await pick("Import");
    t.eq("starts empty", [await value("Songs"), await value("Library")], ["0", "All"]);
    const items = walk(join(SAMPLES, "Order"), "Order");
    await page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(items)})).then(()=>1)`);
    await sleep(50);
    t.eq("import works", [await value("Songs"), await value("Skipped"), await value("Library")], ["6", "0", "Imported"]);

    const lists = async () => {
      await back(2);
      const out = {};
      for (const list of ["Songs", "Artists", "Playlists"]) {
        await pick(list);
        out[list] = await titles();
        await back();
      }
      await pick("Settings");
      await pick("About");
      out.about = (await state()).rows[1].value;
      await back();
      await pick("Import");
      return out;
    };
    const imported = await lists();
    t.eq("Imported shows the music", [imported.Songs.length, imported.Playlists, imported.about], [6, ["Order"], "6"]);
    await pick("Library");
    t.eq("Library still toggles", await value("Library"), "All");
    const all = await lists();
    t.eq("All and Imported show the same music", all, imported);

    const tone = walk(join(SAMPLES, "Mix/Foxtrot"), "Foxtrot");
    await page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(tone)})).then(()=>1)`);
    await back(2);
    await pick("Songs");
    await pick("Real Tone");
    await sleep(400);
    const n = (await state()).nowPlaying;
    t.eq("imported track plays", [n.title, n.total, n.playing], ["Real Tone", 7, true]);
    await d.press("menu"); await sleep(280);
    await back();
    await pick("Settings");
    await pick("Import");
    await pick("Clear Imported");
    await sleep(120);
    t.eq("clear empties it", [await value("Songs"), await value("Library")], ["0", "All"]);
    await back(2);
    t.eq("no Now Playing row", await titles(), ["Playlists", "Artists", "Songs", "Settings"]);
    await pick("Songs");
    t.eq("back to help", (await state()).rows, HELP);
    t.eq("no catalogue request", catalogueRequests(), []);
    t.ok("no request left the browser for the music", urls.every((u) => /^(blob|data):/.test(u) || u.startsWith(BASE + "src/") || u.startsWith(BASE + "icons/") || /(sw\.js|sw-precache\.js|manifest\.webmanifest)$/.test(u) || u === PRODUCT), urls.join().slice(0, 300));
    t.eq("no error logged", logs, []);
  });

  await section("no-import", async () => {
    await open(BASE);
    urls.length = 0;
    await page.evaluate(`${P}.remove();const p=document.createElement("pod-player");document.getElementById("stage").append(p);0`);
    await sleep(100);
    t.eq("neither attribute boots", (await state()).view, "loading");
    await waitFor(async () => (await state()).view === "list", 4000);
    await focusRing();
    await pick("Songs");
    t.eq("No Music", (await state()).rows, NO_MUSIC);
    await back();
    await pick("Settings");
    t.eq("no Import row", (await titles()).includes("Import"), false);
    t.eq("no request", urls.filter((u) => !/^(blob|data):/.test(u) && !u.endsWith("/favicon.ico")), []);
    t.eq("no error logged", logs, []);
  });

  await section("offline", async () => {
    await open();
    const items = walk(join(SAMPLES, "Mix/Foxtrot"), "Foxtrot");
    await page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(items)})).then(()=>1)`);
    await focusRing();
    await pick("Songs");
    await d.key("ArrowRight"); await sleep(500);
    t.eq("playing", (await state()).nowPlaying.playing, true);
    await page.send("Network.emulateNetworkConditions", OFFLINE);
    await sleep(250);
    t.eq("browser reports offline", await page.evaluate("navigator.onLine"), false);
    const s = await state();
    t.eq("no overlay and the music keeps playing", [s.view, s.nowPlaying.playing], ["now-playing", true]);
    t.eq("overlay hidden", await page.evaluate(`${root}.querySelector('.offline').hidden`), true);
    await d.key("ArrowUp");
    t.eq("input still live", (await state()).nowPlaying.mode, "volume");
    await page.send("Network.emulateNetworkConditions", ONLINE);

    console.log("# offline at mount");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    ` });
    await open(PRODUCT, { settle: false });
    t.eq("boots anyway", (await state()).view, "loading");
    t.eq("settles on the menu", await waitFor(async () => (await state()).view === "list", 4000), true);
  });

  await section("with-catalogue", async () => {
    await open(BASE);
    await focusRing();
    await pick("Songs");
    t.eq("catalogue still loads", (await state()).rows.length, 48);
    t.ok("catalogue requested", catalogueRequests().length > 0, urls.join());

    await open(BASE + "?catalogue=/fixtures/nothing.json");
    t.ok("a bad url still logs its failure", logs.some((l) => /catalogue failed/.test(l)), logs.join());
    logs.length = 0;

    await page.send("Network.emulateNetworkConditions", OFFLINE);
    await sleep(250);
    t.eq("offline overlay unchanged when a catalogue is set", (await state()).view, "offline");
    await page.send("Network.emulateNetworkConditions", ONLINE);
    await sleep(250);

    await open(BASE);
    await page.evaluate(`${P}.remove();const p=document.createElement("pod-player");p.setAttribute("catalogue-url","");document.getElementById("stage").append(p);0`);
    await sleep(100);
    t.ok("an empty attribute is set, so it stays an error", await waitFor(() => logs.some((l) => /no catalogue-url/.test(l)), 1000), logs.join());
    logs.length = 0;
  });

  await section("page", async () => {
    const size = async (width, height) => {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
      await sleep(350);
      return page.evaluate(`(()=>{const r=${P}.getWheelRect();const m=document.querySelector("main").getBoundingClientRect();const e=document.documentElement;return {wheel:r.width,centre:r.x+r.width/2,mainW:m.width,mainH:m.height,sw:e.scrollWidth,sh:e.scrollHeight,cw:e.clientWidth,ch:e.clientHeight}})()`);
    };
    await open();
    t.eq("page title", await page.evaluate("document.title"), "mPod");
    t.eq("background fills it", await page.evaluate("getComputedStyle(document.documentElement).backgroundColor"), "rgb(31, 31, 31)");
    const big = await size(1000, 900);
    t.eq("desktop: full scale, centred", [big.wheel, big.centre], [350, 500]);
    t.eq("spec 34: reports its size to the device", await page.evaluate(`${P}.hasAttribute("fit")`), true);
    t.eq("desktop: fills the viewport, no scrolling", [big.mainW, big.mainH, big.sw, big.sh], [1000, 900, 1000, 900]);
    await d.shot("product");
    const phone = await size(390, 844);
    t.eq("spec 34: phone scales to fit, centred", [Math.round(phone.wheel), Math.round(phone.centre)], [318, 195]);
    t.eq("phone: no sideways scroll", [phone.sw, phone.cw], [390, 390]);
    const small = await size(320, 568);
    t.eq("small phone", [Math.round(small.wheel), Math.round(small.centre), small.sw], [259, 160, 320]);
    const short = await size(1000, 500);
    t.eq("spec 34: a short window fits, with no scrolling", [Math.round(short.wheel), short.sh, short.ch], [247, 500, 500]);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 2, mobile: false });
    await sleep(350);
    await d.press("select"); await sleep(280);
    t.eq("wheel input works on the page", (await state()).title, "Playlists");
    t.eq("no error logged", logs, []);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
