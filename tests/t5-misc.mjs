import { boot, driver, sleep, T, waitFor } from "./h.mjs";

const { page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await fn();
  await page.resetSection();
};
const root = "document.querySelector('pod-player').shadowRoot";
const np = async () => (await d.state()).nowPlaying;
const tab = () => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).then(() => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }));
const media = (features) => page.send("Emulation.setEmulatedMedia", { features });

try {
  await section("drags107", async () => {
    for (const gap of [250, 500]) {
      await d.fresh();
      await d.rotate(32); await d.press("select"); await sleep(280);
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        await d.rotate(107, { steps: 24, stepMs: 8 });
        console.log("      drag ms", Date.now() - t0 - 40, "row", await d.sel());
        await sleep(gap - 40 - 5);
      }
      const row = await d.sel();
      console.log("    gap", gap, "rows", row);
      t.ok(`three 107 at gap ${gap}`, gap === 500 ? row === 21 : row === 21 || row === 22, row);
    }
  });

  await section("source-memory", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.rotate(46); await d.press("select"); await sleep(300); // row 3 from Songs
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    // new queue from a playlist must not rewrite Songs' memory into a playlist song index
    await d.rotate(-32);
    await d.press("select"); await sleep(280); // Playlists
    await d.press("select"); await sleep(280); // Fixture Playlist 0
    await d.rotate(32); await d.press("select"); await sleep(300); // row 2 of playlist
    t.eq("playlist queue", (await np()).total, 12);
    await d.press("menu"); await sleep(280);
    t.eq("list follows", await d.sel(), 2);
    await d.press("menu"); await sleep(280); await d.press("menu"); await sleep(280);
    await d.rotate(32); await d.press("select"); await sleep(280);
    t.eq("Songs keeps its own row", [(await d.state()).title, await d.sel()], ["Songs", 3]);
  });

  await section("scroll-restore", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.rotate(150, { steps: 40, stepMs: 8 });
    const row = await d.sel();
    const top0 = await page.evaluate(`${root}.querySelector('.list').scrollTop`);
    await d.press("select"); await sleep(320);
    await d.press("menu"); await sleep(320);
    const top1 = await page.evaluate(`${root}.querySelector('.list').scrollTop`);
    t.eq("scroll restored", [await d.sel(), top1], [row, top0]);
    await d.rotate(-150, { steps: 40, stepMs: 8 });
    await d.rotate(-150, { steps: 40, stepMs: 8 });
    await d.shot("songs-top");
    t.eq("panes", await page.evaluate(`${root}.querySelectorAll('.pane').length`), 1);
    await d.rotate(200, { steps: 40, stepMs: 8 });
    await sleep(100);
    await d.shot("songs-list");
    const m = await page.evaluate(`(()=>{const l=${root}.querySelector('.list');const r=${root}.querySelector('.row.selected').getBoundingClientRect();const b=l.getBoundingClientRect();return {cw:l.clientWidth,ow:l.offsetWidth,row:r.width/.75}})()`);
    t.eq("selected row spans list less scrollbar", [m.ow, m.cw, Math.round(m.row)], [263, 251, 251]);
  });

  await section("failure", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__fail = true;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { return window.__fail ? Promise.reject(new Error("forced")) : play.call(this); };
    ` });
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    let s = await d.state();
    t.eq("np opens with text, no times, no icon", [s.view, s.nowPlaying.title !== "", s.nowPlaying.elapsed, s.nowPlaying.remaining, s.nowPlaying.playing], ["now-playing", true, "", "", false]);
    t.eq("no play icon painted", await page.evaluate(`${root}.querySelector('.state').hidden`), true);
    await d.press("menu"); await sleep(280);
    t.eq("queue stays, row kept", (await d.state()).rows.length, 5);
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.rotate(47);
    t.eq("rotation shows volume", (await np()).mode, "volume");
    await d.press("select");
    await d.press("select");
    t.eq("select enters no scrub", (await np()).mode, "progress");
    await page.evaluate("window.__fail = false");
    await d.press("play"); await sleep(300);
    const n = await np();
    t.eq("play/pause retries and recovers", [n.playing, n.elapsed !== ""], [true, true]);
    logs.length = 0;
  });

  await section("i18n", async () => {
    await d.fresh();
    await page.evaluate(`(()=>{const p=document.querySelector('pod-player');
      p.locale={storefront:'de',language:'de-DE'};
      p.i18n={t:(k,v)=>k==='playlists'?'Wiedergabelisten':k==='settings'?null:undefined};0})()`);
    await sleep(50);
    let s = await d.state();
    t.eq("hook, fallback, root title fixed", [s.rows[0].text, s.rows[3].text, s.title], ["Wiedergabelisten", "Settings", "Pod"]);
    await d.rotate(46); await d.press("select"); await sleep(280); await d.press("select"); await sleep(280);
    s = await d.state();
    t.eq("locale formats size", s.rows[2].value, "9,2\u00a0GB");
    await page.evaluate(`document.querySelector('pod-player').i18n=null;0`);
    await sleep(50);
    t.eq("no i18n -> en-US", (await d.state()).rows[2].value, "9.2 GB");
    await page.evaluate(`(()=>{const p=document.querySelector('pod-player');p.locale={language:'not a locale!!'};p.i18n={t:()=>{throw new Error('x')}};0})()`);
    await sleep(50);
    t.eq("bad locale falls back", (await d.state()).rows[2].value, "9.2 GB");
    t.ok("warned", logs.some((l) => /invalid locale/.test(l)) && logs.some((l) => /i18n failed/.test(l)));
    await page.evaluate(`document.querySelector('pod-player').i18n=null;0`);
    logs.length = 0;
  });

  await section("backlit", async () => {
    await d.fresh();
    const set = (js) => page.evaluate(`(()=>{const p=document.querySelector('pod-player');${js};0})()`);
    t.eq("default", (await d.state()).backlit, true);
    await set("p.setAttribute('backlit','false')"); await sleep(20);
    t.eq("attr false forces dark", (await d.state()).backlit, false);
    await set("p.setAttribute('backlit','')"); await sleep(20);
    t.eq("attr other forces lit", (await d.state()).backlit, true);
    await set("p.removeAttribute('backlit')"); await sleep(20);
    await set("p.backlit='false'"); await sleep(20);
    t.eq("prop false", (await d.state()).backlit, false);
    await set("p.backlit=null"); await sleep(20);
    t.eq("prop cleared", (await d.state()).backlit, true);
    console.log("# scheme change live");
    await media([{ name: "prefers-color-scheme", value: "light" }]);
    await sleep(60);
    let s = await d.state();
    t.eq("unchosen follows scheme", [s.settings.backlight, s.backlit], ["off", false]);
    await media([{ name: "prefers-color-scheme", value: "dark" }]);
    await sleep(60);
    t.eq("back to always_on", (await d.state()).settings.backlight, "always_on");
    await media([]);
  });

  await section("settings-parse", async () => {
    await page.evaluate(`localStorage.setItem('pod-player:settings','{not json')`);
    await d.fresh({ clear: false });
    t.eq("bad json -> defaults", (await d.state()).settings.volume, 50);
    t.ok("logged", logs.some((l) => /parse failed/.test(l)));
    logs.length = 0;
    await page.evaluate(`localStorage.setItem('pod-player:settings',JSON.stringify({shuffle:'songs',repeat:'nope',clicker:'off',volume:999,backlight:'2sec'}))`);
    await d.fresh({ clear: false });
    let s = await d.state();
    t.eq("each field alone; backlight needs chosen", [s.settings.shuffle, s.settings.repeat, s.settings.clicker, s.settings.volume, s.settings.backlight], ["songs", "off", "off", 50, "always_on"]);
    await page.evaluate(`localStorage.setItem('pod-player:settings',JSON.stringify({shuffle:'off',repeat:'all',clicker:'on',volume:33,backlight:'2sec',backlightChosen:true}))`);
    await d.fresh({ clear: false });
    s = await d.state();
    t.eq("persist across load", [s.settings.repeat, s.settings.volume, s.settings.backlight], ["all", 33, "2sec"]);
    const stored = await page.evaluate(`Object.keys(JSON.parse(localStorage.getItem('pod-player:settings')))`);
    t.eq("written shape", stored.sort(), ["backlight", "backlightChosen", "clicker", "repeat", "shuffle", "volume"]);
  });

  await section("volume-reset", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await d.rotate(47);
    t.eq("live 60", (await np()).volume, 60);
    await d.press("menu"); await sleep(280);
    await d.rotate(16); await d.press("select"); await sleep(280);
    await d.rotate(150, { steps: 40, stepMs: 8 }); await d.press("select"); await sleep(280);
    await d.rotate(16); await d.press("select"); await sleep(280);
    t.eq("reset popped", (await d.state()).title, "Settings");
    await sleep(1200);
    t.eq("pending save cancelled, 50", (await d.state()).settings.volume, 50);
    await d.press("menu"); await sleep(280);
    t.eq("root still has NP row", (await d.state()).rows.length, 5);
    await d.rotate(32); await d.press("select"); await sleep(280);
    t.eq("live volume 50 and playing", [(await np()).volume, (await np()).playing], [50, true]);
  });

  await section("buttons", async () => {
    await d.fresh();
    await d.press("select"); await sleep(280);
    t.eq("in Playlists", (await d.state()).title, "Playlists");
    const lit = (await d.state()).backlit;
    const r = await d.rect();
    const mx = r.cx, my = r.cy - 0.447 * r.width;
    await page.mouse("mouseMoved", mx, my);
    await page.mouse("mousePressed", mx, my, 1);
    await sleep(200);
    await page.mouse("mouseMoved", r.cx - 0.447 * r.width, r.cy, 1);
    await sleep(1000);
    await page.mouse("mouseReleased", r.cx - 0.447 * r.width, r.cy);
    await sleep(60);
    let s = await d.state();
    t.eq("pointer left: hold abandoned, no click", [s.backlit, s.title], [lit, "Playlists"]);

    console.log("# focused button keyboard");
    await d.fresh();
    await d.press("select"); await sleep(280);
    await page.evaluate(`${root}.querySelector('.btn.menu').focus();0`);
    await d.key("Enter"); await sleep(280);
    t.eq("Enter on Menu pops", (await d.state()).title, "Pod");
    await page.evaluate(`${root}.querySelector('.btn.menu').focus();0`);
    await d.keyDown("Enter"); await sleep(1100); await d.keyUp("Enter"); await sleep(60);
    t.eq("held Enter toggles backlight", (await d.state()).backlit, false);

    console.log("# held key cancelled when ring loses focus");
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.keyDown("ArrowDown"); await sleep(420);
    await page.evaluate(`${root}.querySelector('.btn.menu').focus();0`);
    await sleep(60);
    const a = await d.sel();
    await sleep(300);
    t.eq("no more steps after blur", await d.sel(), a);
    t.eq("dragging cleared", await page.evaluate(`${root}.querySelector('.wheel').classList.contains('dragging')`), false);
    await d.keyUp("ArrowDown");
  });

  await section("link", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await page.evaluate(`(()=>{const p=document.querySelector('pod-player');window.__nav=[];p.navigateToUrl=(u)=>{window.__nav.push(u)};0})()`);
    await page.evaluate(`${root}.querySelector('.song-link').focus();0`);
    await page.evaluate(`${root}.querySelector('.song-link').click();0`);
    await sleep(50);
    t.eq("navigateToUrl called", await page.evaluate("window.__nav"), ["/fixtures/song/000"]);
    t.eq("no navigation", await page.evaluate("location.pathname"), "/");
  });

  await section("marquee", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(400);
    const info = () => page.evaluate(`(()=>{const m=${root}.querySelector('.marquee');const t=m.querySelector('.marquee-track');const a=t.getAnimations()[0];return {over:m.classList.contains('overflow'),n:t.children.length,hidden:t.lastChild.getAttribute('aria-hidden'),dur:a&&a.effect.getTiming().duration,delay:a&&a.effect.getTiming().delay,w:t.firstChild.offsetWidth}})()`);
    const m = await info();
    console.log("   ", m);
    t.ok("overflow with dup, gap", m.over && m.n === 3 && m.hidden === "true");
    t.eq("loop time", [Math.round(m.dur), m.delay], [Math.round((m.w + 30) * 50), 2000]);
    await d.press("forward"); await sleep(250);
    const m2 = await info();
    t.eq("short title: one centred line, no animation", [m2.over, m2.n, m2.dur ?? null], [false, 1, null]);
  });

  await section("reduced", async () => {
    await media([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await d.fresh();
    await d.press("select");
    t.eq("no slide: single pane at once", await page.evaluate(`${root}.querySelectorAll('.pane').length`), 1);
    await d.press("menu");
    await d.rotate(32); await d.press("play"); await sleep(400);
    const m = await page.evaluate(`(()=>{const k=${root}.querySelector('.marquee');const t=k.querySelector('.marquee-track');return {anims:t.getAnimations().length,n:t.children.length,cls:k.className}})()`);
    t.eq("marquee static", [m.anims, m.n], [0, 1]);
    t.eq("strip no transition", await page.evaluate(`getComputedStyle(${root}.querySelector('.np-strip')).transitionDuration`), "0s");
    await d.shot("reduced-np");
    await media([]);
  });

  await section("contrast", async () => {
    await media([{ name: "prefers-contrast", value: "more" }, { name: "prefers-color-scheme", value: "light" }]);
    await d.fresh();
    await d.rotate(16);
    await d.shot("contrast");
    await media([]);
  });

  await section("slide", async () => {
    await d.fresh();
    const xs = () => page.evaluate(`[...${root}.querySelectorAll('.pane')].map(p=>Math.round(new DOMMatrix(getComputedStyle(p).transform).m41))`);
    await d.press("select", 10);
    await sleep(30);
    const a = await xs();
    console.log("    push mid", a);
    t.eq("two panes during slide", a.length, 2);
    t.ok("incoming on the right, outgoing on the left", a[1] > 0 && a[0] < 0, a);
    const w = await page.evaluate(`${root}.querySelector('.body-clip').clientWidth`);
    t.eq("body width", w, 273);
    t.eq("title changes at once", (await d.state()).title, "Playlists");
    await d.press("menu", 10);
    const b = await xs();
    console.log("    reversed", b);
    await sleep(320);
    const c = await xs();
    t.eq("settled to one pane at 0", c, [0]);
    t.eq("back at root", (await d.state()).title, "Pod");

    await d.press("select", 10);
    await d.press("menu", 10);
    await d.press("select", 10);
    await d.press("menu", 10);
    await sleep(350);
    t.eq("rapid taps settle", await xs(), [0]);
  });

  await section("scale", async () => {
    await d.fresh();
    for (const [w, want] of [[500, 350], [430, 315], [390, 280], [350, 262.5]]) {
      await page.evaluate(`document.querySelector('pod-player').style.width='${w}px';0`);
      const width = async () => Math.round((await d.rect()).width * 10) / 10;
      await waitFor(async () => (await width()) === want, 2000);
      t.eq(`host ${w}`, await width(), want);
    }
    await page.evaluate(`document.querySelector('pod-player').style.width='500px';0`);
    await sleep(350);
    await d.rotate(46);
    t.eq("rotate at full scale", await d.sel(), 3);
    await d.key("ArrowUp");
    await d.shot("full-scale");
  });

  await section("hires-brick", async () => {
    await d.fresh();
    await page.evaluate(`document.querySelector('pod-player').style.width='500px';0`);
    await sleep(350);
    await d.rotate(46); await d.press("select"); await sleep(280);
    await d.press("select"); await sleep(280);
    await d.press("select", 5200); await sleep(150);
    const size = await page.evaluate(`(()=>{const c=${root}.querySelector('canvas');return [c.width,c.height,c.getBoundingClientRect().width]})()`);
    console.log("    canvas", size);
    t.eq("backing 526 x 359", [size[0], size[1]], [526, 359]);
    await d.press("select"); await sleep(600);
    await d.shot("brick-hires");
  });

  await section("rtl", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `document.addEventListener('readystatechange',()=>{document.documentElement.dir='rtl'},{once:true})` });
    await d.fresh();
    await d.press("menu");
    await d.key("ArrowLeft"); await sleep(280);
    t.eq("Left selects in RTL", (await d.state()).title, "Playlists");
    await d.key("ArrowRight"); await sleep(280);
    t.eq("Right is Menu in RTL", (await d.state()).title, "Pod");
    await d.shot("rtl-root");
    await d.rotate(32); await d.press("play"); await sleep(400);
    await d.rotate(47); await sleep(420);
    await d.shot("rtl-volume");
  });

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
