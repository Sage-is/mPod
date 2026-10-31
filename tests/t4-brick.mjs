import { boot, driver, sleep, T } from "./h.mjs";

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
const toAbout = async () => {
  await d.rotate(46); await d.press("select"); await sleep(280);
  await d.press("select"); await sleep(280);
};
const toBrick = async () => { await d.fresh(); await toAbout(); await d.press("select", 5200); await sleep(100); };
const brick = async () => (await d.state()).brick;
const shoot = async (name) => { await sleep(350); await d.shot(name); };

try {
  await section("open", async () => {
    await d.fresh();
    await toAbout();
    t.eq("on about", (await d.state()).title, "About");
    await d.press("select", 4600); await sleep(80);
    t.eq("4600 stays on About", (await d.state()).view, "list");
    await d.press("select", 5200); await sleep(80);
    const s = await d.state();
    t.eq("5200 opens Brick", [s.view, s.title, s.rows, s.nowPlaying], ["brick", "Brick", [], null]);
    t.eq("start state", s.brick, { balls: 3, score: 0, message: "Press Center to Launch Ball" });
    await shoot("brick-start");
    await d.press("menu"); await sleep(280);
    t.eq("menu leaves", (await d.state()).title, "About");
    await d.key("Enter"); await sleep(100);
    t.eq("short Enter on About stays", (await d.state()).view, "list");
    await d.keyDown("Enter"); await sleep(5150); await d.keyUp("Enter"); await sleep(80);
    t.eq("Enter held opens Brick on ring", (await d.state()).view, "brick");
    t.eq("no launch, new game", (await brick()).message, "Press Center to Launch Ball");
    await d.key("Enter"); await sleep(100);
    t.eq("Enter launches", (await brick()).message, "");
  });

  await section("vectors", async () => {
    for (const [n, score, secs] of [[0, 0, 5.52], [6, 4, 16.92], [3, 7, 20.2]]) {
      await toBrick();
      for (let i = 0; i < n; i++) await d.key("ArrowLeft");
      await d.press("select");
      const start = Date.now();
      let b;
      do { await sleep(40); b = await brick(); } while (b.message !== "GAME OVER" && Date.now() - start < 40000);
      const took = (Date.now() - start) / 1000;
      t.eq(`n=${n} final`, [b.balls, b.score, b.message], [0, score, "GAME OVER"]);
      t.ok(`n=${n} time ${took.toFixed(2)} ~ ${secs}`, Math.abs(took - secs) < 0.25, took);
      if (n === 6) await d.shot("brick-over");
    }
    await d.press("select"); await sleep(100);
    t.eq("select after game over: prompt, 3 balls, score 0", await brick(), { balls: 3, score: 0, message: "Press Center to Launch Ball" });
    await d.press("select"); await sleep(100);
    t.eq("second select launches", (await brick()).message, "");
  });

  await section("wheel", async () => {
    await toBrick();
    await d.rotate(90);
    await d.press("select");
    await sleep(600);
    await d.shot("brick-play");
    t.eq("launched", (await brick()).message, "");
    await d.press("menu"); await sleep(280);
    t.eq("left", (await d.state()).title, "About");
  });

  await section("clicks", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__clicks = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...a) { window.__clicks++; return start.apply(this, a); };
    ` });
    const clicks = () => page.evaluate("window.__clicks");
    await d.fresh();
    await d.rotate(32); await sleep(50);
    t.eq("2 rows, 2 clicks", await clicks(), 2);
    await d.press("select"); await sleep(280);
    t.eq("select no click", await clicks(), 2);
    await d.press("menu"); await sleep(280);
    const c0 = await clicks();
    await d.rotate(-60, { steps: 20, stepMs: 8 });
    await d.rotate(-60, { steps: 20, stepMs: 8 });
    const c1 = await clicks();
    console.log("    at top end", c0, c1, "sel", await d.sel());
    await d.rotate(-32); await sleep(50);
    t.eq("no click at list end", await clicks(), c1);
    await d.press("menu");
    await d.key("ArrowDown"); await sleep(50);
    t.eq("ring key step click", await clicks(), c1 + 1);
    await d.key("ArrowUp"); await sleep(50);
    await d.key("ArrowUp"); await sleep(50);
    t.eq("ring key at end no click", await clicks(), c1 + 2);
    await d.rotate(46);
    await d.press("select"); await sleep(280);
    await d.rotate(64); // Clicker row 4
    await d.press("select");
    t.eq("clicker off", (await d.state()).settings.clicker, "off");
    const c2 = await clicks();
    await d.rotate(-16); await sleep(50);
    t.eq("clicker off silent", await clicks(), c2);
  });

  await section("a11y", async () => {
    await d.fresh();
    const attr = (sel, a) => page.evaluate(`${root}.querySelector(${JSON.stringify(sel)}).getAttribute(${JSON.stringify(a)})`);
    t.eq("list role", await attr(".list", "role"), "listbox");
    t.eq("list tabindex", await attr(".list", "tabindex"), "0");
    t.eq("wheel dir", await attr(".wheel", "dir"), "ltr");
    t.eq("ring hidden", await attr(".ring", "aria-hidden"), "true");
    t.eq("names", await page.evaluate(`[...${root}.querySelectorAll('.wheel button')].map(b=>b.getAttribute('aria-label'))`), ["Menu", "Back", "Forward", "Play", "Select"]);
    const active = await attr(".list", "aria-activedescendant");
    t.eq("activedescendant row exists", await page.evaluate(`${root}.getElementById(${JSON.stringify(active)})?.getAttribute('aria-selected')`), "true");
    t.eq("labelled by title", await page.evaluate(`${root}.getElementById(${root}.querySelector('.list').getAttribute('aria-labelledby'))?.className`), "titlebar");
    const tabs = [];
    const tab = () => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).then(() => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }));
    const focused = () => page.evaluate(`(()=>{let a=document.activeElement;while(a?.shadowRoot?.activeElement)a=a.shadowRoot.activeElement;return a?.getAttribute?.('aria-label')||a?.getAttribute?.('role')||a?.tagName})()`);
    for (let i = 0; i < 6; i++) { await tab(); await sleep(30); tabs.push(await focused()); }
    t.eq("tab order", tabs, ["listbox", "Menu", "Back", "Forward", "Play", "Select"]);

    console.log("# tap highlight on the host only");
    const clear = "rgba(0, 0, 0, 0)";
    t.eq("no element flashes on touch", await page.evaluate(`['.wrap','.device','.screen','.list','.row','.wheel','.ring','.select','.btn.menu','.btn.play'].map((s)=>getComputedStyle(${root}.querySelector(s)).webkitTapHighlightColor)`), Array(10).fill(clear));
    t.eq("host carries it", await page.evaluate("getComputedStyle(document.querySelector('pod-player')).webkitTapHighlightColor"), clear);
    const css = await page.evaluate(`${root}.querySelector('style').textContent`);
    t.eq("set once", css.match(/tap-highlight-color/g).length, 1);
    await page.evaluate(`${root}.querySelector('.btn.menu').focus();0`);
    await tab(); await sleep(30);
    t.eq("keyboard focus style stays", await page.evaluate(`getComputedStyle(${root}.querySelector('.btn.back .glyph')).outlineStyle`), "solid");

    console.log("# now playing a11y");
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(400);
    t.eq("pause label", await attr(".btn.play", "aria-label"), "Pause");
    t.eq("group", await attr(".np", "role"), "group");
    t.eq("progress panel hidden", await attr(".np-progress", "aria-hidden"), "true");
    t.eq("input labels", [await attr(".range-scrub", "aria-label"), await attr(".range-volume", "aria-label")], ["Playback Progress", "Volume"]);
    t.eq("volume text", await attr(".range-volume", "aria-valuetext"), "50%");
    t.eq("progress text", await attr(".range-scrub", "aria-valuetext"), "0 seconds");
    await d.press("play"); await sleep(100);
    await d.press("forward", 1650); await sleep(100);
    t.eq("10 seconds", await attr(".range-scrub", "aria-valuetext"), "10 seconds");
    await d.shot("np-paused");
    await d.rotate(47); await sleep(420);
    await d.shot("np-volume");
    await d.press("select");
    await d.press("select"); await sleep(420);
    await d.rotate(47); await sleep(100);
    await d.shot("np-scrub");

    console.log("# range input via keyboard");
    await d.press("select");
    await d.press("menu"); await sleep(280);
    await page.evaluate(`document.activeElement?.blur?.(); ${root}.activeElement?.blur?.(); 0`);
    await d.press("select"); await sleep(300);
    t.eq("focus logic did not throw", (await d.state()).title, "Songs");
  });

  await section("range", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(400);
    await page.evaluate(`${root}.querySelector('.np').focus(); 0`);
    const tab = () => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).then(() => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }));
    const focusedClass = () => page.evaluate(`(()=>{let a=document.activeElement;while(a?.shadowRoot?.activeElement)a=a.shadowRoot.activeElement;return a?.className||a?.tagName})()`);
    await tab(); await sleep(50);
    console.log("    tab1", await focusedClass());
    await tab(); await sleep(50);
    console.log("    tab2", await focusedClass(), (await d.state()).nowPlaying.mode);
    t.eq("scrub input holds scrub", (await d.state()).nowPlaying.mode, "scrub");
    await sleep(5400);
    t.eq("no idle while focused", (await d.state()).nowPlaying.mode, "scrub");
    await d.key("ArrowRight");
    await sleep(100);
    console.log("    after arrow", JSON.stringify((await d.state()).nowPlaying));
    await tab(); await sleep(50);
    console.log("    tab3", await focusedClass(), (await d.state()).nowPlaying.mode);
    t.eq("volume input holds volume", (await d.state()).nowPlaying.mode, "volume");
    await d.key("ArrowRight");
    await sleep(100);
    t.eq("volume input raises", (await d.state()).nowPlaying.volume, 51);
    await tab(); await sleep(50);
    console.log("    tab4", await focusedClass());
    await sleep(5300);
    t.eq("blur restarts timer", (await d.state()).nowPlaying.mode, "progress");
  });

  await section("offline-mount", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__online = false;
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => window.__online });
    ` });
    await d.fresh({ waitBoot: false });
    let s = await d.state();
    t.eq("offline at mount", s.view, "offline");
    await sleep(2500);
    t.eq("still offline", (await d.state()).view, "offline");
    const fetched = await page.evaluate("performance.getEntriesByType('resource').some(e=>e.name.includes('catalogue.json'))");
    t.eq("no fetch while offline", fetched, false);
    await page.evaluate("window.__online = true; window.dispatchEvent(new Event('online')); 0");
    await sleep(100);
    t.eq("boot after online", (await d.state()).view, "loading");
    await sleep(1600);
    t.eq("boot runs a full 2 s", (await d.state()).view, "loading");
    await sleep(500);
    s = await d.state();
    t.eq("then menu", s.view, "list");
    await d.press("select"); await sleep(280);
    t.eq("works, catalogue loaded", [(await d.state()).title, (await d.state()).rows.length], ["Playlists", 4]);
  });

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
