import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import "./gen-samples.mjs";
import { BASE, boot, driver, sleep, T } from "./h.mjs";

const { browser, page, close, logs } = await boot();
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
const root = `${P}.shadowRoot`;
const IMPORT = BASE + "?import";
const SAMPLES = resolve("work/samples");

function walk(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ path: rel, b64: readFileSync(full).toString("base64") });
  }
  return out;
}
const tree = (name) => walk(join(SAMPLES, name), name);

const MAKE = `window.__mk = (items) => items.map(({ path, b64, stamp }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = new File([bytes], path.split("/").pop(), { lastModified: stamp ?? 1000 });
  if (path.includes("/")) Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}); 0`;
const load = async (url) => {
  await page.evaluate("localStorage.clear()").catch(() => {});
  await page.send("Page.bringToFront");
  await page.goto(url);
  await sleep(2150);
  await page.evaluate(MAKE);
};
const importTree = (items) => page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(items)})).then(() => 1)`);
const state = () => d.state();
const titles = async () => (await state()).rows.map((r) => r.text);
const value = async (text) => (await state()).rows.find((r) => r.text === text)?.value;

// Ring keys walk to a named row, then Right selects it.
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
const openImport = async () => { await focusRing(); await pick("Settings"); await pick("Import"); };

try {
  await section("switch", async () => {
    await load(BASE);
    await d.press("menu");
    const before = JSON.stringify(await state());
    const inputs = () => page.evaluate(`${root}.querySelectorAll('input[type=file]').length`);
    t.eq("no inputs without the attribute", await inputs(), 0);
    await page.evaluate(`${P}.importFiles(__mk([{path:"A/B/c.flac",b64:"eA=="}])).then(()=>1)`);
    t.eq("importFiles is inert without the attribute", JSON.stringify(await state()), before);
    t.eq("still no inputs", await inputs(), 0);
    await pick("Settings");
    t.eq("settings rows", await titles(), ["About", "Shuffle", "Repeat", "Backlight Timer", "Clicker", "Reset All Settings"]);

    await load(IMPORT);
    t.eq("root untouched by the switch", await titles(), ["Playlists", "Artists", "Songs", "Settings"]);
    await focusRing();
    await pick("Settings");
    const s = await state();
    t.eq("Import sits above Reset", s.rows.map((r) => r.text), ["About", "Shuffle", "Repeat", "Backlight Timer", "Clicker", "Import", "Reset All Settings"]);
    t.eq("Import row has an arrow, no value", [s.rows[5].arrow, s.rows[5].value], [true, null]);
    t.eq("debugState keys unchanged", Object.keys(s), ["view", "title", "rows", "nowPlaying", "brick", "settings", "backlit"]);
    await pick("Import");
    const i = await state();
    t.eq("title", [i.view, i.title], ["list", "Import"]);
    t.eq("import rows", i.rows, [
      { text: "Add Folder", value: null, selected: true, arrow: false },
      { text: "Add Playlists", value: null, selected: false, arrow: false },
      { text: "Library", value: "All", selected: false, arrow: false },
      { text: "Songs", value: "0", selected: false, arrow: false },
      { text: "Skipped", value: "0", selected: false, arrow: false },
      { text: "Clear Imported", value: null, selected: false, arrow: false },
    ]);
    t.eq("hidden inputs live in the shadow root", await page.evaluate(`[${root}.querySelectorAll('input[webkitdirectory]').length, ${root}.querySelectorAll('input[type=file][hidden]').length]`), [1, 2]);
    await pick("Library");
    t.eq("Library toggles", await value("Library"), "Imported");
    await d.key("ArrowRight");
    t.eq("Library wraps", await value("Library"), "All");
    const stay = JSON.stringify(await state());
    await d.key("ArrowDown");
    await d.key("ArrowRight"); await sleep(50);
    await d.key("ArrowDown");
    await d.key("ArrowRight"); await sleep(50);
    const after = await state();
    t.eq("Songs and Skipped do nothing", [after.title, after.rows.findIndex((r) => r.selected)], ["Import", 4]);
    void stay;
    await d.shot("import-screen");
  });

  await section("details", async () => {
    await load(IMPORT);
    await importTree(tree("Mix"));
    await importTree([{ path: "Only/b track.flac", b64: "eA==" }, { path: "a.flac", b64: "eA==" }]);
    await openImport();
    t.eq("Songs counts tracks", await value("Songs"), "24");
    t.eq("Skipped: empty file plus unmatched entries", await value("Skipped"), "5");
    t.eq("first import sets Imported", await value("Library"), "Imported");
    const songs = await page.evaluate(`${P}.catalogue.songs.map((s) => [s.name, s.artistName, s.albumName])`);
    const want = [
      ["Tagged Opening", "Alpha Tag", "First Tag Album"],
      ["Sëcond Ütf8", "Alpha Tag", "First Tag Album"],
      ["Third Lätin", "Alpha Tag", "First Tag Album"],
      ["Fourth Be", "Alpha", "First Tag Album"],
      ["After Cover", "Beta Tag", "Art Album"],
      ["Unsync Title", "Beta Tag", "Art Album"],
      ["Flag Title", "Beta Tag", "Big Art"],
      ["Extended Hdr", "Beta Tag", "Art Album"],
      ["Front Moov", "Delta Tag", "Atom Album"],
      ["End Moov", "Delta Tag", "Atom Album"],
      ["Wide Mdat", "Delta Tag", "Atom Album"],
      ["Utf Sixteen", "Delta Album Artist", "Atom Album"],
      ["No Moov", "Delta", "Atoms"],
      ["Dash Title", "Echo", "Plain"],
      ["Disc Track", "Echo", "Plain"],
      ["Title From Extinf", "Echo", "Plain"],
      ["Dotted", "Echo", "Plain"],
      ["07", "Echo", "Plain"],
      ["1979 Year Title", "Echo", "Plain"],
      ["Real Tone", "Foxtrot", "Tones"],
      ["Broken Tag", "Gamma", "Broken"],
      ["Loose", "Mix", "Solo"],
      ["a", "Unknown Artist", "Unknown Album"],
      ["b track", "Unknown Artist", "Only"],
    ];
    want.forEach((w, i) => t.eq(`song ${i + 1}`, songs[i], w));
    t.eq("nothing dotted or ignored came in", songs.length, 24);

    await back(2);
    await pick("Playlists");
    const lists = await titles();
    t.eq("folder playlists and Road Trip; empty ones dropped", lists, ["Mix", "Road Trip", "Only"]);
    await pick("Road Trip");
    t.eq("Road Trip resolved every way", await titles(), ["Tagged Opening", "Sëcond Ütf8", "After Cover", "End Moov", "Utf Sixteen", "Title From Extinf"]);
    await back();
    await pick("Mix");
    const mix = await titles();
    t.eq("folder playlist in path order", [mix.length, mix[0], mix.at(-1)], [22, "Tagged Opening", "Loose"]);
    await d.shot("import-songs");
    await back(2);
    await pick("Artists");
    t.eq("artists", await titles(), ["All", "Alpha Tag", "Alpha", "Beta Tag", "Delta Tag", "Delta Album Artist", "Delta", "Echo", "Foxtrot", "Gamma", "Mix", "Unknown Artist"]);
    await pick("Alpha Tag");
    await d.key("ArrowDown"); await sleep(30);
    await d.key("ArrowRight"); await sleep(400);
    const n = (await state()).nowPlaying;
    t.eq("now playing shows the tags", [n.title, n.artist, n.album, n.index, n.total], ["Sëcond Ütf8", "Alpha Tag", "First Tag Album", 2, 3]);
    await d.shot("import-np");
  });

  await section("order", async () => {
    await load(IMPORT);
    await importTree(tree("Order"));
    await focusRing();
    await pick("Playlists");
    await pick("Order");
    t.eq("folder list keeps path order, numeric aware", await titles(), ["Shared Artist Song", "Track Three", "Track One", "Track Two", "nine", "ten"]);
    await back(2);
    await pick("Artists");
    await pick("Mike Tag");
    t.eq("artist list uses track numbers", await titles(), ["Track One", "Track Two", "Track Three"]);
    await back(2);

    console.log("# merged library");
    await pick("Settings"); await pick("Import"); await pick("Library");
    t.eq("toggled to All", await value("Library"), "All");
    await back(2);
    await pick("Songs");
    let rows = await titles();
    t.eq("All: catalogue first, then imported", [rows.length, rows[0], rows[47], rows[48]], [54, "Paper Rivers 00 (Extended Fixture Mix For Marquee Testing)", "Distant Letters 47", "Shared Artist Song"]);
    await back();
    await pick("Artists");
    rows = await titles();
    t.eq("shared artist merges, others append", [rows.filter((r) => /alder quay/i.test(r)), rows.at(-1), rows.length], [["Alder Quay"], "Numeric", 15]);
    await pick("Alder Quay");
    rows = await titles();
    t.eq("merged artist holds both", [rows.length, rows.at(-1)], [5, "Shared Artist Song"]);
    await back(2);
    await pick("Playlists");
    t.eq("playlists merge", await titles(), ["Fixture Playlist 0", "Fixture Playlist 1", "Fixture Playlist 2", "Fixture Playlist 3", "Order"]);
    await back();
    await pick("Settings"); await pick("About");
    t.eq("About follows All", (await state()).rows[1].value, "54");
    await back();
    await pick("Import"); await pick("Library");
    await back(1);
    await pick("About");
    t.eq("About follows Imported", (await state()).rows[1].value, "6");
    await back(2);
    await pick("Songs");
    t.eq("Imported hides the catalogue", (await titles()).length, 6);
  });

  await section("pending", async () => {
    await load(IMPORT);
    await importTree(tree("Later"));
    await openImport();
    let v = [await value("Songs"), await value("Skipped"), await value("Library")];
    t.eq("pending: nothing counted, Library unchanged", v, ["0", "0", "All"]);
    await back(2);
    await pick("Playlists");
    t.eq("pending hidden", (await titles()).includes("later"), false);
    await back();
    await page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(walk(join(SAMPLES, "LaterFolder/Kilo"), "Kilo"))})).then(()=>1)`);
    await pick("Settings"); await pick("Import");
    v = [await value("Songs"), await value("Skipped"), await value("Library")];
    t.eq("resolves on the later folder, one entry unmatched", v, ["2", "1", "Imported"]);
    await back(2);
    await pick("Playlists");
    t.eq("playlist appears", await titles(), ["later", "Kilo"]);
    await pick("later");
    t.eq("in entry order", await titles(), ["Hello", "World"]);

    console.log("# no match with music present, then a later folder");
    await load(IMPORT);
    await importTree([{ path: "Other/x/y.flac", b64: "eA==" }]);
    await importTree(tree("Later"));
    await openImport();
    t.eq("all three entries unmatched", await value("Skipped"), "3");
    await back(2);
    await pick("Playlists");
    t.eq("no-match list dropped", await titles(), ["Other"]);
    await back();
    await page.evaluate(`${P}.importFiles(__mk(${JSON.stringify(walk(join(SAMPLES, "LaterFolder/Kilo"), "Kilo"))})).then(()=>1)`);
    await pick("Settings"); await pick("Import");
    t.eq("later folder rescues it", await value("Skipped"), "1");
  });

  await section("twice", async () => {
    await load(IMPORT);
    const items = tree("Order");
    await importTree(items);
    await importTree(items);
    await openImport();
    t.eq("same folder twice adds nothing", [await value("Songs"), await value("Skipped")], ["6", "0"]);
    await back(2);
    await pick("Playlists");
    t.eq("same folder keeps one playlist", await titles(), ["Order"]);
  });

  await section("playback", async () => {
    await load(IMPORT);
    await page.send("Network.enable");
    const urls = [];
    browser.on((m) => { if (m.method === "Network.requestWillBeSent") urls.push(m.params.request.url); });
    await importTree([...tree("Mix").filter((f) => /Tones|First Album/.test(f.path))]);
    await focusRing();
    await pick("Songs");
    t.eq("imported list", (await titles()).length, 5);
    await d.press("play"); await sleep(600);
    let n = (await state()).nowPlaying;
    t.eq("mp3 through an object url", [n.title, n.playing, n.elapsed !== ""], ["Tagged Opening", true, true]);
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(500);
    n = (await state()).nowPlaying;
    t.eq("wav: duration learned from the element", [n.title, n.remaining.startsWith("-0:"), n.playing, n.index], ["Real Tone", true, true, 5]);
    t.ok("remaining near -0:30", /^-0:(30|29)$/.test(n.remaining), n.remaining);
    await d.rotate(47); await sleep(50);
    await d.press("select"); await d.press("select");
    t.eq("wheel and modes work on imported", (await state()).nowPlaying.mode, "scrub");
    await d.press("select");

    console.log("# changing the library keeps the queue");
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await pick("Settings"); await pick("Import"); await pick("Library");
    t.eq("now All", await value("Library"), "All");
    await back(2);
    await pick("Now Playing");
    n = (await state()).nowPlaying;
    t.eq("queue kept playing", [n.title, n.playing, n.total], ["Real Tone", true, 5]);
    const remote = urls.filter((u) => !u.startsWith("blob:") && !u.startsWith("data:") && !u.endsWith("/favicon.ico"));
    t.eq("no network requests for imported music", remote, []);
    t.ok("object urls used", urls.some((u) => u.startsWith("blob:")), urls.length);
    await page.send("Network.disable");
  });

  await section("clear", async () => {
    await load(IMPORT);
    await importTree(tree("Mix").filter((f) => /Tones/.test(f.path)));
    await focusRing();
    await pick("Songs");
    await d.press("play"); await sleep(500);
    const url = await page.evaluate(`${P}.playback.song.previewUrl`);
    t.ok("blob url", url.startsWith("blob:"), url);
    t.eq("object url live", await page.evaluate(`fetch(${JSON.stringify(url)}).then((r)=>r.ok,()=>false)`), true);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    t.eq("root has Now Playing", (await titles()).length, 5);
    await pick("Settings"); await pick("Import");
    t.eq("before clear", [await value("Songs"), await value("Library")], ["1", "Imported"]);
    await pick("Clear Imported");
    await sleep(100);
    const s = await state();
    t.eq("stays on Import, emptied", [s.title, await value("Songs"), await value("Skipped"), await value("Library")], ["Import", "0", "0", "All"]);
    t.eq("object url revoked", await page.evaluate(`fetch(${JSON.stringify(url)}).then((r)=>r.ok,()=>false)`), false);
    await sleep(60);
    t.eq("only the test's own fetch failed", logs.filter((l) => /blob:/.test(l)).length, 1);
    logs.length = 0;
    t.eq("playback stopped", await page.evaluate(`[${P}.playback.queue.length, ${P}.playback.playing, ${P}.playback.current]`), [0, false, null]);
    await back(2);
    t.eq("root loses Now Playing", (await titles()).length, 4);
    await pick("Songs");
    t.eq("catalogue back", (await titles()).length, 48);
    await back();

    console.log("# import again after clearing");
    await page.evaluate(`${P}.importFiles(__mk([{path:"Z/y/x.flac",b64:"eA=="}])).then(()=>1)`);
    await pick("Settings"); await pick("Import");
    t.eq("next import sets Imported again", await value("Library"), "Imported");

    console.log("# mixed queue");
    await load(IMPORT);
    await importTree(tree("Mix").filter((f) => /Tones/.test(f.path)));
    await focusRing();
    await pick("Settings"); await pick("Import"); await pick("Library");
    await back(2);
    await pick("Songs");
    await d.key("ArrowRight"); await sleep(500);
    t.eq("catalogue song in a merged queue", [(await state()).nowPlaying.total, (await state()).nowPlaying.index], [49, 1]);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await pick("Settings"); await pick("Import"); await pick("Clear Imported");
    await sleep(150);
    t.eq("queue holding an imported track empties", await page.evaluate(`${P}.playback.queue.length`), 0);

    console.log("# catalogue queue survives");
    await load(IMPORT);
    await importTree(tree("Mix").filter((f) => /Tones/.test(f.path)));
    await focusRing();
    await pick("Settings"); await pick("Import"); await pick("Library");
    await back(2);
    await pick("Artists"); await pick("Alder Quay");
    await d.key("ArrowRight"); await sleep(500);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await pick("Settings"); await pick("Import"); await pick("Clear Imported");
    await sleep(150);
    t.eq("catalogue-only queue keeps playing", await page.evaluate(`[${P}.playback.queue.length, ${P}.playback.playing]`), [4, true]);
  });

  await section("lifetime", async () => {
    await load(IMPORT);
    await importTree(tree("Order"));
    await openImport();
    const stored = () => page.evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage)))");
    t.ok("nothing about imports in localStorage", !/import|library|blob:/i.test(await stored()), await stored());
    await back();
    await pick("Reset All Settings");
    await d.key("ArrowDown"); await d.key("ArrowRight"); await sleep(280);
    await pick("Import");
    t.eq("Reset leaves imports alone", [await value("Songs"), await value("Library")], ["6", "Imported"]);
    await page.goto(IMPORT);
    await sleep(2150);
    await focusRing();
    await pick("Settings"); await pick("Import");
    t.eq("reload forgets imports", [await value("Songs"), await value("Library")], ["0", "All"]);
  });

  await section("scale", async () => {
    await load(IMPORT);
    await openImport();
    const BEAT = `window.__seen=[];window.__gap=0;let last=performance.now();window.__beat=setInterval(()=>{const n=performance.now();__gap=Math.max(__gap,n-last);last=n;const r=${P}.debugState().rows.find((x)=>x.text==="Songs");if(r&&r.value)__seen.push(Number(r.value.replace(/,/g,"")))},5);0`;
    await page.evaluate(`window.__files=Array.from({length:6000},(_, i)=>{const f=new File(["x"],"t"+i+".flac");Object.defineProperty(f,"webkitRelativePath",{value:"Big/a"+(i%40)+"/b/t"+i+".flac"});return f});0`);
    await sleep(100);
    await page.evaluate(BEAT);
    const started = Date.now();
    await page.evaluate(`${P}.importFiles(__files).then(()=>1)`);
    const took = Date.now() - started;
    const r = await page.evaluate(`(()=>{clearInterval(__beat);const s=__seen;return {gap:__gap,distinct:new Set(s).size,last:s.at(-1),sorted:s.every((v,i)=>!i||v>=s[i-1])}})()`);
    console.log("    6000 files", took, "ms", JSON.stringify(r));
    t.ok("Songs counts up", r.distinct >= 10 && r.sorted, JSON.stringify(r));
    t.ok("stays responsive, longest stall under 200 ms", r.gap < 200, r.gap);
    t.eq("final", await value("Songs"), "6,000");

    console.log("# cap");
    await load(IMPORT);
    const started2 = Date.now();
    await page.evaluate(`window.__files=Array.from({length:20050},(_, i)=>{const f=new File(["x"],"t"+i+".flac");Object.defineProperty(f,"webkitRelativePath",{value:"Huge/a"+(i%200)+"/b/t"+i+".flac"});return f});0`);
    console.log("    built files", Date.now() - started2, "ms");
    await sleep(100);
    await page.evaluate(BEAT);
    const started3 = Date.now();
    await page.evaluate(`${P}.importFiles(__files).then(()=>1)`);
    const r2 = await page.evaluate(`(()=>{clearInterval(__beat);return {gap:__gap}})()`);
    console.log("    20050 files", Date.now() - started3, "ms, longest stall", Math.round(r2.gap), "ms");
    t.ok("cap run longest stall under 200 ms", r2.gap < 200, r2.gap);
    await page.evaluate(`${P}.importFiles(__files).then(()=>1)`);
    await openImport();
    t.eq("stops at 20,000, rest skipped", [await value("Songs"), await value("Skipped")], ["20,000", "50"]);
    await back(2);
    const t0 = Date.now();
    await pick("Songs");
    console.log("    open 20,000 rows", Date.now() - t0, "ms");
    t.eq("list is complete", (await state()).rows.length, 20000);
    await d.rotate(46);
    t.eq("rotation works on it", await d.sel(), 3);
    await d.press("select"); await sleep(320);
    await d.press("menu"); await sleep(320);
    t.eq("back on the same row", await d.sel(), 3);
    t.eq("one pane", await page.evaluate(`${root}.querySelectorAll('.pane').length`), 1);
    t.ok("a fake flac fails like any unplayable track", logs.every((l) => /no supported source/.test(l)), logs.join());
    logs.length = 0;
  });

  await section("picker", async () => {
    await page.send("Page.enable");
    await page.send("DOM.enable");
    await page.send("Page.setInterceptFileChooserDialog", { enabled: true });
    const opened = [];
    browser.on((m) => { if (m.method === "Page.fileChooserOpened") opened.push(m.params); });
    const dir = join(SAMPLES, "LaterFolder/Kilo");
    const chooser = async (want, label) => {
      for (let i = 0; i < 30 && opened.length < want; i++) await sleep(50);
      t.eq(`chooser opened: ${label}`, opened.length, want);
    };

    await load(IMPORT);
    await openImport();
    const before = JSON.stringify(await state());
    await d.press("select"); await sleep(100);
    await chooser(1, "pointer press on Select");
    t.eq("mode allows many", opened[0].mode, "selectMultiple");
    t.eq("cancelling changes nothing", JSON.stringify(await state()), before);

    await d.key("Enter");
    await chooser(2, "Enter on the ring, on key up");
    await d.key("ArrowRight");
    await chooser(3, "Right on the ring, on key up");
    await page.evaluate(`${root}.querySelector('.list').focus({preventScroll:true});0`);
    await d.key("Enter");
    await chooser(4, "Enter on the list, on key down");
    await d.key(" ", "Space");
    await chooser(5, "Space on the list");

    await page.send("DOM.setFileInputFiles", { backendNodeId: opened.at(-1).backendNodeId, files: [dir] });
    for (let i = 0; i < 40 && (await value("Songs")) === "0"; i++) await sleep(50);
    t.eq("real folder through the hidden input", [await value("Songs"), await value("Library")], ["2", "Imported"]);
    const paths = await page.evaluate(`${P}.catalogue.songs.map((s) => [s.name, s.artistName])`);
    t.eq("tags read from real files", paths, [["Hello", "Kilo Tag"], ["World", "Kilo Tag"]]);
    t.eq("input emptied, so the same folder can be chosen again", await page.evaluate(`${root}.querySelector('input[webkitdirectory]').files.length`), 0);

    await d.key("ArrowDown");
    await d.key("Enter");
    await chooser(6, "Add Playlists");
    t.eq("playlist accept filter", await page.evaluate(`${root}.querySelector('input[accept]').accept`), ".m3u,.m3u8");
    await page.send("DOM.setFileInputFiles", { backendNodeId: opened.at(-1).backendNodeId, files: [join(SAMPLES, "Later/later.m3u8")] });
    for (let i = 0; i < 40 && (await value("Skipped")) === "0"; i++) await sleep(50);
    t.eq("playlist from the picker, by suffix, one missing", await value("Skipped"), "1");
    const names = await page.evaluate(`${P}.catalogue.playlists.map((p) => [p.name, p.songIds.length])`);
    t.eq("playlist named after its file", names, [["Kilo", 2], ["later", 2]]);
    await page.send("Page.setInterceptFileChooserDialog", { enabled: false });
  });

  await section("unreadable", async () => {
    await load(IMPORT);
    await page.send("DOM.enable");
    const tmp = resolve("work/gone");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp);
    const file = join(tmp, "vanish.mp3");
    writeFileSync(file, Buffer.alloc(4096, 1));
    await page.evaluate(`window.__probe=document.createElement("input");__probe.type="file";document.body.append(__probe);0`);
    const { result } = await page.send("Runtime.evaluate", { expression: "__probe" });
    await page.send("DOM.setFileInputFiles", { objectId: result.objectId, files: [file] });
    await sleep(100);
    rmSync(tmp, { recursive: true, force: true });
    t.eq("file really gone", existsSync(file), false);
    await page.evaluate(`${P}.importFiles([__probe.files[0], ...__mk([{path:"Ok/x/y.flac",b64:"eA=="}])]).then(()=>1)`);
    await openImport();
    t.eq("a file that cannot be read is Skipped", [await value("Songs"), await value("Skipped")], ["1", "1"]);
  });

  await section("tab", async () => {
    await load(IMPORT);
    await openImport();
    await page.evaluate(`${root}.querySelector('.list').focus({preventScroll:true});0`);
    const tab = () => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }).then(() => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }));
    const focused = () => page.evaluate(`(()=>{let a=document.activeElement;while(a?.shadowRoot?.activeElement)a=a.shadowRoot.activeElement;return a?.getAttribute?.('aria-label')||a?.getAttribute?.('role')||a?.tagName})()`);
    const seen = [];
    for (let i = 0; i < 5; i++) { await tab(); await sleep(30); seen.push(await focused()); }
    t.eq("hidden inputs are not in the tab order", seen, ["Menu", "Back", "Forward", "Play", "Select"]);
  });

  await section("no-catalogue", async () => {
    await load(IMPORT + "&catalogue=/fixtures/nothing.json");
    logs.length = 0;
    await importTree(tree("Order"));
    await focusRing();
    await pick("Songs");
    t.eq("import works with a failed catalogue", (await titles()).length, 6);
    await back();
    await pick("Settings"); await pick("Import"); await pick("Library");
    await back(2);
    await pick("Artists");
    t.eq("All over an empty catalogue", (await titles())[0], "All");
    await back();
    await pick("Settings"); await pick("Import"); await pick("Clear Imported");
    await sleep(80);
    await back(2);
    await pick("Songs");
    t.eq("cleared to No Music", (await state()).rows.map((r) => r.text), ["No Music"]);
    logs.length = 0;
  });

  await section("attribute-late", async () => {
    await load(BASE);
    await page.evaluate(`${P}.setAttribute("import","");0`);
    await sleep(50);
    await d.press("menu");
    await pick("Settings");
    t.eq("attribute added late shows the row", (await titles()).includes("Import"), true);
    await page.evaluate(`${P}.removeAttribute("import");0`);
    await sleep(50);
    t.eq("attribute removed hides it", (await titles()).includes("Import"), false);
    await page.evaluate(`${P}.setAttribute("import","");0`);
    await sleep(50);
    await pick("Import");
    await page.evaluate(`${P}.removeAttribute("import");0`);
    await sleep(50);
    t.eq("removed while on Import: no throw, empty list", [(await state()).title, (await state()).rows], ["Import", []]);
    await back();
    t.eq("Menu leaves", (await state()).title, "Settings");
  });

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
