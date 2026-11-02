// Spec 36, Resume. Fake handles as in t12, with the 5 second timer shortened through its seam.
import { BASE, boot, driver, sleep, T, waitFor } from "./h.mjs";
import { FAKES, file, P, product, ROOT, tone } from "./product.mjs";

const { page, close, logs } = await boot();
const a = product(page);
const { d } = a;
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
  await fn();
  await page.resetSection();
};
const IMPORT = BASE + "?import";
const SEAM = 150;
const numbered = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`0${i + 1} Song${i + 1}.wav`, tone()]));
const music = (n = 3) => ({ Art: { Alb: numbered(n) } });
const element = () => `${P}.playback.current.el`;

const start = async (n = 3) => {
  await a.open();
  await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
  await a.setTree("A", music(n));
  await a.link("A");
  await a.focusRing();
  await toSongs();
  await d.press("select");
  t.ok("playing", await waitFor(async () => (await a.np())?.playing, 3000));
};
const toSongs = async () => {
  if ((await a.titles()).includes("Browse")) await a.pick("Browse");
  await a.pick("Songs");
};
const saved = async () => (await a.meta()).resume;
const queueRecord = async () => (await a.meta()).resumeQueue;
const seek = (seconds) => page.evaluate(`${element()}.currentTime=${seconds};0`);
const PUTS = `
window.__puts = [];
const put = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function (value, ...rest) {
  if (this.name === "meta") window.__puts.push(value.key);
  return put.call(this, value, ...rest);
};`;
const played = `${P}.playback.order.map((i)=>${P}.playback.queue[i].name)`;
const place = async () => { const n = await a.np(); return [n.index, n.total, n.title]; };
const nowPlaying = async () => { await a.focusRing(); await a.pick("Now Playing"); };
const paused = async () => {
  await d.press("play");
  await waitFor(async () => (await a.np())?.playing === false, 1000);
  await sleep(120);
};

try {
  await section("save", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: PUTS });
    await start();
    await seek(4);
    t.ok("saved while playing", await waitFor(async () => (await saved())?.time >= 4, 1500));
    const first = await saved();
    t.eq("track as folder id plus relative path, not an index", [first.track.split("\0")[0].startsWith("folder-"), first.track.split("\0")[1]], [true, "A/Art/Alb/01 Song1.wav"]);
    t.eq("the timed write holds only the track and position", Object.keys(first).sort(), ["time", "track"]);
    t.eq("the queue source went in when the queue started", (await queueRecord()).source.key, "songs");
    t.ok("the position keeps moving", await waitFor(async () => (await saved()).time > first.time + 0.1, 1500));
    await waitFor(async () => (await page.evaluate("window.__puts")).filter((k) => k === "resume").length > 2, 1500);
    const puts = await page.evaluate("window.__puts");
    t.eq("the queue is written once, at its start", puts.filter((k) => k === "resumeQueue").length, 1);
    t.ok("the position many times", puts.filter((k) => k === "resume").length > 2, puts.join());
    await paused();
    const time = await page.evaluate(`${P}.playback.time`);
    t.ok("saved on pause, at the paused position", Math.abs((await saved()).time - time) < 0.05, JSON.stringify([await saved(), time]));
    t.eq("no shuffle, so no seed", (await queueRecord()).built, null);
    await a.reopen();
    t.eq("every 5 seconds without the seam", await page.evaluate(`${P}.resume.everyMs`), 5000);
  });

  await section("restore", async () => {
    await start();
    await seek(9.5);
    await sleep(250);
    await paused();
    const { time } = await saved();
    await page.evaluate("window.__marker=1");
    await a.reopen();
    t.eq("really a new page", await page.evaluate("window.__marker ?? 0"), 0);
    const s = await a.state();
    t.eq("Now Playing on the root menu, above About", (await a.titles()).slice(-2), ["Now Playing", "About"]);
    t.eq("the first row keeps the selection", s.rows.findIndex((r) => r.selected), 0);
    t.ok("the track is ready", await waitFor(() => page.evaluate(`${P}.playback.loaded && ${element()}.readyState > 0`), 2000));
    await waitFor(() => page.evaluate(`${P}.playback.parked === null`), 2000);
    await sleep(100);
    t.eq("no autoplay", await page.evaluate(`[${P}.playback.playing, ${element()}.paused]`), [false, true]);
    t.ok("at that position", Math.abs(await page.evaluate(`${element()}.currentTime`) - time) < 0.3, await page.evaluate(`${element()}.currentTime`));
    t.eq("the title bar shows paused", await page.evaluate(`[${ROOT}.querySelector('.state').hidden, ${ROOT}.querySelector('.state').className]`), [false, "state paused"]);
    await a.focusRing();
    await a.pick("Now Playing");
    const n = await a.np();
    t.eq("Now Playing shows it", [n.title, n.index, n.total, n.playing, n.elapsed], ["Song1", 1, 3, false, "0:09"]);
    await d.press("play");
    t.ok("Play continues from there", await waitFor(async () => (await a.np()).playing, 2000));
    t.ok("not from the start", (await page.evaluate(`${element()}.currentTime`)) >= time - 0.3, await page.evaluate(`${element()}.currentTime`));
    await d.press("forward");
    t.ok("the rest of the queue is there", await waitFor(async () => (await a.np()).title === "Song2", 2000));
    t.eq("console clean", logs, []);
  });

  await section("list-follows", async () => {
    await start();
    await d.press("forward");
    await waitFor(async () => (await a.np()).title === "Song2", 2000);
    await paused();
    await a.reopen();
    await a.focusRing();
    await toSongs();
    t.eq("the source list opens on the song", (await a.state()).rows.findIndex((r) => r.selected), 1);
    await d.press("select");
    await sleep(300);
    t.eq("Select on it resumes, with no restart", [(await a.np()).title, (await a.np()).playing], ["Song2", true]);
  });

  await section("shuffle-order", async () => {
    await a.open();
    await page.evaluate(`${P}.settings.set("shuffle","songs");0`);
    await a.reopen();
    await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
    await a.setTree("A", music(8));
    await a.link("A");
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await d.press("forward"); await sleep(150);
    await d.press("forward"); await sleep(150);
    await paused();
    const order = await page.evaluate(played);
    const before = await place();
    const record = await queueRecord();
    t.ok("a shuffle seed went in with the queue", record.built.seed > 0, JSON.stringify(record.built));
    t.eq("not the order itself", "order" in record, false);
    await a.reopen();
    t.eq("the seed builds the same order", await page.evaluate(played), order);
    await nowPlaying();
    t.eq("at the same place in it", await place(), before);
    await d.press("forward");
    t.ok("and the next song follows that order", await waitFor(async () => (await a.np()).title === order[before[0]], 2000));

    console.log("# changed while the queue was playing");
    const live = await page.evaluate(played);
    await page.evaluate(`${P}.settings.set("shuffle","off");0`);
    await sleep(100);
    await page.evaluate(`${P}.settings.set("shuffle","songs");0`);
    await sleep(100);
    await paused();
    const mixed = await page.evaluate(played);
    t.ok("a change of the setting makes a new order", mixed.join() !== live.join() || mixed.length < 2);
    await a.reopen();
    t.eq("which also comes back", await page.evaluate(played), mixed);
  });

  await section("album-order", async () => {
    await a.open();
    await page.evaluate(`${P}.settings.set("shuffle","albums");0`);
    await a.reopen();
    await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
    await a.setTree("A", { One: { X: numbered(3) }, Two: { Y: numbered(3) }, Three: { Z: numbered(3) } });
    await a.link("A");
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await paused();
    const order = await page.evaluate(`${P}.playback.order`);
    await a.reopen();
    t.eq("Shuffle Albums comes back in the same order", await page.evaluate(`${P}.playback.order`), order);
  });

  await section("shuffle-songs", async () => {
    await a.open();
    await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
    await a.setTree("A", music(8));
    await a.link("A");
    await a.focusRing();
    await a.pick("Shuffle Songs");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await d.press("forward"); await sleep(150);
    await paused();
    const order = await page.evaluate(played);
    const before = await place();
    await a.reopen();
    t.eq("Shuffle Songs comes back in the same order", await page.evaluate(played), order);
    await nowPlaying();
    t.eq("at the same place", await place(), before);
    t.eq("its source is still Songs", await page.evaluate(`${P}.nav.source.id`), "songs|");
  });

  await section("list-changed", async () => {
    await start(4);
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(120);
    await paused();
    await page.evaluate(`window.__tree.A.Art.Alb["00 New.wav"]={file:true,audio:true};__saveTree();${P}.importer.rescan();0`);
    await a.idle();
    await a.reopen();
    await nowPlaying();
    t.eq("list changed: the resumed track comes first", await place(), [1, 5, "Song3"]);
    await d.press("forward");
    t.ok("and the list carries on after it", await waitFor(async () => (await a.np()).title === "Song4", 2000));

    console.log("# with a shuffle");
    await a.open();
    await page.evaluate(`${P}.settings.set("shuffle","songs");0`);
    await a.reopen();
    await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
    await a.setTree("A", music(6));
    await a.link("A");
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await d.press("forward"); await sleep(150);
    await d.press("forward"); await sleep(150);
    await paused();
    const title = (await a.np()).title;
    await page.evaluate(`window.__tree.A.Art.Alb["00 New.wav"]={file:true,audio:true};__saveTree();${P}.importer.rescan();0`);
    await a.idle();
    await a.reopen();
    await nowPlaying();
    t.eq("first there too", await place(), [1, 7, title]);

    console.log("# a track its list no longer holds");
    await a.open();
    await page.evaluate(`${P}.resume.everyMs=${SEAM};0`);
    await a.setTree("A", { ...music(3), "mix.m3u": file({ text: "Art/Alb/01 Song1.wav\nArt/Alb/02 Song2.wav\n", stamp: 1 }) });
    await a.link("A");
    await a.focusRing();
    await a.pick("Playlists");
    await a.pick("mix");
    await a.pick("Song2");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await paused();
    await page.evaluate(`window.__tree.A["mix.m3u"]={file:true,text:"Art/Alb/01 Song1.wav\\nArt/Alb/03 Song3.wav\\n",stamp:2};__saveTree();${P}.importer.rescan();0`);
    await a.idle();
    await a.reopen();
    await nowPlaying();
    t.eq("it is not gone: it comes first, ahead of the list", await place(), [1, 3, "Song2"]);
    t.eq("console clean", logs, []);
  });

  await section("gone", async () => {
    await start();
    await paused();
    await a.setTree("A", { Art: { Alb: { "02 Song2.wav": tone(), "03 Song3.wav": tone() } } });
    await a.reopen();
    await a.idle();
    await sleep(200);
    t.ok("no Now Playing row", !(await a.titles()).includes("Now Playing"), (await a.titles()).join());
    t.eq("nothing resumed", await page.evaluate(`[${P}.playback.queue.length, ${P}.playback.index]`), [0, -1]);
    t.eq("no error shown or logged", [(await a.state()).view, logs], ["list", []]);
    t.eq("it does not count as Skipped", await page.evaluate(`${P}.importer.skipped`), 0);
    t.ok("and it is forgotten", await waitFor(async () => (await a.meta()).resume === undefined, 1000));

    console.log("# a file that will not open, while the index still holds it");
    await a.setTree("A", music(3));
    await a.reopen();
    await a.idle();
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await paused();
    await page.evaluate(`window.__tree.A.Art.Alb["01 Song1.wav"].unreadable=true;__saveTree();0`);
    await a.reopen();
    await a.idle();
    await sleep(200);
    t.ok("it is not gone: Now Playing shows", (await a.titles()).includes("Now Playing"), (await a.titles()).join());
    await nowPlaying();
    t.eq("paused at its place, with no error", [(await a.state()).view, (await a.np()).title, (await a.np()).playing], ["now-playing", "Song1", false]);
    await d.press("play");
    t.ok("a press finds the file will not open, and 32 applies", await waitFor(async () => (await a.np()).title === "Song2" && (await a.np()).playing, 2000));
    await page.evaluate(`delete window.__tree.A.Art.Alb["01 Song1.wav"].unreadable;__saveTree();0`);
    await paused();

    console.log("# a track the index no longer holds");
    await a.setTree("A", music(3));
    await a.reopen();
    await a.idle();
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await paused();
    const meta = await a.meta();
    await page.evaluate(`new Promise((res)=>{const o=indexedDB.open("mpod");o.onsuccess=()=>{const db=o.result;const tx=db.transaction("meta","readwrite");tx.objectStore("meta").put({key:"resume",value:${JSON.stringify({ ...meta.resume, track: "nowhere" })}});tx.oncomplete=()=>{db.close();res(1)}}})`);
    await a.reopen();
    t.ok("no Now Playing row", !(await a.titles()).includes("Now Playing"), (await a.titles()).join());
    t.eq("console clean", logs, []);
  });

  await section("waiting", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__media = {};
      const session = navigator.mediaSession;
      const register = session.setActionHandler.bind(session);
      session.setActionHandler = (name, fn) => { window.__media[name] = fn; register(name, fn); };` });
    await start();
    await seek(7);
    await sleep(250);
    await paused();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await a.reopen();
    await sleep(150);
    t.eq("Reconnect and Now Playing both show", (await a.titles()), ["Reconnect", "Playlists", "Browse", "Extras", "Settings", "Shuffle Songs", "Now Playing", "About"]);
    t.eq("nothing has opened the file", await page.evaluate(`${P}.playback.current`), null);
    t.eq("paused on the title bar all the same", await page.evaluate(`${ROOT}.querySelector('.state').className`), "state paused");
    await a.focusRing();
    await a.pick("Now Playing");
    const n = await a.np();
    t.eq("the stored place shows", [n.title, n.elapsed, n.playing], ["Song1", "0:07", false]);

    console.log("# a Media Session action cannot ask");
    await page.evaluate("window.__media.play({action:'play'});window.__media.nexttrack({action:'nexttrack'});0");
    await sleep(200);
    t.eq("so it does nothing", [await page.evaluate("window.__requests.length"), (await a.np()).playing, (await a.np()).title], [0, false, "Song1"]);

    console.log("# refused");
    await page.evaluate("window.__answer='denied';0");
    await d.press("play"); await sleep(200);
    t.eq("asked inside the press", await page.evaluate("window.__requests"), [{ testId: "A", active: true }]);
    t.eq("refused: nothing plays", (await a.np()).playing, false);
    await d.press("menu"); await sleep(280);
    t.eq("the Reconnect row stays", (await a.titles())[0], "Reconnect");

    console.log("# allowed");
    await page.evaluate("window.__answer='granted';0");
    await a.pick("Now Playing");
    await d.press("play");
    t.ok("allowed: it plays", await waitFor(async () => (await a.np()).playing, 2000));
    t.ok("from that position", (await page.evaluate(`${element()}.currentTime`)) >= 6.5, await page.evaluate(`${element()}.currentTime`));

    console.log("# Reconnect brings it back, still paused");
    await paused();
    await a.reopen();
    await sleep(150);
    await a.focusRing();
    await a.pick("Reconnect");
    await sleep(300);
    t.eq("the track opened, paused", await page.evaluate(`[${P}.playback.loaded, ${P}.playback.playing]`), [true, false]);
    t.ok("at its place", await waitFor(async () => (await page.evaluate(`${element()}.currentTime`)) >= 6.5, 1500));
  });

  await section("over", async () => {
    await start(1);
    await paused();
    t.ok("stored", !!(await saved()));
    await d.press("forward"); await sleep(250);
    t.eq("the queue ended", await page.evaluate(`${P}.playback.queue.length`), 0);
    t.ok("the end forgets it", await waitFor(async () => (await a.meta()).resume === undefined, 1000));
    await a.reopen();
    t.ok("a new start has nothing to resume", !(await a.titles()).includes("Now Playing"));

    console.log("# Clear Imported");
    await a.focusRing();
    await toSongs();
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await paused();
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await a.pick("Settings");
    await a.pick("Import");
    await a.pick("Clear Imported");
    await sleep(200);
    t.eq("Clear Imported clears it", (await a.meta()).resume, undefined);
  });

  await section("test-page", async () => {
    const test = driver(page);
    await a.open({ url: IMPORT });
    await a.setTree("A", music(2));
    await a.link("A");
    await a.focusRing();
    await a.pick("Songs");
    await a.pick("Song1");
    await waitFor(async () => (await a.np())?.playing, 3000);
    t.eq("no Resume on the test page", await page.evaluate(`${P}.resume`), undefined);
    await d.press("play"); await sleep(200);
    t.eq("nothing stored", (await a.meta()).resume, undefined);
    await page.goto(IMPORT);
    await sleep(2150);
    t.ok("nothing restored", !(await test.state()).rows.some((r) => r.text === "Now Playing"));
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
