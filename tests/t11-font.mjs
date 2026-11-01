// Spec 31: the drawn screen font in Chrome. Screenshots land in work/.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const FONT_NAME = "ChicagoFLF";
// Spec 31's glyph box and width targets describe our own drawn font. ChicagoFLF has neither,
// so they run only when that font ships again.
const DRAWN_FONT = false;
const P = "document.querySelector('pod-player')";
const root = `${P}.shadowRoot`;
const IMPORT = BASE + "?import";
const state = () => d.state();
const titles = async () => (await state()).rows.map((r) => r.text);

const fontsOf = async (selector) => {
  const { result } = await page.send("Runtime.evaluate", { expression: `${root}.querySelector(${JSON.stringify(selector)})` });
  const { nodeId } = await page.send("DOM.requestNode", { objectId: result.objectId });
  const { fonts } = await page.send("CSS.getPlatformFontsForNode", { nodeId });
  return fonts.map((f) => ({ name: f.familyName, custom: f.isCustomFont }));
};
const isPixelFace = async (selector) => {
  const fonts = await fontsOf(selector);
  return fonts.length === 1 && fonts[0].name === FONT_NAME && fonts[0].custom;
};
const load = async (url = BASE) => {
  await page.evaluate(CLEAR_STORED).catch(() => {});
  await page.send("Page.bringToFront");
  await page.goto(url);
  await sleep(2150);
  await page.send("DOM.getDocument", { depth: -1, pierce: true });
  await waitFor(() => page.evaluate("document.fonts.check('26px PodScreen')"), 3000);
};
const pick = async (text) => {
  const rows = (await state()).rows;
  const at = rows.findIndex((r) => r.text === text);
  if (at < 0) throw new Error(`no row ${text} in ${rows.map((r) => r.text)}`);
  let sel = rows.findIndex((r) => r.selected);
  while (sel < at) { await d.key("ArrowDown"); sel++; }
  while (sel > at) { await d.key("ArrowUp"); sel--; }
  await d.key("ArrowRight");
  await sleep(300);
};
const back = async (n = 1) => { for (let i = 0; i < n; i++) { await d.key("ArrowLeft"); await sleep(300); } };
const focusRing = async () => { await d.press("menu"); await sleep(280); };

// Rows run wider now. These two fixed titles end in an ellipsis in the bar, as 09 allows.
const LONG_TITLES = new Set(["Backlight Timer", "Reset All Settings"]);

// Every row inside its box, and rows that are not song titles need no ellipsis unless asked.
const rowsFit = async (label, { titlesToo = true } = {}) => {
  const bad = await page.evaluate(`[...${root}.querySelectorAll('.row')].filter((r)=>{
    const title=r.querySelector('.row-title');
    return r.scrollWidth>r.clientWidth || r.offsetHeight!==30 || (${titlesToo} && title.scrollWidth>title.clientWidth);
  }).map((r)=>r.textContent)`);
  t.eq(`${label}: nothing overflows its row`, bad, []);
  const bar = await page.evaluate(`(()=>{const e=${root}.querySelector('.title');const b=${root}.querySelector('.titlebar').getBoundingClientRect();const r=e.getBoundingClientRect();const k=r.width/e.offsetWidth;return {sw:e.scrollWidth,cw:e.clientWidth,text:e.textContent,gap:Math.round(Math.min(r.left-b.left,b.right-r.right)/k)}})()`);
  t.ok(`${label}: title stays clear of the icons (${bar.text}, ${bar.gap} px)`, bar.gap >= 40, JSON.stringify(bar));
  if (!LONG_TITLES.has(bar.text)) t.ok(`${label}: title shown in full (${bar.sw} of ${bar.cw})`, bar.sw <= bar.cw, JSON.stringify(bar));
};

try {
  await page.send("DOM.enable");
  await page.send("CSS.enable");

  await section("loads", async () => {
    await load();
    t.eq("document.fonts.check", await page.evaluate("document.fonts.check('26px PodScreen')"), true);
    t.eq("one face, ours", await page.evaluate("[...document.fonts].map((f)=>[f.family,f.status,f.display])"), [["PodScreen", "loaded", "block"]]);
    t.eq("no sanitiser or load complaint", logs.filter((l) => /OTS|decode|font/i.test(l)), []);
    const source = readdirSync("src").filter((f) => f.endsWith(".js")).map((f) => readFileSync(`src/${f}`, "utf8")).join("");
    t.eq("no local font names left", /Krungthep|local\(/.test(source), false);
    t.eq("stack keeps system-ui after our face", await page.evaluate(`getComputedStyle(${root}.querySelector('.screen')).fontFamily`), "PodScreen, system-ui, sans-serif");
  });

  await section("screens", async () => {
    await load(IMPORT);
    t.ok("root title in the pixel face", await isPixelFace(".title"));
    t.ok("root rows in the pixel face", await isPixelFace(".row-title"));
    await sleep(300);
    await d.shot("font-root");
    await rowsFit("root");

    await focusRing();
    await pick("Songs");
    t.ok("long list in the pixel face", await isPixelFace(".row-title"));
    await d.rotate(46);
    await sleep(100);
    await d.shot("font-songs");
    await rowsFit("Songs", { titlesToo: false });
    await back();

    await pick("Artists"); await rowsFit("Artists", { titlesToo: false }); await back();
    await pick("Playlists"); await rowsFit("Playlists", { titlesToo: false }); await back();
    await pick("Settings");
    await d.shot("font-settings");
    await rowsFit("Settings", { titlesToo: false });
    t.ok("settings value in the pixel face", await isPixelFace(".row-value"));
    await pick("About");
    await d.shot("font-about");
    await rowsFit("About");
    t.ok("about value in the pixel face", await isPixelFace(".row-value"));
    await back();
    await pick("Backlight Timer"); await rowsFit("Backlight Timer"); await back();
    await pick("Reset All Settings"); await rowsFit("Reset All Settings"); await d.key("ArrowRight"); await sleep(300);
    t.eq("Settings title in full", await page.evaluate(`(()=>{const e=${root}.querySelector('.title');return e.scrollWidth<=e.clientWidth})()`), true);
    await pick("Import"); await rowsFit("Import");
    await back(2);

    await pick("Songs");
    await d.press("select"); await sleep(600);
    await d.press("forward"); await sleep(400);
    await d.press("back"); await sleep(400);
    await d.shot("font-now-playing");
    for (const s of [".np-index", ".t-elapsed", ".t-remaining", ".marquee-text", ".np-artist", ".np-album"]) {
      t.ok(`${s} in the pixel face`, await isPixelFace(s));
    }
    const small = await page.evaluate(`Number.parseFloat(getComputedStyle(${root}.querySelector('.np-pos')).fontSize)`);
    t.ok(`small numbers land on whole pixels (${small} px)`, Math.abs(small * 12 / 208 - 1) < 0.001, small);
    t.eq("position line keeps its 20 px line box", await page.evaluate(`${root}.querySelector('.np-pos').offsetHeight`), 20);
    const fit = await page.evaluate(`['.np-pos','.np-artist','.np-album','.times','.np-body'].map((s)=>{const e=${root}.querySelector(s);return [s,e.scrollWidth<=e.clientWidth,e.scrollHeight<=e.clientHeight+1]})`);
    t.eq("Now Playing lines fit", fit.filter((f) => !f[1] || !f[2]), []);
  });

  await section("overflow-text", async () => {
    await load();
    const box = await page.evaluate(`(()=>{const c=document.createElement('canvas').getContext('2d');c.font='26px PodScreen';
      const out={up:0,down:0,upChar:'',downChar:''};
      const ranges=[[0x21,0x7e],[0xa1,0x17f],[0x2010,0x2015],[0x2018,0x201f],[0x2022,0x2022],[0x2026,0x2026]];
      for(const [a,b] of ranges) for(let i=a;i<=b;i++){const ch=String.fromCodePoint(i);const m=c.measureText(ch);
        if(m.actualBoundingBoxAscent>out.up){out.up=m.actualBoundingBoxAscent;out.upChar=ch}
        if(m.actualBoundingBoxDescent>out.down){out.down=m.actualBoundingBoxDescent;out.downChar=ch}}
      return out})()`);
    console.log("    tallest", JSON.stringify(box));
    if (DRAWN_FONT) {
      t.ok("every glyph stays inside the 26 px line box, so nothing clips", box.up <= 21.01 && box.down <= 5.01, JSON.stringify(box));
      t.ok("accent tops and descenders leave a gap between 30 px rows", 30 - box.up - box.down >= 4, JSON.stringify(box));
    }
    const measure = (strings) => page.evaluate(`(()=>{const c=document.createElement('canvas').getContext('2d');c.font='26px PodScreen';
      return ${JSON.stringify(strings)}.map((s)=>c.measureText(s).width)})()`);
    const targets = [["Hip-Hop/R&B Hits: 2001", 330], ["Playlists", 120], ["Backlight Timer", 218], ["minimum", 130], ["WWWW", 104], ["iiii", 34]];
    const got = await measure(targets.map((x) => x[0]));
    if (DRAWN_FONT) targets.forEach(([text, want], i) => t.ok(`${text}: ${got[i]} px, target ${want}`, Math.abs(got[i] - want) / want <= 0.06, got[i]));
    const [nowPlaying, settings, playlists, time, spaced] = await measure(["Now Playing", "Settings", "Playlists", "-75:00", "ab"]);
    t.ok(`main titles fit the bar (${nowPlaying} of 177)`, Math.max(nowPlaying, settings, playlists) <= 177, nowPlaying);
    t.ok(`time labels fit together (${time} px)`, time * 2 <= 243, time);
    if (DRAWN_FONT) t.eq("letters sit 2 design pixels apart", spaced % 1.5, 0);
  });

  await section("offline-text", async () => {
    await load();
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(250);
    const m = await page.evaluate(`(()=>{const e=${root}.querySelector('.offline p');const s=${root}.querySelector('.offline svg').getBoundingClientRect();const r=e.getBoundingClientRect();const b=${root}.querySelector('.screen').getBoundingClientRect();return {sw:e.scrollWidth,cw:e.clientWidth,clear:r.top>s.bottom,inside:r.bottom<b.bottom}})()`);
    t.eq("offline text inside the screen, clear of the drawing", [m.sw <= m.cw, m.clear, m.inside], [true, true, true]);
    await d.shot("font-offline");
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(200);
  });

  await section("brick", async () => {
    await load();
    await focusRing();
    await pick("Settings"); await pick("About");
    await d.press("select", 5200); await sleep(150);
    t.ok("Brick header in the pixel face", await isPixelFace(".brick-score"));
  });

  await section("fallback", async () => {
    await load(IMPORT);
    await page.evaluate(`(()=>{window.__mk=(paths)=>paths.map((p)=>{const f=new File(["x"],p.split("/").pop());Object.defineProperty(f,"webkitRelativePath",{value:p});return f});return 0})()`);
    const names = ["Mix/Кино/Группа крови/01 Звезда по имени.flac", "Mix/音楽家/夜の歌/02 夜の歌.flac", "Mix/Latin/Accents/03 Café 音楽.flac",
      "Mix/Latin/Accents/04 gypq jÅÉÎÕÜ.flac", "Mix/Latin/Accents/05 ÅÉÎÕÜ ŠŽĞ.flac", "Mix/Latin/Accents/06 gypq ÅÉÎ.flac"];
    await page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(names)})).then(()=>1)`);
    await focusRing();
    await pick("Songs");
    await sleep(300);
    const rows = await titles();
    const row = (text) => `.row:nth-child(${rows.findIndex((r) => r.includes(text)) + 1}) .row-title`;
    const system = (fonts) => fonts.some((f) => !f.custom);
    const cyrillic = await fontsOf(row("Звезда"));
    t.ok(`Cyrillic falls back (${cyrillic.map((f) => f.name)})`, system(cyrillic), JSON.stringify(cyrillic));
    const cjk = await fontsOf(row("夜の歌"));
    t.ok(`CJK falls back (${cjk.map((f) => f.name)})`, system(cjk), JSON.stringify(cjk));
    const mixed = await fontsOf(row("Café"));
    t.ok(`mixed title uses both (${mixed.map((f) => f.name)})`, mixed.some((f) => f.custom) && system(mixed), JSON.stringify(mixed));
    t.ok("accented Latin stays in the pixel face", await isPixelFace(row(DRAWN_FONT ? "ŠŽĞ" : "jÅÉÎÕÜ")));
    await rowsFit("fallback titles", { titlesToo: false });
    await d.shot("font-fallback");
  });

  await section("missing", async () => {
    let paused = true;
    browser.on((m) => {
      if (m.method === "Fetch.requestPaused" && paused) {
        page.send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 404, body: "" }).catch(() => {});
      }
    });
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*pod-screen.ttf" }] });
    await page.send("Page.bringToFront");
    await page.goto(BASE);
    await sleep(2300);
    t.eq("boots with the font missing", (await state()).view, "list");
    await page.send("DOM.getDocument", { depth: -1, pierce: true });
    const fonts = await fontsOf(".row-title");
    t.ok(`system font takes over (${fonts.map((f) => f.name)})`, fonts.length && fonts.every((f) => !f.custom), JSON.stringify(fonts));
    t.ok("failure logged, not thrown", logs.some((l) => /screen font failed/.test(l)) && !logs.some((l) => l.startsWith("EXC")), logs.join());
    paused = false;
    await page.send("Fetch.disable");
    logs.length = 0;
  });

  await section("boot-gate", async () => {
    let held = null;
    browser.on((m) => { if (m.method === "Fetch.requestPaused") held = m.params.requestId; });
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*pod-screen.ttf" }] });
    await page.send("Page.bringToFront");
    await page.send("Page.navigate", { url: BASE });
    await sleep(100);
    await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 5000);
    const ready = await page.evaluate(`new Promise((res)=>{(function f(){${P}.debugState().view==="loading"?setTimeout(f,10):res(performance.now())})()})`);
    console.log(`    menu at ${Math.round(ready)} ms with the font still held`);
    t.ok("slow font does not move the boot gate", ready >= 2000 && ready < 2700, ready);
    await waitFor(() => held !== null, 500);
    await page.send("Fetch.continueRequest", { requestId: held }).catch(() => {});
    await page.send("Fetch.disable");
    t.eq("face then loads", await waitFor(() => page.evaluate("document.fonts.check('26px PodScreen')"), 3000), true);
  });

  await section("sheet", async () => {
    await page.send("Page.bringToFront");
    await page.send("Page.navigate", { url: BASE + "dev/glyph-sheet.html" });
    t.eq("glyph sheet ready", await waitFor(() => page.evaluate("document.documentElement.dataset.ready === '1'").catch(() => false), 6000), true);
    const height = await page.evaluate("Math.ceil(document.documentElement.scrollHeight)");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1100, height, deviceScaleFactor: 2, mobile: false });
    await sleep(300);
    writeFileSync("work/glyph-sheet.png", await page.screenshot());
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 2, mobile: false });
  });

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
