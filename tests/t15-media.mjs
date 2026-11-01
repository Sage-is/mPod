// Spec 35: media controls, against a stubbed navigator.mediaSession that records every call.
import { readFileSync } from "node:fs";
import { BASE, boot, CLEAR_STORED, driver, sleep, T, waitFor } from "./h.mjs";

const { browser, page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const only = process.argv[2];
const P = "document.querySelector('pod-player')";
const IMPORT = BASE + "?import";
const TONE = readFileSync("fixtures/audio/tone-0.wav").toString("base64");

const STUB = `
window.__ms = { calls: [], handlers: {}, refuse: [], state: "none" };
const rec = (...a) => window.__ms.calls.push(a);
class StubMetadata { constructor(init) { Object.assign(this, init); } }
window.MediaMetadata = StubMetadata;
const session = {
  set metadata(v) { window.__ms.metadata = v; rec("metadata", v && { title: v.title, artist: v.artist, album: v.album, art: v.artwork[0].src, type: v.artwork[0].type, sizes: v.artwork[0].sizes }); },
  get metadata() { return window.__ms.metadata ?? null; },
  set playbackState(v) { window.__ms.state = v; rec("state", v); },
  get playbackState() { return window.__ms.state; },
  setActionHandler(name, fn) {
    if (window.__ms.refuse.includes(name)) throw new TypeError("refused");
    rec("handler", name);
    window.__ms.handlers[name] = fn;
  },
  setPositionState(p) { rec("position", p ?? null); },
};
Object.defineProperty(navigator, "mediaSession", { configurable: true, value: session });
window.__fast = [];
HTMLMediaElement.prototype.fastSeek = function (t) { window.__fast.push(t); this.currentTime = t; };
window.__tone = Uint8Array.from(atob("${TONE}"), (c) => c.charCodeAt(0));
window.__wav = (name, path) => { const f = new File([window.__tone], name, { lastModified: 5 }); Object.defineProperty(f, "webkitRelativePath", { value: path }); return f; };
`;

const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
  await fn();
  await page.resetSection();
};
const load = async (url = IMPORT) => {
  await page.goto(BASE);
  await page.evaluate(CLEAR_STORED);
  await page.send("Page.bringToFront");
  await page.goto(url);
  await sleep(2150);
};
const state = () => d.state();
const calls = () => page.evaluate("window.__ms.calls");
const reset = () => page.evaluate("window.__ms.calls.length=0;0");
const fire = (name, details = {}) => page.evaluate(`window.__ms.handlers[${JSON.stringify(name)}](${JSON.stringify({ action: name, ...details })});0`);
const tones = (n, dir = "Art/Alb") => `[${Array.from({ length: n }, (_, i) => `__wav("0${i + 1} Tone${i + 1}.wav","Lib/${dir}/0${i + 1} Tone${i + 1}.wav")`).join(",")}]`;
const importTones = (n, dir) => page.evaluate(`${P}.importFiles(${tones(n, dir)}).then(()=>1)`);
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
const playSongs = async () => {
  await d.press("menu"); await sleep(280);
  await pick("Songs");
  await d.key("ArrowRight");
  await waitFor(async () => (await state()).nowPlaying?.playing, 2000);
  await sleep(150);
};
const np = async () => (await state()).nowPlaying;
const metaTitle = () => page.evaluate("window.__ms.metadata?.title ?? null");
const LIB = `import("/src/art.js")`;
const pngJs = `(async (w, h, colour) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = colour; x.fillRect(0, 0, w, h); return new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/png"))).arrayBuffer()); })`;

try {
  await section("off-page", async () => {
    await load(BASE);
    t.eq("nothing registers on the plain test page", await calls(), []);
    await d.press("menu"); await sleep(280);
    await pick("Songs");
    await d.key("ArrowRight"); await sleep(500);
    t.eq("nor while playing", await calls(), []);
  });

  await section("register", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__ms.refuse=['seekto'];" });
    await load();
    const handlers = (await calls()).filter((c) => c[0] === "handler").map((c) => c[1]);
    t.eq("registered once at startup; a refused one is survived", handlers, ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward"]);
    await sleep(300);
    t.eq("no double registration", (await calls()).filter((c) => c[0] === "handler").length, 6);
    t.eq("console clean", logs, []);
  });

  await section("order", async () => {
    await load();
    await importTones(3);
    await d.press("menu"); await sleep(280);
    await pick("Songs");
    await reset();
    await d.key("ArrowRight");
    await waitFor(async () => (await np())?.playing, 2000);
    await sleep(200);
    const log = await calls();
    const firstMeta = log.findIndex((c) => c[0] === "metadata");
    const firstPos = log.findIndex((c) => c[0] === "position" && c[1]);
    t.ok("metadata before position", firstMeta >= 0 && firstPos > firstMeta, JSON.stringify(log));
    t.eq("metadata values", log[firstMeta][1].title, "Tone1");
    t.eq("album and artist", [log[firstMeta][1].artist, log[firstMeta][1].album], ["Art", "Alb"]);
    t.eq("placeholder is the 512 icon, by absolute URL", [log[firstMeta][1].art, log[firstMeta][1].type, log[firstMeta][1].sizes], [BASE + "icons/icon-512.png", "image/png", "512x512"]);
    const pos = log[firstPos][1];
    t.eq("position has the real duration", Math.round(pos.duration), 30);
    t.ok("position within duration", pos.position >= 0 && pos.position <= pos.duration, JSON.stringify(pos));
    t.eq("rate", pos.playbackRate, 1);
    t.eq("state playing", await page.evaluate("window.__ms.state"), "playing");
    t.ok("no position with an unknown duration", log.every((c) => c[0] !== "position" || c[1] === null || c[1].duration > 0), JSON.stringify(log));

    console.log("# position triggers");
    await reset();
    await sleep(1100);
    t.eq("no chatter while playing", (await calls()).filter((c) => c[0] === "position").length, 0);
    await d.press("play"); await sleep(150);
    let after = await calls();
    t.ok("pause publishes position and state", after.some((c) => c[0] === "position") && after.some((c) => c[0] === "state" && c[1] === "paused"), JSON.stringify(after));
    await reset();
    await d.press("play"); await sleep(150);
    after = await calls();
    t.ok("play publishes position and state", after.some((c) => c[0] === "position") && after.some((c) => c[0] === "state" && c[1] === "playing"), JSON.stringify(after));
    await reset();
    await page.evaluate(`${P}.playback.current.el.playbackRate=1.5;0`);
    await sleep(120);
    t.eq("rate change", (await calls()).filter((c) => c[0] === "position").at(-1)?.[1].playbackRate, 1.5);
    await page.evaluate(`${P}.playback.current.el.playbackRate=1;0`);
    await sleep(120);

    console.log("# track change");
    await reset();
    await d.press("forward"); await sleep(250);
    after = await calls();
    const meta = after.findIndex((c) => c[0] === "metadata");
    const posAfter = after.findIndex((c, i) => i > meta && c[0] === "position" && c[1]);
    t.ok("new metadata then new position", meta >= 0 && posAfter > meta, JSON.stringify(after));
    t.eq("no stale title", await metaTitle(), (await np()).title);

    console.log("# queue end");
    await d.press("forward"); await sleep(150);
    await d.press("forward"); await sleep(250);
    const end = await calls();
    t.eq("metadata cleared", await page.evaluate("window.__ms.metadata ?? null"), null);
    t.eq("state none", await page.evaluate("window.__ms.state"), "none");
    t.eq("position cleared", end.filter((c) => c[0] === "position").at(-1), ["position", null]);
    t.eq("console clean", logs, []);
  });

  await section("late-duration", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      const real = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "duration");
      window.__late = true;
      Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get() { return window.__late ? NaN : real.get.call(this); } });` });
    await load();
    await importTones(1);
    await d.press("menu"); await sleep(280);
    await pick("Songs");
    await reset();
    await d.key("ArrowRight");
    await waitFor(async () => (await np())?.playing, 2000);
    await sleep(200);
    t.eq("metadata out with no duration known", [(await calls()).some((c) => c[0] === "metadata"), (await calls()).some((c) => c[0] === "position" && c[1])], [true, false]);
    await page.evaluate(`window.__late=false;${P}.playback.current.el.dispatchEvent(new Event("durationchange"));0`);
    await sleep(100);
    t.eq("position published as soon as the duration arrives", Math.round((await calls()).filter((c) => c[0] === "position").at(-1)?.[1]?.duration ?? 0), 30);
  });

  await section("actions", async () => {
    await load();
    await importTones(3);
    await playSongs();
    await fire("pause"); await sleep(120);
    t.eq("pause action pauses the device", (await np()).playing, false);
    await fire("pause"); await sleep(80);
    t.eq("pause twice stays paused", (await np()).playing, false);
    await fire("play"); await sleep(120);
    t.eq("play action", (await np()).playing, true);
    await fire("play"); await sleep(80);
    t.eq("play twice stays playing", (await np()).playing, true);

    await fire("nexttrack"); await sleep(200);
    t.eq("nexttrack", (await np()).index, 2);
    await fire("previoustrack"); await sleep(200);
    t.eq("previoustrack inside 3 s goes back, as Back does", (await np()).index, 1);
    await fire("seekforward"); await sleep(250);
    const el = () => page.evaluate(`${P}.playback.current.el.currentTime`);
    const at = await el();
    t.ok("seekforward moves 10 s", at >= 10 && at < 11.5, at);
    await fire("previoustrack"); await sleep(250);
    t.eq("previoustrack past 3 s restarts, as Back does", (await np()).index, 1);
    t.ok("at 0", (await el()) < 1, await el());
    await fire("seekforward"); await sleep(120);
    await fire("seekbackward"); await sleep(250);
    t.ok("seekbackward moves 10 s", (await el()) < 2, await el());
    await fire("seekto", { seekTime: 12 }); await sleep(250);
    t.ok("seekto", Math.abs((await el()) - 12) < 1, await el());
    t.eq("no fastSeek unless offered", await page.evaluate("window.__fast"), []);
    await fire("seekto", { seekTime: 15, fastSeek: true }); await sleep(250);
    t.eq("fastSeek honoured", await page.evaluate("window.__fast"), [15]);
    t.eq("the device follows", (await np()).elapsed.startsWith("0:1"), true);

    console.log("# scrub on the device");
    await d.press("select"); await sleep(60);
    t.eq("scrubbing", (await np()).mode, "scrub");
    await fire("nexttrack"); await sleep(200);
    t.eq("a lock screen skip leaves scrub and goes", [(await np()).mode, (await np()).index], ["progress", 2]);
    t.eq("console clean", logs, []);
  });

  await section("interrupted", async () => {
    await load();
    await importTones(2);
    await playSongs();
    await reset();
    await page.evaluate(`${P}.playback.current.el.pause();0`);
    await sleep(150);
    t.eq("a pause from outside shows on the device", [(await np()).playing, await page.evaluate("window.__ms.state")], [false, "paused"]);
    await d.press("play"); await sleep(200);
    t.eq("and resume works", [(await np()).playing, await page.evaluate(`${P}.playback.current.el.paused`)], [true, false]);

    console.log("# context suspended");
    await page.evaluate(`${P}.graph.ctx.suspend()`);
    await sleep(200);
    t.eq("device shows paused", (await np()).playing, false);
    await fire("play"); await sleep(300);
    t.eq("a media action resumes the context", [await page.evaluate(`${P}.graph.ctx.state`), (await np()).playing], ["running", true]);
    t.eq("console clean", logs, []);
  });

  await section("hidden", async () => {
    await load();
    await importTones(3);
    await playSongs();
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    await browser.send("Target.activateTarget", { targetId });
    await sleep(300);
    const visibility = await page.evaluate("document.visibilityState");
    console.log(`    page is ${visibility}`);
    await fire("nexttrack"); await sleep(400);
    t.eq("a skip works from behind another tab", [(await page.evaluate(`${P}.playback.position`)), await page.evaluate(`${P}.playback.playing`)], [2, true]);
    await page.evaluate(`${P}.playback.current.el.currentTime=26.5;0`);
    const crossed = await waitFor(() => page.evaluate(`${P}.playback.position===3 && !${P}.playback.cross`), 6000);
    t.ok("a crossfade finishes there", crossed);
    t.ok("the outgoing channel is cleaned up", await waitFor(() => page.evaluate(`${P}.playback.fading.size===0`), 3000));
    t.eq("metadata followed", await metaTitle(), "Tone3");
    t.eq("context still running", await page.evaluate(`${P}.graph.ctx.state`), "running");
    await browser.send("Target.closeTarget", { targetId });
    await page.send("Page.bringToFront");
    t.eq("console clean", logs, []);
  });

  await section("audio-clock", async () => {
    await load();
    await importTones(2);
    await playSongs();
    await page.evaluate(`window.__real=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===2000?0:__real(fn,ms,...a);0`);
    await page.evaluate(`${P}.playback.current.el.currentTime=27.5;0`);
    await waitFor(() => page.evaluate(`${P}.playback.fading.size===1`), 3000);
    t.ok("with the 2 s timer starved, the audio clock still clears the fade", await waitFor(() => page.evaluate(`${P}.playback.fading.size===0`), 3500));
    await page.evaluate("window.setTimeout=__real;0");
  });

  await section("art-formats", async () => {
    await load();
    const check = async (label, makeBytes, want = "ok") => {
      const got = await page.evaluate(`(async () => {
        const png = await ${pngJs}(40, 20, "#ff0000");
        const size = (n) => [(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127];
        const be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
        const text = (s) => [...s].map((c) => c.charCodeAt(0));
        const bytes = (${makeBytes})(png, { size, be, text });
        const { embeddedArt, scaleArt } = await ${LIB};
        const found = await embeddedArt(new File([new Uint8Array(bytes)], "x"));
        if (!found) return "none";
        const out = await scaleArt(found);
        const bmp = await createImageBitmap(out);
        const c = document.createElement("canvas"); c.width = c.height = 1;
        const x = c.getContext("2d"); x.drawImage(bmp, 0, 0, 1, 1);
        const [r, g] = x.getImageData(0, 0, 1, 1).data;
        return out.type === "image/jpeg" && bmp.width === 512 && bmp.height === 512 && r > 200 && g < 60 ? "ok" : [out.type, bmp.width, bmp.height, r, g].join();
      })()`);
      t.eq(label, got, want);
    };
    await check("ID3v2.3 APIC", `(png, { size, be, text }) => { const body = [0, ...text("image/png"), 0, 3, 0, ...png]; const frame = [...text("APIC"), ...be(body.length), 0, 0, ...body]; return [...text("ID3"), 3, 0, 0, ...size(frame.length), ...frame]; }`);
    await check("ID3v2.4 APIC after a large frame: the whole tag is read", `(png, { size, be, text }) => { const pad = new Array(6 * 1024 * 1024).fill(32); const pf = [...text("PRIV"), ...size(pad.length), 0, 0]; const body = [0, ...text("image/png"), 0, 3, 0, ...png]; const af = [...text("APIC"), ...size(body.length), 0, 0, ...body]; const n = pf.length + pad.length + af.length; const out = new Uint8Array(10 + n); out.set([...text("ID3"), 4, 0, 0, ...size(n)]); out.set(pf, 10); out.set(pad, 10 + pf.length); out.set(af, 10 + pf.length + pad.length); return out; }`);
    await check("ID3v2.2 PIC", `(png, { size, text }) => { const body = [0, ...text("PNG"), 3, 0, ...png]; const n = body.length; const frame = [...text("PIC"), (n >> 16) & 255, (n >> 8) & 255, n & 255, ...body]; return [...text("ID3"), 2, 0, 0, ...size(frame.length), ...frame]; }`);
    await check("UTF-16 description", `(png, { size, be, text }) => { const body = [1, ...text("image/png"), 0, 3, 0xff, 0xfe, 65, 0, 0, 0, ...png]; const frame = [...text("APIC"), ...be(body.length), 0, 0, ...body]; return [...text("ID3"), 3, 0, 0, ...size(frame.length), ...frame]; }`);
    await check("MP4 covr with metadata after a large mdat", `(png, { be, text }) => { const atom = (t, ...c) => { const b = c.flat(); return [...be(b.length + 8), ...text(t), ...b]; }; const data = atom("data", be(14), be(0), [...png]); const moov = atom("moov", atom("udta", atom("meta", be(0), atom("hdlr", be(0)), atom("ilst", atom("covr", data))))); const ftyp = atom("ftyp", text("M4A "), be(0)); const mdat = new Array(3 * 1024 * 1024).fill(0); const head = [...be(mdat.length + 8), ...text("mdat")]; const out = new Uint8Array(ftyp.length + head.length + mdat.length + moov.length); out.set(ftyp); out.set(head, ftyp.length); out.set(moov, ftyp.length + head.length + mdat.length); return out; }`);
    await check("FLAC PICTURE", `(png, { be, text }) => { const mime = text("image/png"); const pic = [...be(3), ...be(mime.length), ...mime, ...be(0), ...be(40), ...be(20), ...be(32), ...be(0), ...be(png.length), ...png]; const n = pic.length; return [...text("fLaC"), 0, 0, 0, 34, ...new Array(34).fill(0), 0x86, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...pic]; }`);
    await check("no art in a plain file", `(png, { text }) => text("RIFFxxxxWAVE")`, "none");
    const tags = await page.evaluate(`(async () => {
      const { readTags } = await import("/src/tags.js");
      const png = await ${pngJs}(4, 4, "#00f");
      const text = (s) => [...s].map((c) => c.charCodeAt(0));
      const be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
      const size = (n) => [(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127];
      const frame = (id, body) => [...text(id), ...be(body.length), 0, 0, ...body];
      const f = [...frame("TIT2", [0, ...text("T")]), ...frame("TCON", [0, ...text("(17)Rock")]), ...frame("APIC", [0, ...text("image/png"), 0, 3, 0, ...png])];
      const out = await readTags(new File([new Uint8Array([...text("ID3"), 3, 0, 0, ...size(f.length), ...f])], "x.mp3"), "mp3");
      return [out.title, out.genre, out.art];
    })()`);
    t.eq("tags find genre and the art flag without reading the art", tags, ["T", "Rock", true]);
  });

  await section("artwork", async () => {
    await load();
    await page.evaluate(`(async () => {
      const png = await ${pngJs}(64, 64, "#00ff00");
      const cover = new File([png], "Cover.PNG", { type: "image/png", lastModified: 1 });
      Object.defineProperty(cover, "webkitRelativePath", { value: "Lib/Art/One/Cover.PNG" });
      const front = new File([png], "front.jpg", { lastModified: 1 });
      Object.defineProperty(front, "webkitRelativePath", { value: "Lib/Art/One/front.jpg" });
      window.__files = [cover, front, ...${tones(1, "Art/One")}, ...[${[2, 3, 4].map((n) => `__wav("0${n} Tone.wav","Lib/Art/Two${n}/0${n} Tone.wav")`).join(",")}]];
      return 1;
    })()`);
    await page.evaluate(`${P}.importFiles(__files).then(()=>1)`);
    await playSongs();
    const artOf = () => page.evaluate("window.__ms.metadata?.artwork[0].src");
    await waitFor(async () => (await artOf())?.startsWith("blob:"), 2000);
    const first = await artOf();
    t.ok("folder image becomes artwork", first.startsWith("blob:"), first);
    t.eq("scaled, encoded", await page.evaluate(`(async () => { const a = window.__ms.metadata.artwork[0]; const b = await (await fetch(a.src)).blob(); const m = await createImageBitmap(b); return [a.type, a.sizes, b.type, m.width, m.height]; })()`), ["image/jpeg", "512x512", "image/jpeg", 512, 512]);
    await d.press("forward"); await sleep(250);
    t.eq("next track has no art: the placeholder, not stale art", await artOf(), BASE + "icons/icon-512.png");
    t.eq("each track's result cached", await page.evaluate(`${P}.media.art.size`), 2);
    t.eq("a URL stays alive after the track moves on", await page.evaluate(`fetch(${JSON.stringify(first)}).then((r)=>r.ok,()=>false)`), true);

    console.log("# two URLs stay alive");
    await page.evaluate(`(async () => {
      const m = ${P}.media;
      const urls = [];
      for (const n of ["a", "b", "c"]) { const png = await ${pngJs}(8, 8, "#123"); m.art.set(n, new Blob([png])); }
      const song = (id) => ({ id, name: id, imported: true });
      for (const id of ["a", "b", "c"]) { m.song = null; ${P}.playback.queue = [song(id)]; ${P}.playback.index = 0; m.sync(); urls.push(window.__ms.metadata.artwork[0].src); }
      window.__urls = urls;
      return 1;
    })()`);
    await sleep(50);
    t.eq("the two most recent live, older revoked", await page.evaluate(`Promise.all(__urls.map((u)=>fetch(u).then((r)=>r.ok,()=>false)))`), [false, true, true]);
    logs.length = 0;

    console.log("# cache limit");
    await page.evaluate(`(async () => {
      const m = ${P}.media;
      for (let i = 0; i < 60; i++) {
        m.song = null;
        ${P}.playback.queue = [{ id: "s" + i, name: "s" + i, imported: true, path: "None/None/x.wav" }];
        ${P}.playback.index = 0;
        m.sync();
        await new Promise((r) => setTimeout(r));
      }
      ${P}.playback.queue = [];
      return 1;
    })()`);
    await sleep(50);
    const cache = await page.evaluate(`(()=>{const a=${P}.media.art;return [a.size,a.has("s59"),a.has("s0")]})()`);
    t.eq("cache keeps the newest 50", cache, [50, true, false]);
  });

  await section("stale-art", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      const real = window.createImageBitmap;
      window.__slow = 600;
      window.createImageBitmap = async (...a) => { await new Promise((r) => setTimeout(r, window.__slow)); return real.apply(window, a); };` });
    await load();
    await page.evaluate(`(async () => {
      const png = await ${pngJs}(32, 32, "#0000ff");
      const cover = new File([png], "cover.png", { type: "image/png", lastModified: 1 });
      Object.defineProperty(cover, "webkitRelativePath", { value: "Lib/Art/One/cover.png" });
      window.__files = [cover, ...${tones(1, "Art/One")}, __wav("02 Next.wav","Lib/Art/Two/02 Next.wav")];
      return 1;
    })()`);
    await page.evaluate(`${P}.importFiles(__files).then(()=>1)`);
    await playSongs();
    await d.press("forward");
    await sleep(900);
    t.eq("slow art for the earlier track never lands on the later one", [await metaTitle(), await page.evaluate("window.__ms.metadata.artwork[0].src")], ["Next", BASE + "icons/icon-512.png"]);
    t.eq("but it is kept for that track", await page.evaluate(`${P}.media.art.size`), 2);
  });

  await section("linked-art", async () => {
    await load();
    await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("ArtDir", { recursive: true }).catch(() => {});
      const top = await root.getDirectoryHandle("ArtDir", { create: true });
      const alb = await (await top.getDirectoryHandle("Art", { create: true })).getDirectoryHandle("Alb", { create: true });
      const write = async (dir, name, data) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
      await write(alb, "01 Tone.wav", window.__tone);
      await write(alb, "folder.webp", await ${pngJs}(16, 16, "#808080"));
      await ${P}.linkFolder(top);
      return 1;
    })()`);
    await playSongs();
    t.ok("art from a linked folder image", await waitFor(() => page.evaluate(`window.__ms.metadata?.artwork[0].src.startsWith("blob:")`), 2500));
    await page.evaluate(`navigator.storage.getDirectory().then((r)=>r.removeEntry("ArtDir",{recursive:true})).then(()=>1)`).catch(() => {});
    t.eq("console clean", logs, []);
  });

  await section("no-session", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(navigator, "mediaSession", { configurable: true, value: undefined });` });
    await load();
    await importTones(1);
    await playSongs();
    t.eq("a browser with no Media Session still plays", (await np()).playing, true);
    t.eq("console clean", logs, []);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
