import { boot, driver, sleep, T } from "./h.mjs";

const { page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const np = async () => (await d.state()).nowPlaying;
const toSongs = async () => { await d.rotate(32); await d.press("select"); await sleep(280); };
const startSongs = async () => { await d.fresh(); await d.rotate(32); await d.press("play"); await sleep(350); };
const startPaused = async () => { await startSongs(); await d.press("play"); await sleep(100); };

try {
  console.log("# 08 play/pause at root");
  await d.fresh();
  await d.press("play"); await sleep(200);
  t.eq("playlists row nothing", (await d.state()).view, "list");
  await d.rotate(16);
  await d.press("play"); await sleep(200);
  t.eq("artists row nothing", (await d.state()).view, "list");
  await d.rotate(16);
  await d.press("play"); await sleep(350);
  let n = await np();
  t.eq("songs row starts song 1", [n.index, n.total, n.title, n.playing, n.elapsed !== ""], [1, 48, "Paper Rivers 00 (Extended Fixture Mix For Marquee Testing)", true, true]);
  await d.press("menu"); await sleep(300);
  let s = await d.state();
  t.eq("root gets now playing row", s.rows.map((r) => r.text), ["Playlists", "Artists", "Songs", "Settings", "Now Playing"]);
  t.eq("root keeps Songs row", await d.sel(), 2);

  console.log("# select a row, resume current");
  await d.fresh();
  await toSongs();
  await d.rotate(16);
  await d.press("select"); await sleep(350);
  n = await np();
  t.eq("row 1 plays 2 of 48", [n.index, n.title], [2, "Silver Engines 01"]);
  await d.press("play"); await sleep(100);
  t.eq("paused", (await np()).playing, false);
  await d.press("menu"); await sleep(300);
  t.eq("menu lands on row 1", await d.sel(), 1);
  await d.press("select"); await sleep(300);
  n = await np();
  t.eq("select same row resumes, no restart", [n.index, n.playing], [2, true]);

  console.log("# 11 skip");
  await startSongs();
  await d.press("back"); await sleep(350);
  s = await d.state();
  t.eq("back on first ends playback", [s.view, s.title, s.rows.length], ["list", "Pod", 4]);

  await startSongs();
  await sleep(3400);
  await d.press("back"); await sleep(100);
  n = await np();
  t.eq("back at 3.5 restarts", [n.index, n.elapsed], [1, "0:00"]);

  await startSongs();
  await d.press("forward"); await sleep(200);
  t.eq("forward", (await np()).index, 2);
  await sleep(3300);
  await d.press("play"); await sleep(100);
  await d.press("back"); await sleep(250);
  n = await np();
  t.eq("back while paused at 3.5 -> prev, paused", [n.index, n.playing, n.elapsed], [1, false, "0:00"]);

  console.log("# repeat all, one, shuffle");
  await d.fresh();
  await d.rotate(46); await d.press("select"); await sleep(280);
  await d.rotate(32); await d.press("select"); await d.press("select");
  t.eq("repeat all", (await d.state()).settings.repeat, "all");
  await d.press("menu"); await sleep(280);
  await d.rotate(-16); // Songs
  await d.press("play"); await sleep(350);
  await d.press("back"); await sleep(200);
  t.eq("all: back from first to last", (await np()).index, 48);
  await d.press("forward"); await sleep(200);
  t.eq("all: forward from last to first", (await np()).index, 1);

  await d.fresh();
  await d.rotate(46); await d.press("select"); await sleep(280);
  await d.rotate(32); await d.press("select");
  t.eq("repeat one", (await d.state()).settings.repeat, "one");
  await d.press("menu"); await sleep(280);
  await d.rotate(-16);
  await d.press("play"); await sleep(1400);
  await d.press("forward"); await sleep(120);
  n = await np();
  t.eq("one: forward stays at 0:00", [n.index, n.elapsed], [1, "0:00"]);

  await d.fresh();
  await d.rotate(46); await d.press("select"); await sleep(280);
  await d.rotate(16); await d.press("select");
  t.eq("shuffle", (await d.state()).settings.shuffle, "songs");
  await d.press("menu"); await sleep(280);
  await d.rotate(-16);
  await d.press("play"); await sleep(350);
  n = await np();
  t.eq("shuffled start reads 1 of N", [n.index, n.total], [1, 48]);
  const first = n.title;
  await d.press("forward"); await sleep(200);
  n = await np();
  t.ok("shuffle next is other song", n.index === 2 && n.title !== first);
  await d.press("back"); await sleep(200);
  n = await np();
  t.eq("shuffle back to first", [n.index, n.title], [1, first]);
  await d.press("back"); await sleep(350);
  t.eq("shuffle back on first ends queue", (await d.state()).rows.length, 4);

  console.log("# shuffle on during play");
  await d.fresh();
  await d.rotate(32); await d.press("play"); await sleep(350);
  await d.press("forward"); await sleep(120); await d.press("forward"); await sleep(120);
  t.eq("index 3", (await np()).index, 3);
  await d.press("menu"); await sleep(280);
  await d.rotate(16);
  await d.press("select"); await sleep(280); // Settings
  await d.rotate(16); await d.press("select");
  await d.press("menu"); await sleep(280);
  await d.rotate(16);
  await d.press("select"); await sleep(280);
  n = await np();
  t.eq("label becomes 1", n.index, 1);
  await d.press("menu"); await sleep(280);
  await d.rotate(-16);
  await d.press("select"); await sleep(280);
  await d.press("select"); // shuffle off (row 1)
  await d.press("menu"); await sleep(280);
  await d.rotate(16);
  await d.press("select"); await sleep(280);
  t.eq("label returns to index", (await np()).index, 3);

  console.log("# 14 volume");
  await startSongs();
  await d.rotate(47); n = await np();
  t.eq("+47 -> 60", [n.volume, n.mode], [60, "volume"]);
  t.eq("settings lag", (await d.state()).settings.volume, 50);
  await d.rotate(-47); t.eq("-47 -> 50", (await np()).volume, 50);
  await d.rotate(10); t.eq("+10 -> 52", (await np()).volume, 52);
  await d.rotate(240); t.eq("+240 -> 100", (await np()).volume, 100);
  await d.press("select");
  t.eq("select leaves volume, no scrub", (await np()).mode, "progress");
  await d.rotate(-47); t.eq("volume again", (await np()).mode, "volume");
  const volumeIdle = await d.timed(async () => (await np()).mode === "progress", 8000);
  t.ok(`volume idle about 5 s (${volumeIdle} ms)`, volumeIdle > 4600 && volumeIdle < 5800, volumeIdle);

  console.log("# 14 scrub");
  await d.fresh();
  await d.rotate(32); await d.press("play"); await sleep(300); await d.press("play"); await sleep(50);
  await d.press("select");
  t.eq("scrub on", (await np()).mode, "scrub");
  const base = (await np()).elapsed;
  await d.rotate(47);
  n = await np();
  t.eq("+47 shows +3", [base, n.elapsed, n.remaining], ["0:00", "0:03", "-0:27"]);
  await sleep(1300);
  n = await np();
  t.eq("after 1.3 s still", [n.elapsed, n.mode], ["0:03", "scrub"]);
  await d.press("select"); await sleep(100);
  n = await np();
  t.eq("select exits at 0:03", [n.mode, n.elapsed], ["progress", "0:03"]);
  await d.press("select");
  const scrubIdle = await d.timed(async () => (await np()).mode === "progress", 8000);
  t.ok(`scrub idle about 5 s (${scrubIdle} ms)`, scrubIdle > 4600 && scrubIdle < 5800, scrubIdle);

  console.log("# 14 scrub dead buttons");
  await d.press("select");
  await d.press("forward"); await sleep(100);
  n = await np();
  t.eq("forward dead while scrubbing", [n.index, n.mode], [1, "scrub"]);
  const aria = await page.evaluate("document.querySelector('pod-player').shadowRoot.querySelector('.btn.back').getAttribute('aria-disabled')");
  t.eq("aria-disabled", aria, "true");
  await d.press("select");

  console.log("# 14 hold seek");
  await d.fresh();
  await d.rotate(32); await d.press("play"); await sleep(300); await d.press("play"); await sleep(50);
  await d.press("forward", 1650); await sleep(120);
  n = await np();
  t.eq("forward 1650 -> 0:10, no skip", [n.index, n.elapsed], [1, "0:10"]);
  await d.press("back", 1100); await sleep(120);
  n = await np();
  t.eq("back 1100 -> 0:05", [n.index, n.elapsed], [1, "0:05"]);
  await d.press("forward", 4700); await sleep(200);
  n = await np();
  t.eq("hold past the end lands on track 2 at 0:00", [n.index, n.elapsed, n.playing], [2, "0:00", false]);

  console.log("# 13 formats");
  n = await np();
  t.eq("both ends", n.remaining, "-0:30");

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
