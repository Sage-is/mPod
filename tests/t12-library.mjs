// Spec 32: a library that survives restarts. Fake handles for permission states, real OPFS handles
// for what a real FileSystemDirectoryHandle does, and a stubbed picker for the press.
import { readFileSync } from "node:fs";
import "./gen-samples.mjs";
import { BASE, boot, CLEAR_STORED, driver, sleep, T, waitFor } from "./h.mjs";

const { page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
  await page.goto(BASE);
  await fn();
  await page.resetSection();
};
const P = "document.querySelector('pod-player')";
const IMPORT = BASE + "?import";
const PRODUCT = BASE + "index.html";
const TONE = readFileSync("fixtures/audio/tone-0.wav").toString("base64");

// Injected before any page script, so a stored folder finds its handle again after a reload.
const FAKES = `
window.__reads = 0;
window.__permission = "granted";
window.__requests = [];
window.__tone = Uint8Array.from(atob("${TONE}"), (c) => c.charCodeAt(0));
class Counted extends File {
  slice(...a) { window.__reads++; return super.slice(...a); }
}
window.__tree = JSON.parse(sessionStorage.getItem("tree") ?? "null") ?? {};
window.__saveTree = () => sessionStorage.setItem("tree", JSON.stringify(window.__tree));
const fileHandle = (name, spec) => ({
  kind: "file", name,
  getFile: async () => {
    if (spec.unreadable) throw new DOMException("gone", "NotFoundError");
    const body = spec.text !== undefined ? [spec.text] : spec.audio ? [window.__tone] : ["x".repeat(spec.size ?? 10)];
    return new Counted(body, name, { lastModified: spec.stamp ?? 1000 });
  },
});
const dirHandle = (name, tree, testId) => ({
  kind: "directory", name, testId,
  async *entries() {
    if (tree === window.__tree[testId] && window.__gone?.includes(testId)) throw new DOMException("gone", "NotFoundError");
    if (window.__denied?.includes(testId)) throw new DOMException("no", "NotAllowedError");
    for (const [n, v] of Object.entries(tree)) yield [n, v.file ? fileHandle(n, v) : dirHandle(n, v)];
  },
  getDirectoryHandle: async (n) => {
    if (!tree[n] || tree[n].file) throw new DOMException("gone", "NotFoundError");
    return dirHandle(n, tree[n]);
  },
  getFileHandle: async (n) => {
    if (!tree[n]?.file) throw new DOMException("gone", "NotFoundError");
    return fileHandle(n, tree[n]);
  },
  queryPermission: async () => window.__permissions?.[testId] ?? window.__permission,
  requestPermission: async () => {
    window.__requests.push({ testId, active: navigator.userActivation.isActive });
    const out = window.__answer ?? "granted";
    if (window.__permissions) window.__permissions[testId] = out;
    if (out === "granted") window.__permission = "granted";
    return out;
  },
});
window.__fake = (id) => dirHandle(id, window.__tree[id], id);
window.__podHandles = new Proxy({}, { get: (_, id) => (window.__tree[id] ? window.__fake(id) : undefined) });
`;

const fresh = async (url = IMPORT, { waitBoot = true } = {}) => {
  await page.evaluate(`sessionStorage.clear();${CLEAR_STORED}`).catch(() => {});
  await page.send("Page.bringToFront");
  await page.goto(url);
  if (waitBoot) await sleep(2150);
};
const reload = async (url = IMPORT, wait = 2150) => {
  await page.goto(url);
  if (wait) await sleep(wait);
};
const openProduct = async () => {
  await page.send("Page.navigate", { url: PRODUCT });
  await sleep(100);
  await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 5000);
  await waitFor(async () => (await d.state()).view === "list", 4000);
};
const state = () => d.state();
const titles = async () => (await state()).rows.map((r) => r.text);
const value = async (text) => (await state()).rows.find((r) => r.text === text)?.value;
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
const back = async (n = 1) => { for (let i = 0; i < n; i++) { await d.key("ArrowLeft"); await sleep(280); } };
const focusRing = async () => { await d.press("menu"); await sleep(280); };
const setTree = (id, tree) => page.evaluate(`window.__tree[${JSON.stringify(id)}]=${JSON.stringify(tree)};__saveTree();0`);
const link = (id) => page.evaluate(`${P}.linkFolder(__fake(${JSON.stringify(id)})).then(()=>1)`);
const idle = () => page.evaluate(`${P}.importer.running.then(()=>1)`);
const stored = (name) => page.evaluate(`new Promise((res,rej)=>{const o=indexedDB.open("mpod",1);o.onerror=()=>rej(o.error);o.onsuccess=()=>{const db=o.result;const q=db.transaction(${JSON.stringify(name)}).objectStore(${JSON.stringify(name)}).getAll();q.onsuccess=()=>{db.close();res(q.result.map((r)=>{const{handle,...x}=r;return x}))}}})`);
const file = (extra = {}) => ({ file: true, ...extra });
const MUSIC = {
  Artist: { Album: { "01 One.flac": file({ stamp: 10 }), "02 Two.flac": file({ stamp: 20 }), "03 Three.flac": file({ stamp: 30 }) } },
  "mix.m3u": file({ text: "Artist/Album/02 Two.flac\nArtist/Album/gone.flac\n", stamp: 40 }),
  "cover.txt": file(),
};

try {
  await section("restore", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await link("A");
    t.eq("linked, library flips", await page.evaluate(`${P}.catalogue.songs.map((s)=>s.name)`), ["One", "Two", "Three"]);
    const records = await stored("tracks");
    const fields = await page.evaluate(`new Promise((res)=>{const o=indexedDB.open("mpod",1);o.onsuccess=()=>{const q=o.result.transaction("tracks").objectStore("tracks").getAll();q.onsuccess=()=>{o.result.close();res(Object.keys(q.result[0]).sort())}}})`);
    t.eq("index fields stored", fields, ["album", "art", "artist", "duration", "folderId", "genre", "id", "modified", "path", "size", "taggedTitle", "title", "track"]);
    t.eq("no audio stored", JSON.stringify(records).includes("xxxxxxxxxx"), false);
    const folders = await stored("folders");
    t.eq("folder stored", [folders.length, folders[0].name, folders[0].scannedAt > 0], [1, "A", true]);
    const lists = await stored("playlists");
    t.eq("playlists stored, with unmatched entries kept", lists.map((l) => [l.name, l.matched.length, l.entries?.length ?? null]).sort(), [["A", 3, null], ["mix", 1, 2]].sort());
    await page.evaluate("window.__marker=1");
    await reload();
    t.eq("really a new page", await page.evaluate("window.__marker ?? 0"), 0);
    t.eq("library survives", await page.evaluate(`${P}.catalogue.songs.map((s)=>s.name)`), ["One", "Two", "Three"]);
    await focusRing();
    await pick("Playlists");
    t.eq("playlists survive", await titles(), ["A", "mix"]);
    await back();
    await pick("Settings"); await pick("Import");
    t.eq("Library and counts", [await value("Library"), await value("Songs"), await value("Skipped")], ["Imported", "3", "1"]);
    t.eq("nothing in localStorage", await page.evaluate("Object.keys(localStorage).filter((k)=>k!=='pod-player:settings').length"), 0);
    t.eq("console clean", logs, []);
  });

  await section("no-tags-on-start", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await link("A");
    await reload(IMPORT, 0);
    await sleep(2300);
    await idle();
    t.eq("start reads no tag data for unchanged files", await page.evaluate("window.__reads"), 0);
  });

  await section("order", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await link("A");
    await page.evaluate("window.__permission='prompt';window.__tree.A['0 late.flac']={file:true,stamp:1};__saveTree();0");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await reload(IMPORT, 0);
    await waitFor(async () => (await state().catch(() => null))?.view === "list", 3000);
    const s = await state();
    t.eq("Reconnect first, with an arrow", [s.rows[0].text, s.rows[0].arrow, s.rows[0].selected], ["Reconnect", true, true]);
    t.eq("rest of root unchanged", s.rows.slice(1).map((r) => r.text), ["Playlists", "Artists", "Songs", "Settings"]);
    t.eq("stored library shows with no permission", await page.evaluate(`${P}.catalogue.songs.length`), 3);
    await d.press("select"); await sleep(200);
    t.eq("request made inside the press", await page.evaluate("window.__requests"), [{ testId: "A", active: true }]);
    await idle();
    t.eq("Reconnect leaves", (await titles())[0], "Playlists");
    t.eq("rescan ran after permission", await page.evaluate(`${P}.catalogue.songs.length`), 4);
    await page.resetSection();
  });

  await section("refused", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await link("A");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';window.__answer='denied';" });
    await reload();
    await focusRing();
    await pick("Reconnect");
    await sleep(100);
    t.eq("refused: the row stays", (await state()).rows[0].text, "Reconnect");
    await pick("Songs");
    t.eq("rows stay visible while disconnected", await titles(), ["One", "Two", "Three"]);
    await d.press("select"); await sleep(250);
    const s = await state();
    t.eq("chosen song from a waiting folder: asked, refused, stays on the list", [s.view, s.title, await page.evaluate("window.__requests.length")], ["list", "Songs", 2]);
    t.eq("asked inside the press", await page.evaluate("window.__requests[1].active"), true);
    await page.evaluate("window.__answer='granted'");
    await d.press("select"); await sleep(600);
    const n = await state();
    t.eq("granted in the same press plays", [n.view, n.nowPlaying?.title], ["now-playing", "One"]);
    await idle();
    logs.length = 0; // These fake tracks are not audio, which 12 logs as a failed play.
  });

  await section("play", async () => {
    await fresh();
    await setTree("A", { Art: { Alb: { "01 Tone.wav": file({ audio: true }), "02 Tone.wav": file({ audio: true }) } } });
    await link("A");
    await reload();
    await focusRing();
    await pick("Songs");
    await d.press("select");
    await waitFor(async () => (await state()).nowPlaying?.playing, 2000);
    const n = await state();
    t.eq("plays through the handle after a reload", [n.nowPlaying.title, n.nowPlaying.total, n.nowPlaying.playing], ["Tone", 2, true]);
    t.eq("no URL kept on the song", await page.evaluate(`${P}.playback.song.previewUrl ?? null`), null);
    t.eq("next file open before the track ends", await page.evaluate(`[${P}.playback.next?.el.src.startsWith("blob:") ?? false, ${P}.importer.openFiles.size]`), [true, 2]);
    t.ok("duration stored once known", await waitFor(async () => (await stored("tracks")).some((r) => r.duration > 0), 2000));
    await d.press("forward"); await sleep(400);
    t.eq("next track", (await state()).nowPlaying.index, 2);
    t.eq("object URLs released as channels go", await page.evaluate(`${P}.importer.openFiles.size`), 1);
    t.eq("console clean", logs, []);
  });

  await section("open-fails", async () => {
    await fresh();
    await setTree("A", { Art: { Alb: { "01 Tone.wav": file({ audio: true }), "02 Gone.wav": file({ audio: true }), "03 Tone.wav": file({ audio: true }) } } });
    await link("A");
    await focusRing();
    await pick("Songs");
    await page.evaluate("window.__tree.A.Art.Alb['02 Gone.wav'].unreadable=true;0");
    await d.press("select"); await sleep(600);
    await d.press("forward"); await sleep(500);
    const n = await state();
    t.eq("an unopenable file skips to the next", [n.nowPlaying?.index, n.nowPlaying?.playing], [3, true]);
    await d.press("menu"); await sleep(280); await d.press("menu"); await sleep(280); await d.press("menu"); await sleep(280);
    await pick("Settings"); await pick("Import");
    t.eq("and adds 1 to Skipped", await value("Skipped"), "1");
    t.eq("console clean", logs, []);
    await d.press("play"); await sleep(50);

    console.log("# first track fails");
    await fresh();
    await setTree("A", { Art: { Alb: { "01 Gone.wav": file({ audio: true }), "02 Tone.wav": file({ audio: true }) } } });
    await link("A");
    await focusRing();
    await pick("Songs");
    await page.evaluate("window.__tree.A.Art.Alb['01 Gone.wav'].unreadable=true;0");
    await d.press("select"); await sleep(600);
    t.eq("starts on the next one", (await state()).nowPlaying?.index, 2);

    console.log("# every track fails");
    await fresh();
    await setTree("A", { Art: { Alb: { "01 Gone.wav": file({ audio: true }) } } });
    await link("A");
    await focusRing();
    await pick("Songs");
    await page.evaluate("window.__tree.A.Art.Alb['01 Gone.wav'].unreadable=true;0");
    await d.press("select"); await sleep(600);
    const s = await state();
    t.eq("queue ends, back on the list", [s.view, s.title], ["list", "Songs"]);
    t.eq("console clean", logs, []);
  });

  await section("rescan", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await link("A");
    const ids = await page.evaluate(`Object.fromEntries(${P}.catalogue.songs.map((s)=>[s.name,s.id]))`);
    await page.evaluate(`{
      const alb = __tree.A.Artist.Album;
      alb["04 New.flac"] = { file: true, stamp: 50 };
      alb["02 Two.flac"] = { file: true, stamp: 99, size: 20 };
      delete alb["03 Three.flac"];
      __tree.A.Artist.Moved = { "03 Three.flac": { file: true, stamp: 31 } };
      __tree.A["mix.m3u"] = { file: true, stamp: 41, text: "Artist/Album/gone.flac\\nArtist/Album/01 One.flac\\n" };
      __saveTree(); __reads = 0; }`);
    await focusRing();
    await pick("Settings"); await pick("Import");
    await pick("Rescan");
    await idle();
    await sleep(60);
    const names = await page.evaluate(`Object.fromEntries(${P}.catalogue.songs.map((s)=>[s.name,s.id]))`);
    t.eq("new added, changed kept", Object.keys(names).length, 4);
    t.eq("changed file keeps its identity", names.Two, ids.Two);
    t.ok("a new file gets a new identity", !Object.values(ids).includes(names.New), names.New);
    t.eq("tags read only for new and changed files", await page.evaluate("__reads > 0 && __reads <= 3*2"), true);
    await back(2);
    await pick("Playlists");
    await pick("mix");
    t.eq("a folder's .m3u refreshes on rescan", await titles(), ["One"]);
    await back(2);
    await pick("Settings"); await pick("Import");
    t.eq("value clear when done", await value("Rescan"), null);

    t.eq("console clean", logs, []);
  });

  await section("moved-identity", async () => {
    await fresh();
    await setTree("A", { Art: { Alb: { "01 One.flac": file({ stamp: 10, size: 44 }) } } });
    await link("A");
    const id = await page.evaluate(`${P}.catalogue.songs[0].id`);
    await page.evaluate(`{
      const alb = __tree.A.Art.Alb;
      alb["1 One.flac"] = { file: true, stamp: 11, size: 44 };
      delete alb["01 One.flac"];
      __saveTree(); }`);
    await page.evaluate(`${P}.importer.rescan()`);
    await idle();
    const s = await page.evaluate(`${P}.catalogue.songs.map((x)=>[x.id,x.path])`);
    t.eq("same size and tags keeps identity, new path", s, [[id, "A/Art/Alb/1 One.flac"]]);
    t.eq("stored under the new path", (await stored("tracks")).map((r) => [r.id, r.path]), s);
    await page.evaluate(`{
      const alb = __tree.A.Art.Alb;
      alb["1 Renamed.flac"] = alb["1 One.flac"];
      delete alb["1 One.flac"];
      __saveTree(); }`);
    await page.evaluate(`${P}.importer.rescan()`);
    await idle();
    const other = await page.evaluate(`${P}.catalogue.songs.map((x)=>x.id)`);
    t.ok("different tags: a delete plus an add", other.length === 1 && other[0] !== id, other.join());
  });

  await section("missing", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await link("A");
    await focusRing();
    await pick("Settings"); await pick("Import");
    await page.evaluate("window.__gone=['A'];0");
    await page.evaluate(`${P}.importer.rescan()`);
    await idle(); await sleep(60);
    t.eq("tracks stay", await value("Songs"), "3");
    await pick("Folders");
    t.eq("row reads Missing", (await state()).rows.map((r) => [r.text, r.value, r.arrow]), [["A", "Missing", true]]);
    await page.evaluate("window.__gone=[];0");
    await page.evaluate(`${P}.importer.rescan()`);
    await idle(); await sleep(60);
    t.eq("returns when it resolves again", (await state()).rows[0].value, "3");
  });

  await section("folders", async () => {
    await fresh();
    await setTree("A", MUSIC);
    await setTree("B", { Y: { Z: { "x.flac": file() } } });
    await link("A"); await link("B");
    await focusRing();
    await pick("Settings"); await pick("Import");
    await pick("Folders");
    t.eq("list with counts", (await state()).rows.map((r) => [r.text, r.value]), [["A", "3"], ["B", "1"]]);
    await pick("A");
    const s = await state();
    t.eq("offers three, Cancel preselected", [s.title, s.rows.map((r) => [r.text, r.selected])], ["A", [["Rescan", false], ["Remove", false], ["Cancel", true]]]);
    await d.key("ArrowRight"); await sleep(280);
    t.eq("Cancel changes nothing", [(await state()).title, (await state()).rows.length], ["Folders", 2]);
    await pick("A");
    t.eq("Cancel preselected again", (await state()).rows[2].selected, true);
    await d.key("ArrowUp"); await d.key("ArrowRight"); await sleep(280); await idle();
    t.eq("Remove forgets the folder", (await state()).rows.map((r) => r.text), ["B"]);
    t.eq("and its tracks", await page.evaluate(`${P}.catalogue.songs.map((s)=>s.name)`), ["x"]);
    t.eq("files untouched", await page.evaluate("Object.keys(__tree.A.Artist.Album).length"), 3);
    await page.evaluate(`${P}.importer.flushing.then(()=>1)`);
    await sleep(50);
    t.eq("gone from the store", [(await stored("folders")).length, (await stored("tracks")).length], [1, 1]);
    await pick("B");
    await d.key("ArrowUp"); await d.key("ArrowUp"); await d.key("ArrowRight"); await sleep(280); await idle();
    t.eq("Rescan from the folder returns to Folders", (await state()).title, "Folders");

    console.log("# clear");
    await back();
    await pick("Clear Imported");
    await sleep(120);
    t.eq("Clear Imported clears the stored data", [(await stored("folders")).length, (await stored("tracks")).length, (await stored("playlists")).length, (await stored("meta")).length], [0, 0, 0, 0]);
    await reload();
    t.eq("nothing returns", await page.evaluate(`${P}.importer.songs.length`), 0);
  });

  await section("removal-stops", async () => {
    await fresh();
    await setTree("A", { Art: { Alb: { "01 Tone.wav": file({ audio: true }) } } });
    await link("A");
    await focusRing();
    await pick("Songs");
    await d.press("select"); await sleep(500);
    await d.press("menu"); await sleep(280); await d.press("menu"); await sleep(280); await d.press("menu"); await sleep(280);
    await pick("Settings"); await pick("Import"); await pick("Folders"); await pick("A");
    await d.key("ArrowUp"); await d.key("ArrowRight"); await sleep(400);
    t.eq("removing a folder that is playing stops it", await page.evaluate(`[${P}.playback.queue.length, ${P}.playback.playing]`), [0, false]);
  });

  await section("picker", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__picks = [];
      window.showDirectoryPicker = (options) => {
        window.__picks.push({ options, active: navigator.userActivation.isActive });
        if (window.__cancel) return Promise.reject(new DOMException("no", "AbortError"));
        return Promise.resolve(window.__fake("A"));
      };` });
    await fresh();
    await page.evaluate("window.__cancel=true;0");
    await focusRing();
    await pick("Settings"); await pick("Import");
    const before = JSON.stringify(await state());
    await d.press("select"); await sleep(100);
    t.eq("Add Folder uses the directory picker, read mode, inside the press", await page.evaluate("window.__picks"), [{ options: { mode: "read" }, active: true }]);
    t.eq("cancelling changes nothing", JSON.stringify(await state()), before);
    await setTree("A", MUSIC);
    await page.evaluate("window.__cancel=false;0");
    await d.press("select"); await sleep(100); await idle();
    t.eq("picked folder linked", await value("Songs"), "3");

    console.log("# empty state");
    await page.evaluate(`sessionStorage.clear();0`);
    await page.send("Page.navigate", { url: "about:blank" });
    await sleep(100);
    await page.goto(BASE);
    await page.evaluate(CLEAR_STORED);
    await openProduct();
    await focusRing();
    for (const list of ["Playlists", "Artists", "Songs"]) {
      if (list !== "Playlists") await pick("Browse");
      await pick(list);
      const s = await state();
      t.eq(`${list}: help`, [s.title, s.rows.map((r) => [r.text, r.selected])], [list, [["No music yet", false], ["Choose Add Folder", false], ["to link your music.", false], ["Add Folder", true]]]);
      await back(list === "Playlists" ? 1 : 2);
    }
    await pick("Browse");
    await pick("Songs");
    await d.shot("library-help");
    await setTree("A", MUSIC);
    await page.evaluate("window.__picks=[];0");
    await d.press("select"); await sleep(150); await idle(); await sleep(100);
    t.eq("Add Folder there opens the picker directly", await page.evaluate("window.__picks.length"), 1);
    const s = await state();
    t.eq("songs replace the help, first row selected", [s.rows.map((r) => r.text), s.rows.findIndex((r) => r.selected)], [["One", "Two", "Three"], 0]);
    await page.evaluate(CLEAR_STORED).catch(() => {});
  });

  await section("session-only", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker;" });
    await fresh();
    await focusRing();
    await pick("Settings"); await pick("Import");
    t.eq("no picker: informational row, nothing to rescan", await titles(), ["Add Folder", "Add Playlists", "Library", "Songs", "Skipped", "Clear Imported", "Lasts until reload"]);
    t.eq("informational", (await state()).rows.at(-1), { text: "Lasts until reload", value: null, selected: false, arrow: false });
  });

  await section("no-indexeddb", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } });" });
    await page.goto(IMPORT);
    await sleep(2150);
    await focusRing();
    await pick("Settings"); await pick("Import");
    t.eq("behaves as session-only", (await titles()).at(-1), "Lasts until reload");
    await page.evaluate(`${P}.importFiles([new File(["x"],"a.flac")]).then(()=>1)`);
    t.eq("import still works", await value("Songs"), "1");
    logs.length = 0;
    await page.resetSection();
    await page.goto(BASE);
  });

  await section("real-handles", async () => {
    await fresh();
    await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("Real", { recursive: true }).catch(() => {});
      const top = await root.getDirectoryHandle("Real", { create: true });
      const art = await top.getDirectoryHandle("Art", { create: true });
      const alb = await art.getDirectoryHandle("Alb", { create: true });
      for (const n of ["01 Tone.wav", "02 Tone.wav"]) {
        const w = await (await alb.getFileHandle(n, { create: true })).createWritable();
        await w.write(window.__tone); await w.close();
      }
      await ${P}.linkFolder(top);
      return 1;
    })()`);
    t.eq("real directory handle scans", await page.evaluate(`${P}.catalogue.songs.map((s)=>s.path)`), ["Real/Art/Alb/01 Tone.wav", "Real/Art/Alb/02 Tone.wav"]);
    await reload();
    t.eq("a real handle survives IndexedDB and a reload", [await page.evaluate(`${P}.importer.folders.size`), await page.evaluate(`[...${P}.importer.folders.values()][0].handle?.kind`)], [1, "directory"]);
    await focusRing();
    await pick("Songs");
    await d.press("select");
    t.ok("real file plays after a reload", await waitFor(async () => (await state()).nowPlaying?.playing, 2500));
    await page.evaluate(`(async () => {
      const root = await navigator.storage.getDirectory();
      await (await (await root.getDirectoryHandle("Real")).getDirectoryHandle("Art")).getDirectoryHandle("Alb").then((a) => a.removeEntry("02 Tone.wav"));
      await ${P}.importer.rescan(); await ${P}.importer.running; return 1;
    })()`);
    t.eq("a deleted real file drops on rescan", await page.evaluate(`${P}.importer.songs.length`), 1);
    await page.evaluate(`navigator.storage.getDirectory().then((r)=>r.removeEntry("Real",{recursive:true})).then(()=>1)`);
    await d.press("play");
    await page.evaluate(`${P}.importer.rescan()`);
    await idle(); await sleep(60);
    t.eq("a deleted real folder reads Missing, tracks kept", await page.evaluate(`[[...${P}.importer.folders.values()][0].missing, ${P}.importer.songs.length]`), [true, 1]);
    t.eq("console clean", logs, []);
  });

  await section("playlist-file", async () => {
    await fresh();
    await page.evaluate(`${P}.importFiles([new File(["Artist/Album/01 One.flac\\nArtist/Album/none.flac\\n"], "picked.m3u")]).then(()=>1)`);
    await reload();
    await setTree("A", MUSIC);
    await link("A");
    await focusRing();
    await pick("Playlists");
    t.eq("Add Playlists file is stored, and resolves on a later scan", await titles(), ["picked", "A", "mix"]);
    await pick("picked");
    t.eq("with its matches", await titles(), ["One"]);
    await reload();
    t.eq("still there after a reload, in the same order", await page.evaluate(`${P}.catalogue.playlists.map((p)=>[p.name,p.songIds.length])`), [["picked", 1], ["A", 3], ["mix", 1]]);
    t.eq("console clean", logs, []);
  });

  await section("persist", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__persist = 0;
      navigator.storage.persist = () => { window.__persist++; return Promise.resolve(false); };` });
    await fresh();
    await setTree("A", MUSIC);
    t.eq("not before an import", await page.evaluate("window.__persist"), 0);
    await link("A");
    await page.evaluate(`${P}.importFiles([new File(["x"],"a.flac")]).then(()=>1)`);
    t.eq("asked once, after the first import, result ignored", await page.evaluate("window.__persist"), 1);
  });

  await section("large", async () => {
    await fresh();
    const big = {};
    for (let i = 0; i < 40; i++) {
      const dir = {};
      for (let j = 0; j < 75; j++) dir[`t${j}.flac`] = { file: true, stamp: 1 };
      big[`d${i}`] = dir;
    }
    await page.evaluate(`__tree.Big=${JSON.stringify(big)};0`);
    await page.evaluate(`let last=performance.now();window.__gap=0;window.__beat=setInterval(()=>{const n=performance.now();__gap=Math.max(__gap,n-last);last=n},5);0`);
    await page.evaluate(`${P}.linkFolder(__fake("Big")).then(()=>1)`);
    await page.evaluate(`window.__gapFirst=__gap;__gap=0;${P}.importer.rescan()`);
    await idle();
    const [first, again] = await page.evaluate("clearInterval(__beat);[__gapFirst,__gap]");
    console.log(`    3000 tracks: longest stall ${Math.round(first)} ms first scan, ${Math.round(again)} ms rescan`);
    t.eq("all in", await page.evaluate(`${P}.importer.songs.length`), 3000);
    t.ok("first scan stays responsive, under 200 ms", first < 200, first);
    t.ok("rescan stays responsive, under 200 ms", again < 200, again);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
