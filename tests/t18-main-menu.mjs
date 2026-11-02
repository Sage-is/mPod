// Spec 37: the root menu, Browse, the composer tag, Shuffle Songs and Play on a highlighted list.
import { BASE, boot, sleep, T, waitFor } from "./h.mjs";
import { FAKES, file, P, product, tagged, tone } from "./product.mjs";

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
const song = (fields, stamp = 1000) => file({ b64: tagged(fields), stamp });
const LIBRARY = {
  Lib: {
    "a1.mp3": song({ title: "Come Together", artist: "The Beatles", album: "Abbey", track: 2, genre: "Rock", composer: "Lennon" }),
    "a2.mp3": song({ title: "Something", artist: "The Beatles", album: "Abbey", track: 1, genre: "Rock", composer: "Harrison" }),
    "h1.mp3": song({ title: "Help", artist: "The Beatles", album: "Help", track: 1, genre: "Pop" }),
    "c1.mp3": song({ title: "Fugue", artist: "Alpha", album: "Comp", track: 1, composer: "Bach", albumArtist: "Various" }),
    "c2.mp3": song({ title: "Air", artist: "Zeta", album: "Comp", track: 2, genre: "Classical", composer: "Bach", albumArtist: "Various" }),
    "s1.mp3": song({ title: "Solo", artist: "Zeta", album: "Solo", track: 1, genre: "Classical" }),
    "t2.mp3": song({ title: "Second", artist: "Alpha", album: "The Album", genre: "Rock" }),
  },
};
const libraryOpen = async () => {
  await a.open();
  await a.setTree("A", LIBRARY);
  await a.link("A");
  await a.focusRing();
};
const queue = () => page.evaluate(`${P}.playback.queue.map((s)=>s.name)`);
const source = () => page.evaluate(`${P}.nav.source?.id ?? null`);
const toRoot = async () => {
  while ((await a.state()).view !== "list" || (await a.state()).title !== "mPod") { await d.press("menu"); await sleep(280); }
};

try {
  await section("root", async () => {
    await a.open();
    t.eq("empty library", await a.titles(), ["Playlists", "Browse", "Extras", "Settings", "About"]);
    await a.setTree("A", LIBRARY);
    await a.link("A");
    t.eq("with songs", await a.titles(), ["Playlists", "Browse", "Extras", "Settings", "Shuffle Songs", "About"]);
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Songs");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await toRoot();
    t.eq("with a queue", await a.titles(), ["Playlists", "Browse", "Extras", "Settings", "Shuffle Songs", "Now Playing", "About"]);
    t.eq("Now Playing sits on the first screen", (await a.titles()).indexOf("Now Playing") < 6, true);
    await d.press("play");
    await a.pick("Settings");
    t.eq("Settings", await a.titles(), ["Name", "Shuffle", "Repeat", "Backlight Timer", "Contrast", "EQ", "Clicker", "Import", "Reset All Settings"]);
    await d.press("menu"); await sleep(280);

    console.log("# Reconnect");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await a.reopen();
    await sleep(120);
    t.eq("Reconnect leads, where 32 calls for it", (await a.titles()).slice(0, 2), ["Reconnect", "Playlists"]);
    await page.resetSection();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });

    console.log("# About");
    await a.reopen();
    await a.focusRing();
    await a.pick("About");
    const about = await a.state();
    t.eq("the same screen as before", [about.title, about.rows.map((r) => r.text)], ["About", ["mPod", "Songs", "Library", "Version"]]);
    await d.press("select", 5200);
    await sleep(100);
    t.eq("holding Select there still opens Brick", (await a.state()).view, "brick");
    await d.press("menu"); await sleep(280);
    t.eq("Menu returns to About", (await a.state()).title, "About");
  });

  await section("browse", async () => {
    await libraryOpen();
    await a.pick("Browse");
    const s = await a.state();
    t.eq("Browse", [s.title, await a.titles()], ["Browse", ["Artists", "Albums", "Songs", "Genres", "Composers"]]);
    t.ok("each row opens a level", s.rows.every((r) => r.arrow));

    await a.pick("Artists");
    t.eq("Artists: All, then by name, ignoring The", await a.titles(), ["All", "Alpha", "The Beatles", "Zeta"]);
    await a.pick("All");
    t.eq("All opens every song", [(await a.state()).title, (await a.titles()).length], ["All Songs", 7]);
    await a.back();
    await a.pick("The Beatles");
    const beatles = await a.state();
    t.eq("more than one album gains a level", [beatles.title, await a.titles()], ["The Beatles", ["All Songs", "Abbey", "Help"]]);
    await a.pick("All Songs");
    t.eq("All Songs", [(await a.state()).title, await a.titles()], ["All Songs", ["Something", "Come Together", "Help"]]);
    await a.back();
    await a.pick("Abbey");
    t.eq("an album of that artist, in track order", [(await a.state()).title, await a.titles()], ["Abbey", ["Something", "Come Together"]]);
    await a.back(2);
    await a.pick("Zeta");
    t.eq("two albums, by another artist too", await a.titles(), ["All Songs", "Comp", "Solo"]);
    await a.back();
    await page.evaluate(`${P}.importer.songs.filter((s)=>s.artistName==="Zeta"&&s.albumName==="Solo").forEach((s)=>{s.albumName="Comp";s.albumArtist="Various"});${P}.importer.library.version++;0`);
    await sleep(60);
    await a.pick("Zeta");
    t.eq("one album: straight to its songs", await a.titles(), ["Solo", "Air"]);
    await a.reopen();
    await a.focusRing();
    await a.pick("Browse");

    console.log("# Albums");
    await a.pick("Albums");
    t.eq("Albums: All, then by name, ignoring The", await a.titles(), ["All", "Abbey", "The Album", "Comp", "Help", "Solo"]);
    await a.pick("Comp");
    t.eq("the album artist holds an album together", [(await a.state()).title, await a.titles()], ["Comp", ["Fugue", "Air"]]);
    await a.back(2);

    console.log("# Genres");
    await a.pick("Genres");
    t.eq("Genres: All, by name, Unknown Genre last", await a.titles(), ["All", "Classical", "Pop", "Rock", "Unknown Genre"]);
    await a.pick("Rock");
    t.eq("then the artists in that genre", [(await a.state()).title, await a.titles()], ["Rock", ["Alpha", "The Beatles"]]);
    await a.pick("The Beatles");
    t.eq("then their songs in it", [(await a.state()).title, await a.titles()], ["The Beatles", ["Something", "Come Together"]]);
    await a.back(2);
    await a.pick("Unknown Genre");
    t.eq("a missing genre", await a.titles(), ["Alpha"]);
    await a.pick("Alpha");
    t.eq("with its song", await a.titles(), ["Fugue"]);
    await a.back(3);

    console.log("# Composers");
    await a.pick("Composers");
    t.eq("Composers: All, then by name", await a.titles(), ["All", "Bach", "Harrison", "Lennon"]);
    await a.pick("All");
    t.eq("All lists only the songs that have one", [(await a.state()).title, (await a.titles()).sort()], ["All Songs", ["Air", "Come Together", "Fugue", "Something"]]);
    await a.back();
    await a.pick("Bach");
    t.eq("a composer's songs", [(await a.state()).title, await a.titles()], ["Bach", ["Fugue", "Air"]]);
    t.eq("console clean", logs, []);
  });

  await section("memory", async () => {
    await libraryOpen();
    await a.pick("Browse");
    await a.pick("Artists");
    await a.pick("The Beatles");
    await d.key("ArrowDown");
    await a.pick("Help");
    await a.back(2);
    t.eq("Artists keeps its row", (await a.state()).rows.find((r) => r.selected).text, "The Beatles");
    await a.pick("The Beatles");
    t.eq("the artist level keeps its row", (await a.state()).rows.find((r) => r.selected).text, "Help");
    await a.back(2);
    t.eq("Browse keeps its row", (await a.state()).rows.find((r) => r.selected).text, "Artists");
    await a.back();
    t.eq("root keeps its row", (await a.state()).rows.find((r) => r.selected).text, "Browse");
  });

  await section("help", async () => {
    await a.open();
    await a.focusRing();
    const HELP = ["No music yet", "Choose Add Folder", "to link your music.", "Add Folder"];
    await a.pick("Playlists");
    t.eq("Playlists", [(await a.state()).title, await a.titles()], ["Playlists", HELP]);
    await a.back();
    await a.pick("Browse");
    t.eq("Browse itself stays a menu", await a.titles(), ["Artists", "Albums", "Songs", "Genres", "Composers"]);
    for (const list of ["Artists", "Albums", "Songs", "Genres", "Composers"]) {
      await a.pick(list);
      const s = await a.state();
      t.eq(`${list} shows help`, [s.title, s.rows.map((r) => r.text), s.rows.findIndex((r) => r.selected)], [list, HELP, 3]);
      await a.back();
    }
    await a.setTree("A", { Lib: { "01 Plain.wav": tone() } });
    await a.link("A");
    await a.pick("Composers");
    t.eq("music with no composer at all", await a.titles(), ["No Music"]);
  });

  await section("reread", async () => {
    await a.open({ url: IMPORT });
    await a.setTree("A", LIBRARY);
    await a.link("A");
    const old = await a.tracks();
    t.eq("records from before have no tag version", old.map((r) => r.tagVersion), old.map(() => undefined));
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__gate=new Promise((open)=>{window.__open=open});" });
    await a.reopen();
    await page.resetSection();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
    t.eq("the stored library shows first", [await page.evaluate(`${P}.importer.songs.length`), await page.evaluate("window.__reads")], [7, 0]);
    await page.evaluate("window.__open();0");
    await a.idle();
    await sleep(100);
    const first = await page.evaluate("window.__reads");
    t.ok("a rescan rereads an older record", first > 0, first);
    const records = await a.tracks();
    t.ok("every record has the new version", records.every((r) => r.tagVersion > 0), JSON.stringify(records.map((r) => r.tagVersion)));
    t.eq("and the composer", records.map((r) => r.composer ?? null).sort(), ["Bach", "Bach", "Harrison", "Lennon", null, null, null]);
    t.eq("the album artist too", records.filter((r) => r.albumArtist).length, 2);
    t.eq("the same ids", records.map((r) => r.id).sort(), old.map((r) => r.id).sort());
    await page.evaluate(`${P}.importer.rescan();0`);
    await a.idle();
    t.eq("once only: the next rescan reads nothing", await page.evaluate("window.__reads"), first);
    await a.reopen();
    await a.idle();
    await sleep(100);
    t.eq("nor does the next start", await page.evaluate("window.__reads"), 0);
    await page.evaluate(`window.__tree.A.Lib["a1.mp3"].stamp=2000;__saveTree();${P}.importer.rescan();0`);
    await a.idle();
    t.ok("a changed file is still read", (await page.evaluate("window.__reads")) > 0);

    console.log("# a failed reread stays due (44)");
    await a.open({ url: IMPORT });
    await a.setTree("A", { Lib: { "bad.mp3": file({ b64: tagged({ title: "Bad" }) }) } });
    await a.link("A");
    await page.evaluate(`window.__tree.A.Lib["bad.mp3"].broken=true;__saveTree();0`);
    await a.reopen();
    await a.idle();
    await sleep(60);
    t.ok("it was tried", (await page.evaluate("window.__reads")) > 0);
    t.eq("the track stays, and counts as Skipped", [await page.evaluate(`${P}.importer.songs.length`), await page.evaluate(`${P}.importer.skipped`)], [1, 1]);
    await page.evaluate(`window.__reads=0;${P}.importer.rescan();0`);
    await a.idle();
    t.ok("so the next scan tries it again", (await page.evaluate("window.__reads")) > 0);
  });

  await section("shuffle-songs", async () => {
    await libraryOpen();
    await a.highlight("Shuffle Songs");
    await d.press("select");
    await sleep(350);
    t.ok("Select starts", await waitFor(async () => (await a.np())?.playing, 3000));
    let n = await a.np();
    t.eq("Now Playing, 1 of N", [(await a.state()).view, n.index, n.total], ["now-playing", 1, 7]);
    t.eq("the setting does not change", [(await a.state()).settings.shuffle, await page.evaluate(`${P}.playback.shuffle`)], ["off", false]);
    t.eq("the queue source is Songs", await source(), "songs|");
    const first = await queue();
    t.eq("the whole library", [...first].sort(), ["Air", "Come Together", "Fugue", "Help", "Second", "Solo", "Something"]);
    await d.press("forward"); await sleep(150);
    t.eq("it plays in that order", (await a.np()).title, first[1]);

    console.log("# Play/Pause on the row");
    await d.press("menu"); await sleep(280);
    let fresh = false;
    for (let i = 0; i < 6 && !fresh; i++) {
      await a.highlight("Shuffle Songs");
      await d.press("play");
      await sleep(350);
      n = await a.np();
      t.eq("Play/Pause starts it too, at the start", [n.index, n.total], [1, 7]);
      fresh = (await queue()).join() !== first.join();
      await d.press("menu"); await sleep(280);
    }
    t.ok("each press is a fresh order", fresh);

    console.log("# with Shuffle on");
    await page.evaluate(`${P}.settings.set("shuffle","albums");0`);
    await sleep(60);
    await a.highlight("Shuffle Songs");
    await d.press("select");
    await sleep(350);
    const order = await page.evaluate(`${P}.playback.order`);
    t.eq("Shuffle Songs wins, including over Albums", order, order.map((_, i) => i));
    t.eq("and the setting stands", (await a.state()).settings.shuffle, "albums");

    console.log("# a later change of the setting applies as in 11");
    await d.press("forward"); await sleep(150);
    const title = (await a.np()).title;
    await page.evaluate(`${P}.settings.set("shuffle","songs");0`);
    await sleep(120);
    t.eq("the order rebuilds around the current song", [(await a.np()).title, (await a.np()).index], [title, 1]);
    await page.evaluate(`${P}.settings.set("shuffle","off");0`);
    await sleep(120);
    t.eq("Off keeps that queue, at its true place", [(await a.np()).title, (await a.np()).index], [title, 2]);

    console.log("# with Songs already the queue source");
    await d.press("play"); await sleep(120);
    t.eq("paused", await page.evaluate(`${P}.playback.paused`), true);
    await d.press("menu"); await sleep(280);
    await a.highlight("Shuffle Songs");
    await d.press("play");
    await sleep(350);
    t.eq("it still builds a new order, and plays", [await source(), (await a.np()).index, (await a.np()).playing], ["songs|", 1, true]);
  });

  await section("play-highlighted", async () => {
    await libraryOpen();
    await a.pick("Browse");
    await a.pick("Albums");
    await a.pick("Comp");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    t.eq("source", await source(), "album|comp\0various");
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);

    console.log("# not the source: it starts, and does not pause");
    await a.highlight("Abbey");
    await d.press("play");
    await sleep(350);
    t.eq("started as rule 3 does", [(await a.state()).view, await queue()], ["now-playing", ["Something", "Come Together"]]);
    t.eq("recorded as the source", await source(), "album|abbey\0the beatles");
    t.ok("playing, not paused", await waitFor(async () => (await a.np()).playing, 2000));

    console.log("# the source: 08 stands");
    await d.press("menu"); await sleep(280);
    await a.highlight("Abbey");
    await d.press("play");
    await sleep(150);
    t.eq("Play/Pause pauses", [(await a.state()).view, await page.evaluate(`${P}.playback.paused`)], ["list", true]);
    await d.press("play");
    await sleep(200);
    t.eq("and resumes", await page.evaluate(`${P}.playback.paused`), false);

    console.log("# a song row: 08 stands");
    await a.pick("Abbey");
    await d.key("ArrowDown");
    await d.press("play");
    await sleep(150);
    t.eq("Play/Pause pauses on a song row", [(await a.state()).view, await page.evaluate(`${P}.playback.paused`)], ["list", true]);
    await d.press("play");
    await sleep(200);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);

    console.log("# a row that holds no songs: 08 stands");
    await a.highlight("Albums");
    await d.press("play");
    await sleep(150);
    t.eq("Albums holds no songs directly", [(await a.state()).title, await page.evaluate(`${P}.playback.paused`)], ["Browse", true]);
    await d.press("play");
    await sleep(200);

    console.log("# each kind of list row");
    const started = async (want) => {
      await d.press("play");
      await sleep(350);
      const out = [(await a.state()).view, (await queue()).length];
      await d.press("menu"); await sleep(280);
      t.eq(`${want[0]} starts`, out, ["now-playing", want[1]]);
    };
    await a.highlight("Songs");
    await started(["Songs", 7]);
    await a.pick("Artists");
    await a.highlight("All");
    await d.press("play");
    await sleep(200);
    t.eq("All is Songs, the source: it pauses", await page.evaluate(`${P}.playback.paused`), true);
    await d.press("play"); await sleep(200);
    await a.highlight("The Beatles");
    await started(["an artist with albums", 3]);
    await a.pick("The Beatles");
    await a.highlight("All Songs");
    await d.press("play");
    await sleep(200);
    t.eq("All Songs is that artist's list, a queue source of its own", (await a.state()).view, "now-playing");
    await d.press("menu"); await sleep(280);
    await a.highlight("Help");
    await started(["an album of an artist", 1]);
    await a.back(2);
    await a.pick("Genres");
    await a.highlight("Rock");
    await started(["a genre", 3]);
    await a.pick("Rock");
    await a.highlight("Alpha");
    await started(["an artist in a genre", 1]);
    await a.back(2);
    await a.pick("Composers");
    await a.highlight("Bach");
    await started(["a composer", 2]);
    await a.highlight("All");
    await started(["All composers", 4]);
    await a.back(2);
    await a.back();
    await a.highlight("Playlists");
    await a.pick("Playlists");
    await a.highlight("A");
    await started(["a playlist", 7]);

    console.log("# no track loaded: rule 3 as before");
    await toRoot();
    await page.evaluate(`${P}.playback.clear()`);
    await sleep(100);
    await a.pick("Browse");
    await a.pick("Albums");
    await a.highlight("Help");
    await d.press("play");
    await sleep(350);
    t.eq("it starts", [(await a.state()).view, await queue()], ["now-playing", ["Help"]]);
    t.eq("console clean", logs, []);
  });

  await section("test-page", async () => {
    await a.open({ url: IMPORT });
    t.eq("the test page keeps its root", await a.titles(), ["Playlists", "Artists", "Songs", "Settings"]);
    await a.focusRing();
    await a.pick("Settings");
    t.eq("and its Settings", await a.titles(), ["Name", "About", "Shuffle", "Repeat", "Backlight Timer", "Clicker", "Import", "Reset All Settings"]);
    await a.back();
    await a.pick("Songs");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await a.pick("Playlists");
    await d.press("play");
    await sleep(200);
    t.eq("Play on a playlist row pauses, as 08 says", [(await a.state()).title, await page.evaluate(`${P}.playback.paused`)], ["Playlists", true]);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
