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
const P = "document.querySelector('pod-player')";
const np = async () => (await d.state()).nowPlaying;
const toBrick = async () => {
  await d.fresh();
  await d.rotate(46); await d.press("select"); await sleep(280);
  await d.press("select"); await sleep(280);
  await d.press("select", 5200); await sleep(100);
};
const path = async (points, ms = 8) => {
  await d.settled();
  const [sx, sy] = points[0];
  await page.mouse("mouseMoved", sx, sy);
  await page.mouse("mousePressed", sx, sy, 1);
  for (const [x, y] of points.slice(1)) { await page.mouse("mouseMoved", x, y, 1); await sleep(ms); }
  const [ex, ey] = points.at(-1);
  await page.mouse("mouseReleased", ex, ey);
  await sleep(40);
};
const arc = (r, from, to, step = 3) => {
  const out = [];
  const dir = Math.sign(to - from);
  for (let a = from; dir > 0 ? a <= to : a >= to; a += dir * step) {
    out.push([r.cx + 0.27 * r.width * Math.sin(a * Math.PI / 180), r.cy - 0.27 * r.width * Math.cos(a * Math.PI / 180)]);
  }
  return out;
};

try {
  await section("arrows-np", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(350);
    await d.key("ArrowRight"); await sleep(200);
    t.eq("Right skips on short press", (await np()).index, 2);
    await d.key("ArrowLeft"); await sleep(200);
    t.eq("Left skips back", (await np()).index, 1);
    await d.key(" ", "Space"); await sleep(100);
    t.eq("Space pauses", (await np()).playing, false);
    await d.keyDown("ArrowRight"); await sleep(1100); await d.keyUp("ArrowRight"); await sleep(100);
    let n = await np();
    t.eq("Right held seeks, no skip", [n.index, n.elapsed], [1, "0:05"]);
    await d.keyDown("ArrowLeft"); await sleep(1100); await d.keyUp("ArrowLeft"); await sleep(100);
    n = await np();
    t.eq("Left held seeks back", [n.index, n.elapsed], [1, "0:00"]);

    console.log("# exact scrub keys");
    await d.key("Enter");
    t.eq("scrub", (await np()).mode, "scrub");
    await d.key("ArrowRight"); t.eq("Right +1", (await np()).elapsed, "0:01");
    await d.key("ArrowUp"); t.eq("Up +1", (await np()).elapsed, "0:02");
    await d.key("ArrowDown"); t.eq("Down -1", (await np()).elapsed, "0:01");
    await d.key("ArrowLeft"); t.eq("Left -1", (await np()).elapsed, "0:00");
    await d.key("ArrowLeft"); t.eq("clamps 0", (await np()).elapsed, "0:00");
    await d.key("Enter");
    t.eq("exit", (await np()).mode, "progress");
  });

  await section("reversal", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    const r = await d.rect();
    // 46 forward (3 rows) then 21 back: 8 lost, 13 kept, so no row back
    await path([...arc(r, 0, 46), ...arc(r, 45, 25)]);
    t.eq("resisted reversal", await d.sel(), 3);
    // 46 forward then 60 back: 8 lost, 52 kept, 3 rows back
    await path([...arc(r, 0, 46), ...arc(r, 43, -14)]);
    t.eq("reversal after resistance", await d.sel(), 3);
  });

  await section("hub", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    const r = await d.rect();
    const R = 0.27 * r.width;
    await path([[r.cx, r.cy - R], [r.cx + 1, r.cy + R], [r.cx + 2, r.cy - R]]);
    t.eq("swipe across hub does nothing", await d.sel(), 0);
    await d.press("select"); await sleep(280);
    t.eq("press on Select still works", (await d.state()).view, "now-playing");
  });

  await section("steer", async () => {
    await toBrick();
    const paddle = () => page.evaluate(`${P}.brick.game.paddleX`);
    t.eq("start 59", await paddle(), 59);
    await d.key("ArrowLeft");
    t.ok("tap moves exactly 4.13", Math.abs(await paddle() - 54.87) < 1e-9, await paddle());
    await d.key("ArrowRight");
    t.ok("tap right", Math.abs(await paddle() - 59) < 1e-9, await paddle());
    await d.keyDown("ArrowRight"); await sleep(400); await d.keyUp("ArrowRight"); await sleep(60);
    const moved = await paddle();
    t.ok("held steer moves about one step per tick", moved > 59 + 4.13 * 6 && moved < 59 + 4.13 * 14, moved);
    const before = await paddle();
    await d.key("ArrowUp"); await d.key("ArrowDown");
    t.eq("up down swallowed", await paddle(), before);
    await d.rotate(90);
    t.ok("wheel a quarter turn = 29.5 cells", Math.abs(await paddle() - Math.min(118, before + 29.5)) < 1.5, await paddle());
    await d.rotate(-720, { steps: 80, stepMs: 8 });
    t.eq("clamps at 0", await paddle(), 0);
    t.eq("no clicks, no detents: still brick", (await d.state()).view, "brick");
  });

  await section("brick-inert", async () => {
    await page.send("Network.enable");
    await toBrick();
    await d.press("select"); await sleep(300);
    const pos = () => page.evaluate(`${P}.brick.game.y`);
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(100);
    const a = await pos();
    await sleep(300);
    t.eq("no ticks while inert", await pos(), a);
    t.eq("view offline, brick state kept", [(await d.state()).view, (await d.state()).title], ["offline", "Brick"]);
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(200);
    t.ok("resumes", (await pos()) !== a);
  });

  await section("audio", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(500);
    const peak = (ms) => page.evaluate(`new Promise((res)=>{const g=${P}.graph;const a=g.ctx.createAnalyser();a.fftSize=2048;g.master.connect(a);const b=new Float32Array(2048);let m=0;const end=performance.now()+${ms};(function f(){a.getFloatTimeDomainData(b);for(const v of b)m=Math.max(m,Math.abs(v));performance.now()<end?setTimeout(f,10):(g.master.disconnect(a),res(m))})()})`);
    const state = await page.evaluate(`${P}.graph.ctx.state`);
    t.eq("context running", state, "running");
    const loud = await peak(300);
    console.log("    peak at 50%", loud);
    t.ok("audible signal through the graph", loud > 0.01, loud);
    await d.rotate(-240, { steps: 40, stepMs: 8 });
    await sleep(300);
    t.eq("volume 0", (await np()).volume, 0);
    const quiet = await peak(200);
    console.log("    peak at 0%", quiet);
    t.ok("master gain silences", quiet < 0.001, quiet);
    const buffer = await page.evaluate(`(()=>{const b=${P}.graph.clickBuffer;const d=b.getChannelData(0);let m=0;for(const v of d)m=Math.max(m,Math.abs(v));return {ms:b.length/b.sampleRate*1000,peak:m}})()`);
    console.log("    click", buffer);
    t.ok("click few ms, non-silent", buffer.ms < 10 && buffer.peak > 0.2);
  });

  await section("icons", async () => {
    await d.fresh();
    await d.rotate(46); await d.press("select"); await sleep(280);
    await d.rotate(16); await d.press("select");
    await d.rotate(16); await d.press("select");
    await d.press("menu"); await sleep(280);
    await d.rotate(-16);
    await d.press("play"); await sleep(400);
    t.eq("hidden mode text", await page.evaluate(`${root}.querySelector('.np-modes').textContent`), "Shuffle on, Repeat one");
    await sleep(300);
    await d.shot("icons-one");
    await d.press("menu"); await sleep(280);
    await d.rotate(16); await d.press("select"); await sleep(280);
    await d.press("select");
    await d.press("menu"); await sleep(280);
    await d.rotate(16); await d.press("select"); await sleep(400);
    t.eq("hidden mode text 2", await page.evaluate(`${root}.querySelector('.np-modes').textContent`), "Shuffle on, Repeat all");
    await d.shot("icons-all");
  });

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
