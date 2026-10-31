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
const P = "document.querySelector('pod-player')";
const np = async () => (await d.state()).nowPlaying;
const focused = () => page.evaluate(`(()=>{let a=document.activeElement;while(a?.shadowRoot?.activeElement)a=a.shadowRoot.activeElement;return a?.getAttribute?.('role')||a?.className||a?.tagName})()`);
const tab = () => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).then(() => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }));

try {
  await section("channels", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play");
    for (let i = 0; i < 5; i++) await d.press("forward", 10);
    await sleep(500);
    const a = await page.evaluate(`(()=>{const b=${P}.playback;return {cur:!b.current.el.paused,next:!b.next.el.paused,fading:b.fading.size,idx:b.index}})()`);
    t.eq("one channel playing after rapid skips", [a.cur, a.next, a.fading, a.idx], [true, false, 0, 5]);
    await d.press("menu", 10); await sleep(280);
    await d.press("select", 10); await sleep(50); // Songs
    await d.rotate(16);
    await d.press("select", 10);
    await d.press("menu", 10);
    await d.rotate(16);
    await d.press("select", 10);
    await sleep(600);
    const n = await np();
    console.log("    after restart", n.index, n.title);
    t.ok("queue restart settled and playing", n.playing && n.total === 48);
    const b = await page.evaluate(`(()=>{const b=${P}.playback;return {cur:!b.current.el.paused,next:!b.next.el.paused}})()`);
    t.eq("still one channel", [b.cur, b.next], [true, false]);
  });

  await section("first-boot-offline", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__online = true;
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => window.__online });
    ` });
    const set = (v) => page.evaluate(`window.__online=${v};window.dispatchEvent(new Event('${v ? "online" : "offline"}'));0`);
    await d.fresh({ waitBoot: false });
    await sleep(700);
    t.eq("booting", (await d.state()).view, "loading");
    await set(false);
    await sleep(2000);
    t.eq("offline overlay, timers cleared", (await d.state()).view, "offline");
    await set(true);
    await sleep(100);
    t.eq("boot restarts", (await d.state()).view, "loading");
    await sleep(1500);
    t.eq("still inside the new 2 s", (await d.state()).view, "loading");
    await sleep(600);
    t.eq("menu after a full 2 s", (await d.state()).view, "list");
    await d.press("select"); await sleep(280);
    t.eq("data ready", (await d.state()).rows.length, 4);
  });

  await section("idle-focus", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await d.press("menu"); await sleep(280);
    t.eq("focus on ring", await focused(), "ring");
    await sleep(10300);
    t.eq("jumped", (await d.state()).view, "now-playing");
    t.eq("ring keeps focus through idle jump", await focused(), "ring");

    await d.press("menu"); await sleep(280);
    await page.evaluate(`${P}.shadowRoot.querySelector('.list').focus({preventScroll:true});0`);
    t.eq("focus on list", await focused(), "listbox");
    await d.key("ArrowDown");
    await sleep(10300);
    t.eq("jumped again", (await d.state()).view, "now-playing");
    t.eq("focus follows when it was on the screen", await focused(), "group");
  });

  await section("toggle-live", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.press("select"); await sleep(350);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    // A pause and a resume keep the same track and position.
    await d.press("play"); await sleep(100);
    t.eq("root play toggles pause", await page.evaluate(`${P}.playback.paused`), true);
    t.eq("label reads Play", await page.evaluate(`${P}.shadowRoot.querySelector('.btn.play').getAttribute('aria-label')`), "Play");
    await d.press("play"); await sleep(200);
    t.eq("label reads Pause", await page.evaluate(`${P}.shadowRoot.querySelector('.btn.play').getAttribute('aria-label')`), "Pause");
  });

  await section("unlock", async () => {
    await d.fresh();
    await page.evaluate(`${P}.graph.ctx.suspend()`);
    t.eq("suspended", await page.evaluate(`${P}.graph.ctx.state`), "suspended");
    await page.evaluate(`window.__c=0;const s=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){window.__c++;return s.apply(this,a)};0`);
    await d.rotate(16); await sleep(150);
    t.eq("activity resumes the context", await page.evaluate(`${P}.graph.ctx.state`), "running");
    t.eq("waiting click plays once", await page.evaluate("window.__c"), 1);
    t.eq("row moved", await d.sel(), 1);
    await d.key("ArrowDown"); await d.key("ArrowDown"); await sleep(30);
    const times = await page.evaluate(`${P}.graph.nextTime - ${P}.graph.ctx.currentTime`);
    t.ok("next click within backlog", times < 0.2, times);
  });

  await section("outer-band", async () => {
    await d.fresh();
    await d.press("menu");
    const r = await d.rect();
    const off = 0.447 * r.width;
    await page.mouse("mouseMoved", r.cx, r.cy - off);
    await page.mouse("mousePressed", r.cx, r.cy - off, 1);
    for (let a = 0; a <= 60; a += 5) {
      await page.mouse("mouseMoved", r.cx + off * Math.sin(a * Math.PI / 180), r.cy - off * Math.cos(a * Math.PI / 180), 1);
      await sleep(8);
    }
    await page.mouse("mouseReleased", r.cx + off * Math.sin(Math.PI / 3), r.cy - off * Math.cos(Math.PI / 3));
    await sleep(60);
    t.eq("drag from the band does not rotate", await d.sel(), 0);
    t.eq("dragging state clear", await page.evaluate(`${P}.shadowRoot.querySelector('.wheel').classList.contains('dragging')`), false);
  });

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
