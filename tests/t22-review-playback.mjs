// Specs 43 and 45: the reviews' rulings on playback, menus, power and tags, on the product page.
import { deflateSync } from "node:zlib";
import { openPage } from "../dev/cdp.mjs";
import { BASE, boot, sleep, T, waitFor } from "./h.mjs";
import { FAKES, file, P, product, ROOT, tagged, tone } from "./product.mjs";

const { browser, page, close, logs } = await boot();
const a = product(page);
const { d } = a;
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + WATCH });
  await fn();
  await page.resetSection();
};
const IMPORT = BASE + "?import";
const SEAM = 150;

// Counts play() on every element, and keeps Media Session handlers past their removal. __refuse
// fails that many plays, __playGate holds a play's promise with the element running, and __places
// keeps every place written to the store. A "held" entry closes the open gate for one page load.
const WATCH = `
window.__plays = 0;
const play = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  window.__plays++;
  if (window.__refuse > 0) { window.__refuse--; return Promise.reject(new DOMException("no", "NotAllowedError")); }
  const out = play.call(this);
  return window.__playGate ? out.then(() => window.__playGate) : out;
};
const held = sessionStorage.getItem("held");
if (held) {
  sessionStorage.removeItem("held");
  window.__gateOnly = JSON.parse(held);
  window.__openGate = new Promise((open) => { window.__open = () => { window.__openGate = null; open(); }; });
}
window.__places = [];
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (record, ...rest) {
  if (record?.key === "resume") window.__places.push(record.value);
  return put.call(this, record, ...rest);
};
window.__held = {};
const session = navigator.mediaSession;
const register = session.setActionHandler.bind(session);
session.setActionHandler = (name, fn) => { if (fn) window.__held[name] = fn; register(name, fn); };
const metadata = Object.getOwnPropertyDescriptor(MediaSession.prototype, "metadata");
window.__art = [];
Object.defineProperty(session, "metadata", {
  configurable: true,
  get() { return metadata.get.call(this); },
  set(v) { if (v) window.__art.push(v.artwork[0]?.src ?? null); metadata.set.call(this, v); },
});`;
const numbered = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`0${i + 1} Song${i + 1}.wav`, tone()]));
const music = (n = 4) => ({ Art: { Alb: numbered(n) } });
const element = `${P}.playback.current.el`;

const toSongs = async () => { await a.pick("Browse"); await a.pick("Songs"); };
const playing = async (n = 4) => {
  await a.open();
  logs.length = 0; // The page this replaced can still warn, once its database has been deleted under it.
  await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
  await a.setTree("A", music(n));
  await a.link("A");
  await a.focusRing();
  await toSongs();
  await d.press("select");
  t.ok("playing", await waitFor(async () => (await a.np())?.playing, 3000));
  await sleep(250);
};
const gate = () => page.evaluate("window.__openGate=new Promise((open)=>{window.__open=()=>{window.__openGate=null;open()}});0");
const release = () => page.evaluate("window.__open();0");
// Two skips, so the current track is one whose file is still held open.
const skipIntoGate = async () => {
  await gate();
  await d.press("forward"); await sleep(120);
  await d.press("forward"); await sleep(120);
  t.eq("the file is still opening", await page.evaluate(`[${element}.getAttribute("src"),${P}.playback.playing]`), [null, true]);
};
const stillAfterOpen = async (label) => {
  await page.evaluate("window.__plays=0;0");
  await release();
  await sleep(350);
  const s = await page.evaluate(`(()=>{const p=${P}.playback;return {started:window.__plays,element:p.current.el.paused,paused:p.paused,lock:navigator.mediaSession.playbackState,screen:${ROOT}.querySelector('.state').className}})()`);
  t.eq(label, s, { started: 0, element: true, paused: true, lock: "paused", screen: "state paused" });
};
const parkedAway = async ({ n = 4, at = 7, permission = "granted" } = {}) => {
  await playing(n);
  await d.press("forward"); await sleep(150);
  await page.evaluate(`${element}.currentTime=${at};0`);
  await sleep(SEAM * 2);
  await d.press("play");
  await waitFor(async () => (await a.np()).playing === false, 1000);
  await sleep(120);
  if (permission !== "granted") await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__permission=${JSON.stringify(permission)};` });
  await a.reopen();
  await sleep(150);
};
const queued = () => page.evaluate(`${P}.playback.order.map((i)=>${P}.playback.queue[i].name)`);
const stored = async () => (await a.meta()).resumeQueue;
const spec = (name) => `window.__tree.A.Art.Alb[${JSON.stringify(name)}]`;
const makeJunk = (name) => page.evaluate(`Object.assign(${spec(name)},{junk:true,audio:false});__saveTree();0`);
const skipped = () => page.evaluate(`${P}.importer.skipped`);
const title = async () => (await a.np())?.title;
const playingNow = () => page.evaluate(`${P}.playback.playing && !${element}.paused`);
const mediaKey = (name) => page.evaluate(`window.__held.${name}({action:${JSON.stringify(name)}});0`);
const presses = async (n) => { for (let i = 0; i < n; i++) { await d.press("play"); await sleep(40); } };
const toQueue = async (tree) => {
  await a.open();
  logs.length = 0;
  await a.setTree("A", tree);
  await a.link("A");
  await a.focusRing();
  await toSongs();
};
// The parked track's file is behind the open gate, with its folder not waiting.
const reopenHeld = async (only = ["02 Song2.wav"]) => {
  await page.evaluate(`sessionStorage.setItem("held",${JSON.stringify(JSON.stringify(only))});0`);
  await a.reopen();
  await sleep(150);
  t.eq("a real parked open: folder not waiting, file behind the gate", await page.evaluate(`(()=>{const p=${P}.playback;return [!!p.parked,p.current?.el.getAttribute("src"),${P}.importer.waiting.size]})()`), [true, null, 0]);
  await a.focusRing();
  await a.pick("Now Playing");
};
// A quiet open that failed, with its folder not waiting: parked, and nothing open.
const stranded = async (n = 5) => {
  await parkedAway({ n });
  await page.evaluate(`${spec("02 Song2.wav")}.unreadable=true;__saveTree();0`);
  await a.reopen();
  await sleep(200);
  await page.evaluate(`delete ${spec("02 Song2.wav")}.unreadable;__saveTree();0`);
  t.eq("parked, its open failed quietly", await page.evaluate(`[!!${P}.playback.parked,!!${P}.playback.current,${P}.importer.waiting.size]`), [true, false, 0]);
  await a.focusRing();
  await a.pick("Now Playing");
};
const heldResume = async () => {
  await playing(5);
  await d.press("play");
  await waitFor(async () => (await a.np()).playing === false, 1000);
  await gate();
  await d.press("forward"); await sleep(120);
  await d.press("forward"); await sleep(120);
  await d.press("play"); await sleep(120);
  t.eq("a resume holds the chain, waiting on a file", await page.evaluate(`[${element}.getAttribute("src"),${P}.playback.paused]`), [null, false]);
};
const pngCrc = (() => {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  return (b) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();
const png = () => {
  const chunk = (type, body) => {
    const named = Buffer.concat([Buffer.from(type, "latin1"), body]);
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    named.copy(out, 4);
    out.writeUInt32BE(pngCrc(named), body.length + 8);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(2, 0); head.writeUInt32BE(2, 4); head[8] = 8; head[9] = 2;
  const rows = Buffer.from([0, 200, 0, 0, 200, 0, 0, 0, 200, 0, 0, 200, 0, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
};

try {
  await section("pause-skip", async () => {
    await playing();
    await skipIntoGate();
    await d.press("play"); await sleep(120);
    t.eq("Pause shows at once, before the file opens", [(await a.np()).playing, await page.evaluate("navigator.mediaSession.playbackState")], [false, "paused"]);
    await stillAfterOpen("Pause wins over a skip's open");
    await d.press("play");
    t.ok("Play then starts it", await waitFor(async () => (await a.np()).playing && !(await page.evaluate(`${element}.paused`)), 1500));
    t.eq("console clean", logs, []);
  });

  await section("pause-media", async () => {
    await playing();
    await skipIntoGate();
    await page.evaluate("window.__held.pause({action:'pause'});0");
    await sleep(120);
    await stillAfterOpen("a media pause wins too");
  });

  await section("pause-crossfade", async () => {
    await playing();
    await gate();
    await d.press("forward"); await sleep(150);
    await page.evaluate(`${element}.currentTime=${element}.duration-2.2;0`);
    t.ok("a crossfade starts into a file still opening", await waitFor(() => page.evaluate(`!!${P}.playback.cross`), 2000));
    await d.press("play"); await sleep(120);
    await stillAfterOpen("Pause wins over a crossfade's open");
  });

  await section("pause-restart", async () => {
    await playing();
    await skipIntoGate();
    await page.evaluate(`${P}.settings.set("repeat","one");0`);
    await d.press("forward"); await sleep(120);
    await d.press("play"); await sleep(120);
    await stillAfterOpen("Pause wins over a restart's open");
  });

  await section("pause-resume", async () => {
    await parkedAway({ permission: "prompt" });
    await gate();
    await a.focusRing();
    await a.pick("Now Playing");
    await d.press("play"); await sleep(200);
    await d.press("play"); await sleep(120);
    t.eq("the second press pauses", (await a.np()).playing, false);
    await stillAfterOpen("Pause wins over a resume's open");
  });

  await section("pause-off", async () => {
    await playing();
    await skipIntoGate();
    await page.evaluate(`${P}.power.enter();0`);
    await sleep(120);
    await stillAfterOpen("off wins over a file still opening");
  });

  await section("pause-off-parked", async () => {
    await parkedAway({ permission: "prompt" });
    await gate();
    await a.focusRing();
    await a.pick("Now Playing");
    await d.press("play"); await sleep(200);
    await page.evaluate(`${P}.power.enter();0`);
    await sleep(120);
    await stillAfterOpen("off wins over a parked track opening");
  });

  await section("pause-lost", async () => {
    await playing();
    await skipIntoGate();
    const other = await openPage(browser, BASE);
    await other.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
    const b = product(other);
    await b.open({ clear: false });
    await waitFor(async () => (await a.state()).view === "lost", 2000);
    await page.send("Page.bringToFront");
    await page.evaluate("window.__plays=0;0");
    await release();
    await sleep(350);
    t.eq("the lost window stays silent", await page.evaluate(`[window.__plays,${element}.paused,${P}.playback.paused]`), [0, true, true]);
    await other.send("Page.close");
  });

  await section("shuffle-parked", async () => {
    await parkedAway({ n: 6, permission: "prompt" });
    t.eq("parked, unopened, in list order", [await page.evaluate(`${P}.playback.current`), await queued()], [null, ["Song1", "Song2", "Song3", "Song4", "Song5", "Song6"]]);
    await page.evaluate(`${P}.settings.set("shuffle","songs");0`);
    await sleep(150);
    const order = await queued();
    t.eq("the setting reaches the parked queue, the parked track first", [order[0], await page.evaluate(`${P}.playback.position`)], ["Song2", 1]);
    t.eq("the new order is stored", (await stored()).built?.mode, true);
    await a.reopen();
    await sleep(150);
    t.eq("it comes back", await queued(), order);
    await page.evaluate(`${P}.settings.set("shuffle","off");0`);
    await sleep(150);
    t.eq("Off returns the true place, as 11 does", [await queued(), await page.evaluate(`${P}.playback.position`), (await stored()).built], [["Song1", "Song2", "Song3", "Song4", "Song5", "Song6"], 2, null]);
  });

  await section("paused-store", async () => {
    await playing();
    await d.press("play");
    await waitFor(async () => (await a.np()).playing === false, 1000);
    await sleep(120);
    const track = await page.evaluate(`${P}.playback.trackId`);
    await page.evaluate(`${P}.playback.seek(12,${track});0`);
    t.ok("a paused seek is stored at once", await waitFor(async () => Math.abs(((await a.meta()).resume?.time ?? 0) - 12) < 0.5, 600), JSON.stringify((await a.meta()).resume));
    await d.press("forward");
    t.ok("a paused track change too", await waitFor(async () => (await a.meta()).resume?.track.endsWith("02 Song2.wav"), 600), JSON.stringify((await a.meta()).resume));
  });

  await section("waiting-keys", async () => {
    await parkedAway({ permission: "prompt" });
    await a.focusRing();
    await a.pick("Now Playing");
    await d.press("forward"); await sleep(150);
    await d.press("back"); await sleep(150);
    const n = await a.np();
    t.eq("Forward and Back do nothing while its folder waits", [n.title, n.index, await page.evaluate("window.__requests.length")], ["Song2", 2, 0]);
  });

  await section("media-parked", async () => {
    await parkedAway();
    await page.evaluate(`window.__tree.A.Art.Alb["02 Song2.wav"].unreadable=true;__saveTree();0`);
    await a.reopen();
    await sleep(200);
    await page.evaluate(`delete window.__tree.A.Art.Alb["02 Song2.wav"].unreadable;__saveTree();0`);
    t.eq("parked, its open failed quietly", await page.evaluate(`[!!${P}.playback.parked,${P}.playback.current]`), [true, null]);
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Albums");
    await a.highlight("Alb");
    await page.evaluate("window.__held.play({action:'play'});0");
    await sleep(350);
    t.eq("a media Play resumes the parked track, never the highlighted row", [(await a.state()).view, (await a.state()).title, await page.evaluate(`${P}.playback.song.name`), await page.evaluate(`${P}.playback.playing`)], ["list", "Albums", "Song2", true]);

    console.log("# with no queue, 08 stands");
    await page.evaluate(`${P}.playback.clear()`);
    await sleep(120);
    await page.evaluate("window.__held.play({action:'play'});0");
    await sleep(350);
    t.eq("the highlighted row starts", [(await a.state()).view, await page.evaluate(`${P}.playback.queue.length`)], ["now-playing", 4]);
  });

  await section("source-row", async () => {
    await parkedAway({ permission: "prompt" });
    await a.focusRing();
    await a.pick("Browse");
    await a.highlight("Songs");
    await d.press("play");
    t.ok("Play on the parked queue's own source resumes it", await waitFor(() => page.evaluate(`${P}.playback.playing`), 2000));
    t.eq("through the permission rule", await page.evaluate("window.__requests"), [{ testId: "A", active: true }]);
    t.eq("with no restart of the list", await page.evaluate(`[${P}.playback.song.name,${element}.currentTime>=6.5]`), ["Song2", true]);
    const place = (await a.meta()).resume;
    t.ok("the stored place stays on it", place.track.endsWith("02 Song2.wav") && place.time >= 6.5, JSON.stringify(place));
    t.eq("and never left it", (await page.evaluate("window.__places")).filter((p) => p.time < 6.5), []);

    console.log("# refused");
    await d.press("play"); await sleep(150);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';window.__answer='denied';" });
    await a.reopen();
    await sleep(150);
    await a.focusRing();
    await a.pick("Browse");
    await a.highlight("Songs");
    await d.press("play"); await sleep(250);
    t.eq("refused: stays paused on the list", [(await a.state()).title, await page.evaluate(`${P}.playback.song.name`), await page.evaluate(`${P}.playback.playing`)], ["Browse", "Song2", false]);
    const kept = (await a.meta()).resume;
    t.ok("refused: the stored place stays", kept.track.endsWith("02 Song2.wav") && kept.time >= 6.5, JSON.stringify(kept));
  });

  await section("art", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__strict=true;" });
    await a.open();
    await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
    await a.setTree("A", { Art: { Alb: { ...numbered(2), "cover.png": file({ b64: png() }) } } });
    await a.link("A");
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await sleep(300);
    t.ok("art reads while the folder is allowed", (await page.evaluate("window.__art")).some((src) => src?.startsWith("blob:")), (await page.evaluate("window.__art")).join());
    await d.press("play"); await sleep(250);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await a.reopen();
    await sleep(300);
    t.ok("no art while its folder waits", (await page.evaluate("window.__art")).every((src) => !src?.startsWith("blob:")), (await page.evaluate("window.__art")).join());
    t.eq("and the failure is not remembered", await page.evaluate(`${P}.media.art.has(${P}.playback.song.id)`), false);
    await a.focusRing();
    await a.pick("Reconnect");
    t.ok("when the folder comes back, its art is published", await waitFor(async () => (await page.evaluate("window.__art")).some((src) => src?.startsWith("blob:")), 1500), (await page.evaluate("window.__art")).join());
    t.eq("console clean", logs, []);
  });

  await section("one-window", async () => {
    await playing();
    const other = await openPage(browser, BASE);
    await other.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
    const b = product(other);
    await b.open({ clear: false });
    await waitFor(async () => (await a.state()).view === "lost", 2000);
    await page.send("Page.bringToFront");

    console.log("# a key runs nothing else");
    await page.evaluate(`(()=>{window.__active=0;const act=${P}.activity.bind(${P});${P}.activity=()=>{window.__active++;act()};window.__steals=0;const r=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(n,o,f)=>{window.__steals++;return Promise.resolve()};${ROOT}.querySelector('.ring').focus({preventScroll:true})})()`);
    await d.key("ArrowDown");
    await sleep(60);
    t.eq("the key steals, and no other listener runs", await page.evaluate("[window.__steals,window.__active]"), [1, 0]);
    await page.evaluate(`${P}.oneWindow.retaking=false;0`);

    console.log("# what is not a press");
    await page.evaluate(`(()=>{window.__steals=0;window.__passed=[];document.addEventListener("keydown",(e)=>window.__passed.push(e.defaultPrevented?"stopped "+e.key:e.key));0})()`);
    const keys = [["k", "KeyK", 2], ["k", "KeyK", 1], ["k", "KeyK", 4], ["Shift", "ShiftLeft", 0], ["Control", "ControlLeft", 0], ["Alt", "AltLeft", 0], ["Meta", "MetaLeft", 0], ["Tab", "Tab", 0]];
    for (const [key, code, modifiers] of keys) {
      await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
    }
    await sleep(60);
    t.eq("a modifier alone, Tab, or a key held with Ctrl, Alt or Meta neither steals nor is stopped", await page.evaluate("[window.__steals,window.__passed]"), [0, keys.map(([key]) => key)]);

    console.log("# and it acts on nothing");
    await page.evaluate(`(()=>{window.__ran=[];for(const n of ["press","select"]){const f=${P}[n].bind(${P});${P}[n]=(...a)=>{window.__ran.push(n);f(...a)}};0})()`);
    const held = (selector) => page.evaluate(`(()=>{const o={key:"Enter",ctrlKey:true,bubbles:true,composed:true,cancelable:true};const el=${ROOT}.querySelector(${JSON.stringify(selector)});const e=new KeyboardEvent("keydown",o);el.dispatchEvent(e);el.dispatchEvent(new KeyboardEvent("keyup",o));return e.defaultPrevented})()`);
    t.eq("on the screen", await held(".body-clip"), false);
    t.eq("or on a button", await held(".btn.play"), false);
    t.eq("no press runs", await page.evaluate("[window.__ran,window.__steals]"), [[], 0]);

    console.log("# a press on the screen");
    await page.evaluate("window.__steals=0;window.__active=0;0");
    const rect = await page.evaluate(`(()=>{const r=${ROOT}.querySelector('.screen').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await page.click(rect.x, rect.y);
    await sleep(80);
    t.eq("a press anywhere on the device steals, screen included", await page.evaluate("[window.__steals,window.__active]"), [1, 0]);
    await page.evaluate(`${P}.oneWindow.retaking=false;window.__steals=0;0`);
    const body = await page.evaluate(`(()=>{const r=${ROOT}.querySelector('.device').getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2}})()`);
    await page.click(body.x, body.y);
    await sleep(80);
    t.eq("so does one on the body", await page.evaluate("window.__steals"), 1);
    await page.evaluate(`${P}.oneWindow.retaking=false;window.__steals=0;0`);
    await page.click(10, 10);
    await sleep(80);
    t.eq("a press beside the device does not", await page.evaluate("window.__steals"), 0);
    await other.send("Page.close");
  });

  await section("chord", async () => {
    await a.open();
    await a.setTree("A", music(2));
    await a.link("A");
    await a.focusRing();
    const r = await d.rect();
    const pressed = `(()=>{window.__pressed=[];const press=${P}.press.bind(${P});${P}.press=(n)=>{__pressed.push(n);press(n)};0})()`;
    await page.evaluate(pressed);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    await page.evaluate("window.__marker=1");
    const touch = (type, touchPoints) => page.send("Input.dispatchTouchEvent", { type, touchPoints });
    const playFinger = { x: r.cx, y: r.cy + 0.32 * r.width, id: 1 };
    const menuFinger = { x: r.cx, y: r.cy - 0.32 * r.width, id: 2 };
    const held = async (moved) => {
      await touch("touchStart", [playFinger]);
      await sleep(40);
      await touch("touchStart", [playFinger, menuFinger]);
      await sleep(200);
      await touch("touchMove", moved);
      await sleep(5200);
      const reloaded = await page.evaluate("window.__marker === undefined");
      await touch("touchEnd", []);
      await sleep(120);
      return reloaded;
    };
    t.eq("the first finger turning the wheel leaves the chord", await held([{ ...playFinger, x: playFinger.x + 40 }, menuFinger]), false);
    t.eq("and its release presses nothing", await page.evaluate("window.__pressed"), []);
    t.eq("the finger that joined leaves it too", await held([playFinger, { ...menuFinger, x: menuFinger.x + 40 }]), false);
    t.eq("and its release presses nothing", await page.evaluate("window.__pressed"), []);

    console.log("# every click until a fresh press");
    await touch("touchStart", [playFinger]);
    await touch("touchStart", [playFinger, menuFinger]);
    await sleep(150);
    await touch("touchEnd", []);
    await sleep(120);
    const clicks = `${ROOT}.querySelector('.btn.menu').click();${ROOT}.querySelector('.btn.play').click();${ROOT}.querySelector('.btn.menu').click();0`;
    await page.evaluate(clicks);
    await sleep(60);
    t.eq("every click is eaten, not only one", await page.evaluate("window.__pressed"), []);
    await page.evaluate(`${ROOT}.querySelector('.ring').focus({preventScroll:true});0`);
    await d.key("Shift");
    await sleep(40);
    await page.evaluate(`${ROOT}.querySelector('.btn.menu').click();0`);
    await sleep(60);
    t.eq("a fresh key press clears it", await page.evaluate("window.__pressed"), ["menu"]);

    console.log("# as a fresh pointer press does");
    await page.evaluate("window.__pressed.length=0;0");
    await touch("touchStart", [playFinger]);
    await touch("touchStart", [playFinger, menuFinger]);
    await sleep(150);
    await touch("touchEnd", []);
    await sleep(120);
    await page.evaluate(clicks);
    await sleep(40);
    t.eq("eaten again after a new chord", await page.evaluate("window.__pressed"), []);
    await touch("touchStart", [{ x: r.cx, y: r.cy, id: 3 }]);
    await sleep(30);
    await touch("touchEnd", []);
    await sleep(150);
    await page.evaluate("window.__pressed.length=0;0");
    await page.evaluate(`${ROOT}.querySelector('.btn.menu').click();0`);
    await sleep(40);
    t.eq("a fresh pointer press clears it", await page.evaluate("window.__pressed"), ["menu"]);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  });

  await section("worker-wait", async () => {
    await a.open();
    const waiting = (answerAt) => `(()=>{window.__marker=1;window.__posted=[];window.__began=performance.now();const w=Object.assign(new EventTarget(),{state:"installed",postMessage:(m)=>{window.__posted.push(m);${answerAt ? `setTimeout(()=>{w.state="activated";w.dispatchEvent(new Event("statechange"))},${answerAt})` : ""}}});navigator.serviceWorker.getRegistration=()=>Promise.resolve({waiting:w});${P}.power.restart();})()`;
    const gone = () => page.evaluate("window.__marker === undefined").catch(() => false);
    await page.evaluate(waiting(0));
    await sleep(1600);
    t.eq("a worker that does not answer: still waiting past 1,000 ms", await gone(), false);
    await sleep(2800);
    t.eq("still waiting at 4.4 s", await gone(), false);
    t.ok("reloads by 5,000 ms", await waitFor(gone, 1100));
    await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 3000);
    await waitFor(async () => (await a.state().catch(() => null))?.view === "list", 4000);
    await page.evaluate(waiting(1700));
    await sleep(1300);
    t.eq("an answer at 1.7 s is waited for", await gone(), false);
    t.ok("and reloads at once when it comes", await waitFor(gone, 1200));
  });

  await section("browse", async () => {
    const song = (title, albumArtist, track) => file({ b64: tagged({ title, artist: "Alpha", album: "Hits", track, albumArtist, genre: "Rock", composer: "Cole" }, 20) });
    await a.open();
    await a.setTree("A", { Lib: {
      "a.mp3": song("Mine One", "Alpha", 1), "b.mp3": song("Various One", "Various", 1),
      "c.mp3": song("Mine Two", "Alpha", 2), "d.mp3": song("Various Two", "Various", 2),
    } });
    await a.link("A");
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Artists");
    await a.pick("Alpha");
    t.eq("two albums with one title stay apart", await a.titles(), ["All Songs", "Hits", "Hits"]);
    const grouped = ["Mine One", "Mine Two", "Various One", "Various Two"];
    await a.pick("All Songs");
    t.eq("an artist's songs group by album, each in track order", await a.titles(), grouped);
    await a.back();
    await a.pick("Hits");
    t.eq("the first album of that title", [(await a.state()).title, await a.titles()], ["Hits", ["Mine One", "Mine Two"]]);
    await a.back();
    await d.key("ArrowDown");
    await d.key("ArrowRight"); await sleep(280);
    t.eq("the second keeps artistAlbum working", [(await a.state()).title, await a.titles()], ["Hits", ["Various One", "Various Two"]]);
    await a.back(3);
    await a.pick("Genres");
    await a.pick("Rock");
    await a.pick("Alpha");
    t.eq("a genre's songs group the same way", await a.titles(), grouped);
    await a.back(3);
    await a.pick("Composers");
    await a.pick("Cole");
    t.eq("a composer's too", await a.titles(), grouped);
    await a.back(2);
    await a.pick("Albums");
    t.eq("Albums keeps them apart as before", await a.titles(), ["All", "Hits", "Hits"]);

    console.log("# accents and number forms");
    const on = (title, album, track) => file({ b64: tagged({ title, artist: "Alpha", album, track, genre: "Rock", composer: "Cole" }, 20) });
    await a.open();
    await a.setTree("A", { Lib: {
      "a.mp3": on("One", "Cafe", 1), "b.mp3": on("Two", "Café", 1), "c.mp3": on("Three", "Cafe", 2), "d.mp3": on("Four", "Café", 2),
      "e.mp3": on("Five", "Vol 2", 1), "f.mp3": on("Six", "Vol 02", 1), "g.mp3": on("Seven", "Vol 2", 2), "h.mp3": on("Eight", "Vol 02", 2),
    } });
    await a.link("A");
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Artists");
    await a.pick("Alpha");
    await a.pick("All Songs");
    t.eq("two album keys never compare as equal, so no album interleaves another", await a.titles(), ["One", "Three", "Two", "Four", "Six", "Eight", "Five", "Seven"]);
  });

  await section("tags", async () => {
    const utf8 = (text) => Buffer.from(text, "utf8").toString("latin1");
    const tree = { Lib: {
      "a.mp3": file({ b64: tagged({ title: utf8("Café"), artist: utf8("Björk"), album: "A", genre: "(17)" }, 5) }),
      "b.mp3": file({ b64: tagged({ title: "Café plain", artist: "B", album: "B", genre: "80" }, 5) }),
      "c.mp3": file({ b64: tagged({ title: "C", artist: "C", album: "C", genre: "(200)" }, 5) }),
      "d.mp3": file({ b64: tagged({ title: "D", artist: "D", album: "D", genre: "Jazz" }, 5) }),
    } };
    const songs = () => page.evaluate(`${P}.importer.songs.map((s)=>[s.name,s.artistName,s.genre ?? null])`);
    await a.open();
    await a.setTree("A", tree);
    await a.link("A");
    t.eq("Latin-1 that is really UTF-8, and ID3v1 genres", await songs(), [
      ["Café", "Björk", "Rock"], ["Café plain", "B", "Folk"], ["C", "C", null], ["D", "D", "Jazz"],
    ]);
    await a.open({ url: IMPORT });
    await a.setTree("A", tree);
    await a.link("A");
    t.eq("the test page stays as it is", await songs(), [
      [utf8("Café"), utf8("Björk"), null], ["Café plain", "B", "80"], ["C", "C", null], ["D", "D", "Jazz"],
    ]);
  });

  await section("fail-start", async () => {
    const bad = { Art: { Alb: { "01 Bad.wav": file({ junk: true }), "02 Good.wav": tone(), "03 Last.wav": tone() } } };
    await toQueue(bad);
    await d.press("select");
    t.ok("a file that will not decode is left out, and the queue moves on", await waitFor(async () => (await title()) === "Good" && (await a.np()).playing, 3000), JSON.stringify(await a.np()));
    t.eq("Skipped counts it once", await skipped(), 1);
    await sleep(120);
    t.eq("once in the store too", ((await a.meta()).failed ?? []).length, 1);
    t.eq("the rejection that follows says nothing more", logs, []);

    console.log("# a pause during it carries over");
    await toQueue(bad);
    await gate();
    await d.press("select"); await sleep(120);
    await d.press("play"); await sleep(120);
    await release();
    t.ok("the queue moves on, paused", await waitFor(async () => (await title()) === "Good" && (await a.np()).playing === false, 2000), JSON.stringify(await a.np()));
    await sleep(200);
    t.eq("and nothing plays", await page.evaluate(`[${P}.playback.paused,${element}.paused]`), [true, true]);

    console.log("# the only track");
    await toQueue({ Art: { Alb: { "01 Only.wav": file({ junk: true }) } } });
    await d.press("select");
    t.ok("the queue ends", await waitFor(() => page.evaluate(`${P}.playback.queue.length === 0`), 2000));
    t.eq("counted once", await skipped(), 1);
    t.eq("console clean", logs, []);
  });

  await section("fail-mid", async () => {
    const tree = { Art: { Alb: { "01 One.wav": tone(), "02 Two.wav": tone(), "03 Bad.wav": file({ junk: true }), "04 Four.wav": tone() } } };
    const start = async (songs) => {
      await toQueue(songs);
      await d.press("select");
      await waitFor(async () => (await a.np())?.playing, 3000);
      await sleep(200);
    };
    await start(tree);
    await page.evaluate(`window.__gateOnly=["03 Bad.wav"];0`);
    await gate();
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(120);
    t.eq("it is current, still opening", await title(), "Bad");
    await release();
    t.ok("mid-queue it is left out too", await waitFor(async () => (await title()) === "Four" && (await a.np()).playing, 2000), JSON.stringify(await a.np()));
    t.eq("and counted once", await skipped(), 1);
    await d.press("back");
    t.ok("it stays out of this queue", await waitFor(async () => (await title()) === "Two", 1500), await title());
    t.eq("console clean", logs, []);

    console.log("# waiting as the next track");
    await start(tree);
    await d.press("forward");
    t.ok("found while it waits", await waitFor(async () => (await skipped()) === 1, 1500));
    await d.press("forward");
    t.ok("Forward passes it", await waitFor(async () => (await title()) === "Four", 1500), await title());

    console.log("# reported by a track already playing");
    await start(music(3));
    await page.evaluate(`${element}.dispatchEvent(new Event("error"));0`);
    t.ok("the queue moves on", await waitFor(async () => (await title()) === "Song2" && (await a.np()).playing, 1500), await title());
    t.eq("and it counts", await skipped(), 1);
  });

  await section("fail-play", async () => {
    const refused = async () => {
      await toQueue(music(3));
      await page.evaluate("window.__refuse=1;0");
      await d.press("select");
      await sleep(250);
      t.eq("after a failed play(), nothing is still opening", await page.evaluate(`(()=>{const p=${P}.playback;return [p.opening,p.loading,p.connected,p.queue.length,navigator.mediaSession.playbackState]})()`), [false, false, false, 3, "paused"]);
      t.ok("it is logged as 12 says", logs.length === 1 && logs[0].includes("play failed"), logs.join());
      logs.length = 0;
      await page.evaluate("window.__plays=0;0");
    };
    await refused();
    await d.press("play");
    t.ok("the first press of Play retries", await waitFor(playingNow, 1500));
    t.eq("once", await page.evaluate("window.__plays"), 1);
    await refused();
    await mediaKey("play");
    t.ok("so does a media Play", await waitFor(playingNow, 1500));

    console.log("# on a skip");
    await playing();
    logs.length = 0;
    await page.evaluate("window.__refuse=1;0");
    await d.press("forward");
    await sleep(250);
    logs.length = 0;
    await d.press("play");
    t.ok("Play retries there too", await waitFor(playingNow, 1500), JSON.stringify(await a.np()));
    t.eq("on the new track", await title(), "Song2");
  });

  await section("press-chain", async () => {
    await heldResume();
    await presses(3);
    t.eq("the last press shows at once", [(await a.np()).playing, await page.evaluate("navigator.mediaSession.playbackState")], [false, "paused"]);
    await stillAfterOpen("four device presses end on Pause");
    await heldResume();
    await presses(2);
    await release();
    t.ok("three end on Play", await waitFor(playingNow, 1500));

    console.log("# media keys");
    await heldResume();
    await mediaKey("pause");
    await mediaKey("play");
    await mediaKey("pause");
    await stillAfterOpen("the same from media keys");

    console.log("# while a queue starts");
    for (const [label, off, on] of [["device", () => d.press("play"), () => d.press("play")], ["media", () => mediaKey("pause"), () => mediaKey("play")]]) {
      await toQueue(music(3));
      await gate();
      await d.press("select"); await sleep(120);
      await off(); await sleep(60);
      await on(); await sleep(60);
      await release();
      t.ok(`${label}: Pause, then Play, leaves it playing`, await waitFor(playingNow, 1500), JSON.stringify(await a.np()));
    }
  });

  await section("pause-now", async () => {
    await playing();
    await d.press("play");
    await waitFor(async () => (await a.np()).playing === false, 1000);
    await page.evaluate("window.__playGate=new Promise((open)=>{window.__openPlay=open});0");
    await d.press("play"); await sleep(150);
    t.eq("a resume holds the chain, with the element running", await page.evaluate(`[${element}.paused,${P}.playback.paused]`), [false, false]);
    await d.press("play");
    t.eq("Pause stops the element at once", await page.evaluate(`${element}.paused`), true);
    await page.evaluate("window.__playGate=null;window.__openPlay();0");
    await sleep(250);
    t.eq("and it stays stopped", await page.evaluate(`[${element}.paused,${P}.playback.paused,${P}.playback.loaded]`), [true, true, true]);
    t.eq("console clean", logs, []);
  });

  await section("pause-fade", async () => {
    await playing();
    await d.press("play");
    await waitFor(async () => (await a.np()).playing === false, 1000);
    await page.evaluate(`${element}.currentTime=${element}.duration-1;0`);
    await sleep(350);
    const still = `(()=>{const p=${P}.playback;return [!!p.cross,p.fading.size,p.song.name]})()`;
    t.eq("a paused track starts no crossfade", await page.evaluate(still), [false, 0, "Song1"]);
    await d.press("play");
    t.ok("Play carries on into the next track", await waitFor(async () => (await page.evaluate(`${P}.playback.song.name`)) === "Song2", 3500));

    console.log("# parked in its last two seconds");
    await parkedAway();
    const { resume: place } = await a.meta();
    await page.evaluate(`new Promise((res)=>{const o=indexedDB.open("mpod");o.onsuccess=()=>{const db=o.result;const tx=db.transaction("meta","readwrite");tx.objectStore("meta").put({key:"resume",value:${JSON.stringify({ ...place, time: 29 })}});tx.oncomplete=()=>{db.close();res(1)}}})`);
    await a.reopen();
    await waitFor(() => page.evaluate(`!${P}.playback.parked`), 1500);
    await sleep(350);
    t.eq("no crossfade from the place it opens at", await page.evaluate(still), [false, 0, "Song2"]);
    t.ok("at that place", (await page.evaluate(`${element}.currentTime`)) >= 28.5);
  });

  await section("seek-cross", async () => {
    await playing();
    await gate();
    await d.press("forward"); await sleep(150);
    await page.evaluate(`${element}.currentTime=${element}.duration-2.2;0`);
    t.ok("a crossfade into a file still opening", await waitFor(() => page.evaluate(`!!${P}.playback.cross`), 2000));
    await page.evaluate(`new Promise((done)=>{const p=${P}.playback;const el=p.cross.out.el;window.__out=el;el.addEventListener("ended",done,{once:true});el.currentTime=el.duration}).then(()=>{const p=${P}.playback;p.seek(5,p.trackId);return 1})`);
    await sleep(250);
    t.eq("a seek during a crossfade leaves the restored track playing", await page.evaluate(`[!!${P}.playback.cross,${P}.playback.song.name,${element}===window.__out,${element}.paused,${P}.playback.playing]`), [false, "Song2", true, false, true]);
    const at = await page.evaluate(`${element}.currentTime`);
    await sleep(300);
    t.ok("and it runs", (await page.evaluate(`${element}.currentTime`)) > at);
    await release();
    t.eq("console clean", logs, []);
  });

  await section("new-queue", async () => {
    await playing(6);
    await d.press("play");
    await waitFor(async () => (await a.np()).playing === false, 1000);
    await page.evaluate(`window.__gateOnly=["03 Song3.wav"];0`);
    await gate();
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(120);
    await d.press("play"); await sleep(120);
    t.eq("a resume holds the chain on Song3", await page.evaluate(`[${P}.playback.song.name,${element}.getAttribute("src")]`), ["Song3", null]);
    console.log("# asked before the new queue");
    await d.press("forward");
    await page.evaluate(`${P}.playback.seek(9,${P}.playback.trackId);0`);
    await d.press("menu"); await sleep(280);
    await a.highlight("Song5");
    await d.press("select");
    t.ok("a new queue waits for no file", await waitFor(playingNow, 1500), JSON.stringify(await a.np()));
    const names = async () => {
      const lock = await page.evaluate("navigator.mediaSession.metadata?.title");
      await waitFor(async () => (await a.meta()).resume?.track.endsWith("05 Song5.wav"), 500);
      return [await title(), (await a.np()).index, lock, (await a.meta()).resume?.track.split("/").at(-1)];
    };
    t.eq("the screen, the lock screen and the stored track name the track that plays", await names(), ["Song5", 5, "Song5", "05 Song5.wav"]);
    t.ok("what was asked before does nothing to it", (await page.evaluate(`${element}.currentTime`)) < 3);
    await release();
    await sleep(300);
    t.eq("nor when the old file opens", await names(), ["Song5", 5, "Song5", "05 Song5.wav"]);
    t.eq("console clean", logs, []);
  });

  await section("prompt-off", async () => {
    const asked = async () => {
      await parkedAway({ permission: "prompt" });
      await a.focusRing();
      await a.pick("Now Playing");
      await page.evaluate("window.__askGate=new Promise((open)=>{window.__answerNow=open});window.__plays=0;0");
      await d.press("play"); await sleep(120);
    };
    const silent = () => page.evaluate(`[window.__plays,${P}.playback.paused]`);
    await asked();
    await page.evaluate(`${P}.power.enter();0`);
    await sleep(80);
    await page.evaluate("window.__askGate=null;window.__answerNow();0");
    await sleep(300);
    t.eq("the answer plays nothing on a device that is off", await silent(), [0, true]);

    console.log("# or in a lost window");
    await asked();
    const other = await openPage(browser, BASE);
    await other.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
    await product(other).open({ clear: false });
    await waitFor(async () => (await a.state()).view === "lost", 2000);
    await page.send("Page.bringToFront");
    await page.evaluate("window.__askGate=null;window.__answerNow();0");
    await sleep(300);
    t.eq("nor in a window that has been lost", await silent(), [0, true]);
    await other.send("Page.close");
  });

  await section("parked-open", async () => {
    const settled = async () => {
      await sleep(350);
      const { resume } = await a.meta();
      t.ok("the stored place stays on the parked track", resume.track.endsWith("02 Song2.wav") && resume.time >= 6.5, JSON.stringify(resume));
      t.eq("and never left it", (await page.evaluate("window.__places")).filter((p) => !p.track.endsWith("02 Song2.wav") || p.time < 6.5), []);
    };
    console.log("# device presses");
    await parkedAway();
    await reopenHeld();
    await presses(4);
    await stillAfterOpen("four presses end on Pause");
    await settled();
    await parkedAway();
    await reopenHeld();
    await presses(3);
    await release();
    t.ok("three end on Play", await waitFor(playingNow, 1500));
    t.ok("from its place", await waitFor(() => page.evaluate(`${element}.currentTime >= 6.5`), 1000));

    console.log("# media keys");
    await parkedAway();
    await reopenHeld();
    for (const key of ["play", "pause", "play", "pause"]) await mediaKey(key);
    await stillAfterOpen("the same from media keys");
    await settled();
    await parkedAway();
    await reopenHeld();
    await mediaKey("play");
    await release();
    t.ok("a media Play plays it", await waitFor(playingNow, 1500));
    t.ok("from its place", await waitFor(() => page.evaluate(`${element}.currentTime >= 6.5`), 1000));

    console.log("# a press-driven open, with nothing connected");
    await stranded();
    await gate();
    await mediaKey("play"); await sleep(120);
    t.eq("opening", await page.evaluate(`[!!${P}.playback.current,${P}.playback.connected]`), [true, false]);
    await mediaKey("pause"); await sleep(60);
    await stillAfterOpen("a media Pause reaches a parked track while its file opens");
  });

  await section("parked-place", async () => {
    const same = async (label, before) => t.eq(label, [(await a.meta()).resume, (await page.evaluate("window.__places")).filter((p) => p.time < 6.5)], [before, []]);
    await stranded();
    const before = (await a.meta()).resume;
    await page.evaluate("window.__playGate=new Promise((open)=>{window.__openPlay=open});0");
    await d.press("play");
    t.ok("its file opens, and play() has not finished", await waitFor(() => page.evaluate(`!${P}.playback.parked && !${P}.playback.connected`), 1500));
    await sleep(120);
    await same("a parked open that has not connected leaves the stored place alone", before);
    await page.evaluate("window.__playGate=null;window.__openPlay();0");
    t.ok("it connects", await waitFor(playingNow, 1500));

    console.log("# whose play() failed");
    await stranded();
    const parked = (await a.meta()).resume;
    await page.evaluate("window.__refuse=1;0");
    await d.press("play");
    await sleep(350);
    await same("a parked open whose play() failed leaves it alone", parked);
    logs.length = 0;
    await d.press("play");
    t.ok("Play retries", await waitFor(playingNow, 1500));
    t.ok("from the place", await waitFor(() => page.evaluate(`${element}.currentTime >= 6.5`), 1000));

    console.log("# a new queue that never connected");
    await playing(4);
    await d.press("play");
    await waitFor(async () => (await a.np()).playing === false, 1000);
    await sleep(120);
    const held = await a.meta();
    await page.evaluate("window.__refuse=1;0");
    await d.press("menu"); await sleep(280);
    await a.highlight("Song3");
    await d.press("select");
    await sleep(350);
    t.eq("the stored track does not move to it", [(await a.meta()).resume, (await a.meta()).resumeQueue], [held.resume, held.resumeQueue]);
    logs.length = 0;
  });

  await section("quiet-next", async () => {
    await parkedAway();
    await reopenHeld();
    t.eq("a quiet open prepares no next track", await page.evaluate(`${P}.playback.next?.song.name ?? null`), null);
    await release();
    t.ok("until its own file has opened", await waitFor(() => page.evaluate(`${P}.playback.next?.song.name === "Song3"`), 1500));
  });

  await section("quiet-press", async () => {
    for (const [label, ask] of [["device", () => d.press("play")], ["media", () => mediaKey("play")]]) {
      await parkedAway();
      await makeJunk("02 Song2.wav");
      await reopenHeld();
      await ask();
      await sleep(120);
      await release();
      t.ok(`${label}: a press during a quiet open makes its failure follow 32`, await waitFor(async () => (await title()) === "Song3" && playingNow(), 2000), JSON.stringify(await a.np()));
      t.eq(`${label}: and it counts`, await skipped(), 1);
    }
    console.log("# with no press");
    await parkedAway();
    await makeJunk("02 Song2.wav");
    await reopenHeld();
    await release();
    await sleep(300);
    t.eq("it stays parked, and adds nothing", [await page.evaluate(`[!!${P}.playback.parked,!!${P}.playback.current]`), await skipped()], [[true, false], 0]);
  });

  await section("quiet-skip", async () => {
    const place = async (track, time) => waitFor(async () => { const r = (await a.meta()).resume; return r.track.endsWith(track) && r.time === time; }, 600);
    const pausedAtStart = () => page.evaluate(`[${P}.playback.paused,${P}.playback.loaded,${P}.playback.parked,${element}.currentTime]`);
    await stranded();
    await d.press("forward");
    t.ok("Forward moves to the next track", await waitFor(async () => (await title()) === "Song3", 1000), await title());
    t.eq("paused at 0:00", await pausedAtStart(), [true, true, null, 0]);
    t.ok("and the new place is stored at once", await place("03 Song3.wav", 0), JSON.stringify((await a.meta()).resume));
    await d.press("play");
    t.ok("Play starts it", await waitFor(playingNow, 1500));

    await stranded();
    await d.press("back");
    t.ok("Back moves to the previous track", await waitFor(async () => (await title()) === "Song1", 1000), await title());
    t.eq("paused at 0:00", await pausedAtStart(), [true, true, null, 0]);
    t.ok("and it is stored at once", await place("01 Song1.wav", 0), JSON.stringify((await a.meta()).resume));

    console.log("# a failure there follows 32");
    await stranded();
    await makeJunk("03 Song3.wav");
    const before = await skipped();
    await d.press("forward");
    t.ok("it moves past the file", await waitFor(async () => (await title()) === "Song4", 1500), await title());
    t.eq("still paused", await page.evaluate(`${P}.playback.paused`), true);
    t.eq("and it counts", (await skipped()) - before, 1);
  });

  await section("test-page", async () => {
    await a.open({ url: IMPORT });
    await a.setTree("A", music(4));
    await a.link("A");
    await a.focusRing();
    await a.pick("Songs");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    t.eq("no product parts", await page.evaluate(`[${P}.power,${P}.resume,${P}.oneWindow]`), [null, null, null].map(() => undefined));
    t.eq("console clean", logs, []);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
