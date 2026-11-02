// Specs 44 and 46: the reviews' rulings on the library and Extras. The Library rules hold on both pages.
import { BASE, boot, sleep, T, waitFor } from "./h.mjs";
import { FAKES, file, P, product, PRODUCT, ROOT, tagged, tone } from "./product.mjs";

const { page, close, logs } = await boot();
const a = product(page);
const { d } = a;
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + WRITES });
  await fn();
  await page.resetSection();
};
const IMPORT = BASE + "?import";
const PAGES = [["product page", PRODUCT], ["test page", IMPORT]];

// Records every write to the database, by store.
const WRITES = `
window.__writes = [];
for (const name of ["put", "delete", "clear"]) {
  const real = IDBObjectStore.prototype[name];
  IDBObjectStore.prototype[name] = function (...args) {
    window.__writes.push(this.name + ":" + (args[0]?.key ?? args[0]?.id ?? name));
    return real.apply(this, args);
  };
}`;
const MUSIC = { Art: { Alb: { "01 One.wav": tone(), "02 Two.wav": tone(), "03 Three.wav": tone() } } };
const OTHER = { Band: { Rec: { "01 Other.wav": tone() } } };
const toSongs = async (url) => { if (url === PRODUCT) await a.pick("Browse"); await a.pick("Songs"); };
const toImport = async () => { await a.focusRing(); await a.pick("Settings"); await a.pick("Import"); };
const stores = (name) => page.evaluate(`new Promise((res,rej)=>{const o=indexedDB.open("mpod");o.onerror=()=>rej(o.error);o.onsuccess=()=>{const db=o.result;const q=db.transaction(${JSON.stringify(name)}).objectStore(${JSON.stringify(name)}).getAll();q.onsuccess=()=>{db.close();res(q.result.map((r)=>{const{handle,...x}=r;return x}))}}})`);
const putMeta = (key, value) => page.evaluate(`new Promise((res)=>{const o=indexedDB.open("mpod");o.onsuccess=()=>{const db=o.result;const tx=db.transaction("meta","readwrite");tx.objectStore("meta").put({key:${JSON.stringify(key)},value:${JSON.stringify(value)}});tx.oncomplete=()=>{db.close();res(1)}}})`);
const gate = (name) => page.evaluate(`window.${name}=new Promise((open)=>{window.__opens=window.__opens??{};window.__opens.${name}=()=>{window.${name}=null;open()}});0`);
const release = (name) => page.evaluate(`window.__opens.${name}();0`);
const songNames = () => page.evaluate(`${P}.importer.songs.map((s)=>s.name)`);
const SLOW = 250;
const manyOld = () => Object.fromEntries(Array.from({ length: SLOW }, (_, i) => [`t${String(i).padStart(3, "0")}.flac`, file({ stamp: 5 })]));
const seedOld = async () => {
  await a.open({ url: IMPORT });
  await a.setTree("A", { Lib: manyOld() });
  await a.link("A");
};
const dueCount = async () => (await a.tracks()).filter((r) => !r.tagVersion).length;
const scanCount = () => page.evaluate(`[${P}.importer.links.scansQueued,${P}.importer.links.scanSeen]`);
const skipped = () => page.evaluate(`${P}.importer.skipped`);
const rescan = async () => { await page.evaluate(`${P}.importer.rescan();0`); await a.idle(); await sleep(60); };
const folderId = async () => (await stores("folders"))[0].id;
const remove = async () => page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(await folderId())})`);
// Stands in for 20,000 tracks, so that the next new file is capped.
const full = (on) => page.evaluate(on ? `Object.defineProperty(${P}.importer.library,"isFull",{configurable:true,get:()=>true});0` : `delete ${P}.importer.library.isFull;0`);

try {
  await section("next-id", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      const before = [...(await stores("folders")).map((f) => f.id), ...(await stores("tracks")).map((r) => r.id), ...(await stores("playlists")).map((l) => l.id)];
      // A kill during a scan leaves ids stored past the counter.
      await putMeta("nextId", 1);
      await a.reopen({ url });
      await a.idle();
      t.ok(`${label}: nextId is at least the highest stored id`, (await page.evaluate(`${P}.importer.library.nextId`)) >= Math.max(...before.map((id) => Number(id.split("-").pop()))), await page.evaluate(`${P}.importer.library.nextId`));
      await a.setTree("B", OTHER);
      await a.link("B");
      const folders = (await stores("folders")).map((f) => f.id);
      t.eq(`${label}: no id is reused`, [folders.length, new Set(folders).size, (await stores("tracks")).length], [2, 2, 4]);
      t.eq(`${label}: both libraries stand`, (await songNames()).length, 4);
    }
    t.eq("console clean", logs, []);
  });

  await section("read-fails", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
        const getAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (...args) {
          if (this.name === "tracks") throw new DOMException("broken", "UnknownError");
          return getAll.apply(this, args);
        };` });
      await a.reopen({ url });
      await sleep(250);
      logs.length = 0;
      await page.evaluate("window.__writes.length=0;0");
      await page.evaluate(`${P}.importFiles([new File(["x"],"a.flac")]).then(()=>1)`);
      await page.evaluate(`${P}.settings.set("clicker","off");0`);
      await sleep(150);
      t.eq(`${label}: nothing is written for the life of the page`, await page.evaluate("window.__writes"), []);
      await toImport();
      t.eq(`${label}: the library is session-only`, (await a.titles()).at(-1), "Lasts until reload");
      t.eq(`${label}: and works`, await a.value("Songs"), "1");
      await page.resetSection();
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + WRITES });
      await a.reopen({ url });
      await sleep(200);
      t.eq(`${label}: the stored library is untouched`, (await a.tracks()).length, 3);
    }
  });

  await section("latch", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      t.eq(`${label}: linked, Imported`, await page.evaluate(`${P}.importer.library.mode`), "imported");
      const [folder] = await stores("folders");
      await page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(folder.id)})`);
      t.eq(`${label}: the last folder gone, All`, await page.evaluate(`${P}.importer.library.mode`), "all");
      await a.setTree("B", OTHER);
      await a.link("B");
      t.eq(`${label}: a later link switches to Imported`, await page.evaluate(`${P}.importer.library.mode`), "imported");
    }
  });

  await section("closed", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      const attempt = (call) => page.evaluate(`(async()=>{try{const p=${call};return await p.then(()=>"resolved",(e)=>"rejected "+e.name)}catch(e){return "threw "+e.name}})()`);
      await page.evaluate(`${P}.importer.store.db.close();0`);
      t.eq(`${label}: a write on a closed connection rejects`, await attempt(`${P}.importer.store.write({put:{meta:[{key:"x",value:1}]}})`), "rejected InvalidStateError");
      t.eq(`${label}: clear too`, await attempt(`${P}.importer.store.clear()`), "rejected InvalidStateError");
      logs.length = 0;
      await page.evaluate(`${P}.importFiles([new File(["x"],"a.flac")]).then(()=>1)`);
      t.eq(`${label}: an import still finishes`, (await songNames()).length, 1);
      t.ok(`${label}: and only warns`, logs.every((l) => l.startsWith("warning")), logs.join());
      logs.length = 0;
    }
  });

  await section("clear-final", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      await a.setTree("B", OTHER);
      await gate("__gate");
      await page.evaluate(`${P}.importer.rescan();${P}.linkFolder(__fake("B"));0`);
      await sleep(80);
      await page.evaluate(`${P}.importer.clear();0`);
      await sleep(80);
      await release("__gate");
      await sleep(250);
      t.eq(`${label}: a link in flight adds nothing after Clear`, [await page.evaluate(`${P}.importer.folders.size`), (await songNames()).length], [0, 0]);
      t.eq(`${label}: and saves nothing`, [(await stores("folders")).length, (await stores("tracks")).length], [0, 0]);
    }

    console.log("# a tag read that fails in flight");
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await page.evaluate(`(()=>{const f=new File(["x"],"bad.flac");f.slice=()=>({arrayBuffer:async()=>{await window.__held;throw new DOMException("gone","NotReadableError")}});window.__held=new Promise((open)=>{window.__letGo=open});${P}.importFiles([f]);0})()`);
      await sleep(80);
      await page.evaluate(`${P}.importer.clear();0`);
      await sleep(50);
      await page.evaluate("window.__letGo();0");
      await sleep(150);
      t.eq(`${label}: it leaves no Skipped mark after Clear`, await page.evaluate(`${P}.importer.skipped`), 0);
    }

    console.log("# a playlist read in flight");
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await page.evaluate(`(()=>{const f=new File(["a.flac\\n"],"list.m3u");const read=f.arrayBuffer.bind(f);f.arrayBuffer=async()=>{await window.__held;return read()};window.__held=new Promise((open)=>{window.__letGo=open});window.__list=f;${P}.importFiles([f]);0})()`);
      await sleep(80);
      await page.evaluate(`${P}.importer.clear();0`);
      await sleep(50);
      await page.evaluate("window.__letGo();0");
      await sleep(200);
      t.eq(`${label}: a playlist read in flight adds nothing after Clear`, [await page.evaluate(`${P}.importer.library.lists.length`), (await stores("playlists")).length], [0, 0]);
    }
  });

  await section("remove-final", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      const [folder] = await stores("folders");
      await page.evaluate(`window.__tree.A.Art.Alb["04 New.wav"]={file:true,b64:${JSON.stringify(tagged({ title: "New" }, 2))}};0`);
      await gate("__sliceGate");
      await page.evaluate(`${P}.importer.rescan();0`);
      await sleep(150);
      await page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(folder.id)});0`);
      await sleep(80);
      await release("__sliceGate");
      await sleep(250);
      t.eq(`${label}: a tag read in flight adds nothing after Remove`, [await songNames(), (await stores("tracks")).length], [[], 0]);

      console.log("# a folder that fails after Remove");
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      const [again] = await stores("folders");
      await gate("__gate");
      await page.evaluate(`window.__gone=["A"];${P}.importer.rescan();0`);
      await sleep(80);
      await page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(again.id)});0`);
      await sleep(80);
      await release("__gate");
      await sleep(200);
      t.eq(`${label}: a failed walk does not save the folder back`, (await stores("folders")).length, 0);
      await page.evaluate("window.__gone=[];0");

      console.log("# a relink waiting on isSameEntry");
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      const [linked] = await stores("folders");
      await page.evaluate(`(()=>{const f=[...${P}.importer.folders.values()][0];const same=f.handle.isSameEntry;f.handle.isSameEntry=async(o)=>{await window.__held;return same(o)};window.__held=new Promise((open)=>{window.__letGo=open});${P}.linkFolder(__fake("A"));0})()`);
      await sleep(60);
      await page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(linked.id)});0`);
      await sleep(60);
      await page.evaluate("window.__letGo();0");
      await sleep(200);
      t.eq(`${label}: a relink does not bring a removed folder back`, [await page.evaluate(`${P}.importer.folders.size`), (await stores("folders")).length], [0, 0]);
      t.eq(`${label}: and leaves the scan count right`, await scanCount(), [0, null]);
    }
  });

  await section("relink", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
      await a.reopen({ url });
      await sleep(150);
      t.eq(`${label}: the folder waits`, await page.evaluate(`${P}.importer.waiting.size`), 1);
      await page.evaluate(`window.__writes.length=0;window.__fresh=__fake("A");window.__permission="granted";0`);
      // The walk is held, so the scan's own last save cannot stand in for this one.
      await gate("__gate");
      await page.evaluate(`window.__linked=${P}.linkFolder(window.__fresh);0`);
      await waitFor(() => page.evaluate("window.__walks > 0"), 500);
      t.ok(`${label}: and saving it`, await waitFor(async () => (await page.evaluate("window.__writes")).some((w) => w.startsWith("folders:")), 400), (await page.evaluate("window.__writes")).join());
      await release("__gate");
      await page.evaluate("window.__linked.then(()=>1)");
      const [folder] = await page.evaluate(`[...${P}.importer.folders.values()].map((f)=>f.handle===window.__fresh)`);
      t.eq(`${label}: one folder, keeping the new handle`, [await page.evaluate(`${P}.importer.folders.size`), folder], [1, true]);
      t.eq(`${label}: it counts as Reconnect`, [await page.evaluate(`${P}.importer.waiting.size`), (await a.titles())[0]], [0, "Playlists"]);
      t.eq(`${label}: the scan count comes back to nothing`, await scanCount(), [0, null]);
      await page.resetSection();
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + WRITES });
    }

    console.log("# a parked track comes back with it");
    await a.open();
    await a.setTree("A", MUSIC);
    await a.link("A");
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Songs");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await d.press("play"); await sleep(200);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await a.reopen();
    await sleep(150);
    t.eq("parked, unopened", await page.evaluate(`${P}.playback.current`), null);
    await page.evaluate(`window.__permission="granted";${P}.linkFolder(__fake("A")).then(()=>1)`);
    t.ok("it opens, paused", await waitFor(() => page.evaluate(`${P}.playback.loaded && ${P}.playback.paused`), 1500));
  });

  await section("waiting-skip", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", { Art: { Alb: { "01 First.wav": tone() } } });
      await a.link("A");
      await a.setTree("B", { Art: { Alb: { "02 Second.wav": tone() } } });
      await a.link("B");
      await a.setTree("C", { Art: { Alb: { "03 Third.wav": tone() } } });
      await a.link("C");
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__strict=true;window.__permissions={A:'granted',B:'prompt',C:'granted'};window.__answer='denied';" });
      await a.reopen({ url });
      await sleep(200);
      t.eq(`${label}: one folder waits`, await page.evaluate(`${P}.importer.waiting.size`), 1);
      await a.focusRing();
      await toSongs(url);
      await d.press("select");
      await waitFor(async () => (await a.np())?.playing, 3000);
      await d.press("forward");
      t.ok(`${label}: a track in a waiting folder is skipped in the queue`, await waitFor(async () => (await a.np())?.title === "Third", 1500), (await a.np())?.title);
      t.eq(`${label}: and not counted under Skipped`, await page.evaluate(`${P}.importer.skipped`), 0);
      await d.press("play");
      await page.resetSection();
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + WRITES });
    }

    console.log("# a refusal the folder had not reported yet");
    await a.open();
    await a.setTree("A", { Art: { Alb: { "01 First.wav": tone(), "02 Second.wav": tone() } } });
    await a.link("A");
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Songs");
    await page.evaluate("window.__strict=true;window.__permission='prompt';0");
    await d.press("select");
    await sleep(500);
    t.eq("it counts as waiting, not as Skipped", [await page.evaluate(`${P}.importer.skipped`), await page.evaluate(`${P}.importer.waiting.size`)], [0, 1]);
  });

  await section("open-clears", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", { Art: { Alb: { "01 One.wav": tone(), "02 Two.wav": tone() } } });
      await a.link("A");
      await page.evaluate(`window.__tree.A.Art.Alb["01 One.wav"].unreadable=true;0`);
      await a.focusRing();
      await toSongs(url);
      await d.press("select");
      await waitFor(async () => (await a.np())?.title === "Two", 2000);
      t.eq(`${label}: a failed open counts`, await page.evaluate(`${P}.importer.skipped`), 1);
      await page.evaluate(`delete window.__tree.A.Art.Alb["01 One.wav"].unreadable;${P}.playback.clear()`);
      await sleep(100);
      await a.focusRing().catch(() => {});
      await page.evaluate(`${P}.nav.playSelection();0`);
      await page.evaluate(`${P}.playback.start(${P}.catalogue.songs.filter((s)=>s.name==="One"),0);0`);
      await waitFor(async () => (await page.evaluate(`${P}.playback.playing`)), 2000);
      t.eq(`${label}: a track that opens clears its own mark`, await page.evaluate(`${P}.importer.skipped`), 0);
      await sleep(80);
      t.eq(`${label}: in the store too`, ((await a.meta()).failed ?? []).length, 0);
      await page.evaluate(`${P}.playback.clear()`);
    }
  });

  await section("reread-progress", async () => {
    await seedOld();
    t.eq("every record is due", await dueCount(), SLOW);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__holdAfter=150;window.__sliceGate=new Promise(()=>{});" });
    await a.reopen();
    t.ok("the reread reaches the hold", await waitFor(() => page.evaluate("window.__reads >= 150"), 4000), await page.evaluate("window.__reads"));
    await sleep(250);
    t.eq("progress is stored every 100 files", SLOW - (await dueCount()), 100);
    console.log("# killed here, and started again");
    await page.resetSection();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + WRITES });
    await a.reopen();
    await a.idle();
    await sleep(150);
    t.eq("a restart carries on where it stopped", await page.evaluate("window.__reads"), SLOW - 100);
    t.eq("and finishes", await dueCount(), 0);
  });

  await section("reread-view", async () => {
    await seedOld();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await a.reopen();
    await sleep(200);
    const before = await page.evaluate(`${P}.importer.library.version`);
    await page.evaluate(`${P}.importer.reconnect()`);
    await a.idle();
    t.eq("a batch of pure rereads leaves the view alone: one update, at the end", (await page.evaluate(`${P}.importer.library.version`)) - before, 1);

    console.log("# new files still show as they arrive");
    await a.open();
    await a.setTree("A", { Lib: {} });
    await a.link("A");
    await page.evaluate(`Object.assign(window.__tree.A.Lib,${JSON.stringify(manyOld())});0`);
    const fresh = await page.evaluate(`${P}.importer.library.version`);
    await page.evaluate(`${P}.importer.rescan()`);
    await a.idle();
    t.ok("a batch of new files does", (await page.evaluate(`${P}.importer.library.version`)) - fresh >= 3);
  });

  await section("reread-error", async () => {
    await a.open({ url: IMPORT });
    await a.setTree("A", { Lib: { "bad.mp3": file({ b64: tagged({ title: "Bad", composer: "Cole" }) }) } });
    await a.link("A");
    await page.evaluate(`window.__tree.A.Lib["bad.mp3"].broken=true;__saveTree();0`);
    await a.reopen();
    await a.idle();
    await sleep(60);
    t.ok("the reread fails", (await page.evaluate("window.__reads")) > 0);
    t.eq("the record stays due", (await a.tracks())[0].tagVersion ?? null, null);
    await a.reopen();
    await a.idle();
    await sleep(60);
    t.ok("the next start tries it again", (await page.evaluate("window.__reads")) > 0);
    await page.evaluate(`delete window.__tree.A.Lib["bad.mp3"].broken;__saveTree();0`);
    await a.reopen();
    await a.idle();
    await sleep(60);
    t.eq("and it comes right", [(await a.tracks())[0].composer, (await a.tracks())[0].tagVersion > 0, await page.evaluate(`${P}.importer.skipped`)], ["Cole", true, 0]);
  });

  await section("extras-files", async () => {
    const card = (name) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nEND:VCARD\r\n`;
    const link = (id) => page.evaluate(`${P}.extras.link("contacts",__fake(${JSON.stringify(id)})).then(()=>1)`);
    const rescan = () => page.evaluate(`${P}.extras.rescan("contacts")`);
    const items = async () => ((await a.meta()).contacts?.items ?? []).map((c) => c.name);
    await a.open();
    await a.setTree("C", { "a.vcf": file({ text: card("Ada") }), "big.vcf": file({ text: card("Big"), pad: 6 * 1024 * 1024 }) });
    await link("C");
    t.eq("a file over the old 5 MB limit reads", await items(), ["Ada", "Big"]);
    logs.length = 0;

    console.log("# a read error keeps the stored data");
    await page.evaluate(`window.__tree.C["b.vcf"]={file:true,unreadable:true};window.__tree.C["c.vcf"]={file:true,text:${JSON.stringify(card("New"))}};__saveTree();0`);
    await rescan();
    t.eq("a file that will not open", await items(), ["Ada", "Big"]);
    await page.evaluate(`window.__tree.C["b.vcf"]={file:true,noRead:true,text:"x"};__saveTree();0`);
    await rescan();
    t.eq("a file that will not read", await items(), ["Ada", "Big"]);
    t.eq("neither counts as skipped", (await a.meta()).contacts.skipped, 0);
    t.eq("each only warned", logs.length, 2);
    logs.length = 0;

    console.log("# what does count");
    await page.evaluate(`window.__tree.C["b.vcf"]={file:true,text:"not a card"};window.__tree.C["huge.vcf"]={file:true,text:"x",fakeSize:${64 * 1024 * 1024 + 1}};window.__tree.C["limit.vcf"]={file:true,text:${JSON.stringify(card("Limit"))},fakeSize:${64 * 1024 * 1024}};__saveTree();0`);
    await page.evaluate(`Object.defineProperty(File.prototype,"__limit",{value:1});0`);
    await rescan();
    t.eq("a file that cannot be parsed, and one too large", (await a.meta()).contacts.skipped, 2);
    t.eq("exactly 64 MB is allowed", await items(), ["Ada", "Big", "Limit", "New"]);

    console.log("# a read that finds no file of this kind");
    await page.evaluate(`for(const k of Object.keys(window.__tree.C))delete window.__tree.C[k];window.__tree.C["notes.txt"]={file:true,text:"x"};__saveTree();0`);
    await rescan();
    t.eq("keeps the stored data", await items(), ["Ada", "Big", "Limit", "New"]);

    console.log("# with nothing stored");
    await a.open();
    await a.setTree("C", { "notes.txt": file({ text: "x" }) });
    await link("C");
    t.eq("a linked folder still records its handle", (await a.meta()).contacts?.testId, "C");
    await a.focusRing();
    await a.pick("Extras");
    await a.pick("Contacts");
    t.eq("so its row is there", await a.titles(), ["No contacts yet", "Contacts Folder"]);
  });

  await section("extras-final", async () => {
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nEND:VCARD\r\n";
    await a.open();
    await a.setTree("C", { "a.vcf": file({ text: card }) });
    await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
    await page.evaluate(`(()=>{window.__held=new Promise((open)=>{window.__letGo=open});const h=${P}.extras.data.contacts.handle;const ask=h.requestPermission;h.requestPermission=async(o)=>{await window.__held;return ask(o)};window.__rescan=${P}.extras.rescan("contacts");0})()`);
    await page.evaluate(`${P}.extras.remove("contacts");0`);
    await page.evaluate("window.__letGo();0");
    await page.evaluate("window.__rescan");
    await sleep(120);
    t.eq("a rescan waiting on permission adds nothing after Remove", [await page.evaluate(`${P}.extras.data.contacts`), (await a.meta()).contacts ?? null], [null, null]);
  });

  await section("contacts", async () => {
    await a.open();
    await a.setTree("C", { "a.vcf": file({ text: ["BEGIN:VCARD", "TEL:555 0100", "END:VCARD", "BEGIN:VCARD", "EMAIL:ada@example.invalid", "END:VCARD", "BEGIN:VCARD", "NOTE:nobody", "END:VCARD"].join("\r\n") }) });
    await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
    await a.focusRing();
    await a.pick("Extras");
    await a.pick("Contacts");
    t.eq("a card with no name shows its first phone, or else its first email", await a.titles(), ["555 0100", "ada@example.invalid", "Contacts Folder"]);
    await a.pick("Contacts Folder");
    t.eq("a card with none of these is skipped", await a.value("Skipped"), "1");
  });

  await section("later-read", async () => {
    const good = tagged({ title: "x".repeat(70000), artist: "Good Artist", album: "Good Album" }, 2);
    const read = async () => { const [r] = await a.tracks(); return [r.artist, r.album, r.taggedTitle]; };
    const kept = ["Good Artist", "Good Album", true];
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", { Lib: { "a.mp3": file({ b64: good, stamp: 1000 }) } });
      await a.link("A");
      t.eq(`${label}: read in full`, await read(), kept);
      await page.evaluate(`Object.assign(window.__tree.A.Lib["a.mp3"],{stamp:2000,failAfter:1});0`);
      await rescan();
      t.eq(`${label}: a read error on a later read leaves the good tags`, await read(), kept);
      t.eq(`${label}: and the record due, counted`, [(await a.tracks())[0].modified, await skipped()], [1000, 1]);
      await page.evaluate(`delete window.__tree.A.Lib["a.mp3"].failAfter;0`);
      await rescan();
      t.eq(`${label}: the next scan comes right`, [(await a.tracks())[0].modified, await skipped()], [2000, 0]);
    }

    console.log("# a reread that fails late");
    await a.open({ url: IMPORT });
    await a.setTree("A", { Lib: { "a.mp3": file({ b64: good }) } });
    await a.link("A");
    await page.evaluate(`window.__tree.A.Lib["a.mp3"].failAfter=1;__saveTree();0`);
    await a.reopen();
    await a.idle();
    await sleep(60);
    t.eq("the record stays due, with its tags", [(await a.tracks())[0].tagVersion ?? null, await read()], [null, kept]);
  });

  await section("link-asked", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      const id = await folderId();
      await gate("__gate");
      await page.evaluate(`${P}.importer.rescan();0`);
      await sleep(60);
      await page.evaluate(`${P}.linkFolder(__fake("A"));0`);
      await sleep(60);
      await page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(id)});0`);
      await sleep(60);
      await release("__gate");
      await a.idle();
      await sleep(80);
      t.eq(`${label}: a link tied to a folder Remove has taken ends`, [await page.evaluate(`${P}.importer.folders.size`), (await stores("folders")).length, await songNames()], [0, 0, []]);
      t.eq(`${label}: and leaves the scan count right`, await scanCount(), [0, null]);

      console.log("# a rejected isSameEntry");
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      await a.setTree("B", OTHER);
      await page.evaluate(`[...${P}.importer.folders.values()][0].handle.isSameEntry=async()=>{throw new DOMException("gone","NotFoundError")};0`);
      logs.length = 0;
      await a.link("B");
      t.eq(`${label}: it counts as no match`, [await page.evaluate(`${P}.importer.folders.size`), (await songNames()).length], [2, 4]);
      t.eq(`${label}: with the scan count right`, await scanCount(), [0, null]);
      t.eq(`${label}: and nothing logged`, logs, []);

      console.log("# the same folder linked twice");
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await page.evaluate(`Promise.all([${P}.linkFolder(__fake("A")),${P}.linkFolder(__fake("A"))]).then(()=>1)`);
      t.eq(`${label}: one folder`, [await page.evaluate(`${P}.importer.folders.size`), await scanCount()], [1, [0, null]]);
    }
  });

  await section("clear-store", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", MUSIC);
      await a.link("A");
      await a.focusRing();
      await toSongs(url);
      await d.press("select");
      await waitFor(async () => (await a.np())?.playing, 3000);
      await d.press("play"); await sleep(200);
      await gate("__openGate");
      await d.press("forward"); await sleep(120);
      await d.press("forward"); await sleep(120);
      await d.press("play"); await sleep(120);
      await page.evaluate(`${P}.importer.clear();0`);
      t.ok(`${label}: Clear reaches the store at once, with a resume holding playback`, await waitFor(async () => (await stores("tracks")).length === 0, 500), (await stores("tracks")).length);
      await release("__openGate");
      await sleep(200);
    }
  });

  await section("gone-track", async () => {
    for (const [label, url] of PAGES) {
      for (const how of ["Remove", "Clear"]) {
        await a.open({ url });
        await a.setTree("A", MUSIC);
        await a.link("A");
        await page.evaluate(`window.__song=${P}.importer.songs[0];0`);
        if (how === "Remove") await remove();
        else await page.evaluate(`${P}.importer.clear()`);
        await page.evaluate(`${P}.importer.noteDuration(window.__song,123);${P}.importer.openFailed(window.__song);${P}.importer.opened(window.__song);0`);
        await page.evaluate(`${P}.importer.openFailed(window.__song);0`);
        await sleep(120);
        t.eq(`${label}, ${how}: a late duration is dropped`, (await stores("tracks")).length, 0);
        t.eq(`${label}, ${how}: a late failure leaves no mark`, [await skipped(), ((await a.meta()).failed ?? []).length], [0, 0]);
      }
    }

    console.log("# a stored place, with a resume holding the queue past Remove");
    await a.open();
    await a.setTree("A", MUSIC);
    await a.link("A");
    await a.focusRing();
    await toSongs(PRODUCT);
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await d.press("play"); await sleep(200);
    await gate("__openGate");
    await d.press("forward"); await sleep(120);
    await d.press("forward"); await sleep(120);
    await d.press("play"); await sleep(120);
    const id = await folderId();
    await page.evaluate(`${P}.importer.removeFolder(${JSON.stringify(id)});0`);
    await sleep(120);
    await page.evaluate(`window.__writes.length=0;${P}.resume.save();0`);
    await sleep(120);
    t.eq("it writes no place for a track that has left", (await page.evaluate("window.__writes")).filter((w) => w.startsWith("meta:resume")), []);
    await release("__openGate");
    await sleep(150);
  });

  await section("remove-write", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", { ...MUSIC, "mix.m3u": file({ text: "Art/Alb/01 One.wav\n" }) });
      await a.link("A");
      t.eq(`${label}: a folder with tracks and lists`, [(await stores("tracks")).length, (await stores("playlists")).length], [3, 2]);
      await page.evaluate(`(()=>{window.__calls=[];const s=${P}.importer.store;const w=s.write.bind(s);s.write=(x)=>{const stores=Object.keys(x.remove??{}).sort();if(stores.length)window.__calls.push(stores);return w(x)};0})()`);
      await remove();
      t.eq(`${label}: Remove deletes them in one write`, await page.evaluate("window.__calls"), [["folders", "playlists", "tracks"]]);
      t.eq(`${label}: all of them`, [(await stores("folders")).length, (await stores("tracks")).length, (await stores("playlists")).length], [0, 0, 0]);
    }
  });

  await section("walk-stops", async () => {
    const tree = { D1: { D2: { D3: { "a.wav": tone(), "b.wav": tone() }, "c.wav": tone() }, "d.wav": tone() }, "e.wav": tone() };
    // Lets the walk go one level down, and holds it there.
    const step = () => page.evaluate(`(()=>{const go=window.__opens.__gate;go();window.__gate=new Promise((open)=>{window.__opens.__gate=()=>{window.__gate=null;open()}});0})()`);
    for (const [label, url] of PAGES) {
      for (const how of ["Clear", "Remove"]) {
        await a.open({ url });
        await a.setTree("A", {});
        await a.link("A");
        await page.evaluate(`Object.assign(window.__tree.A,${JSON.stringify(tree)});0`);
        await gate("__gate");
        await page.evaluate(`${P}.importer.rescan();0`);
        await sleep(40);
        for (let depth = 0; depth < 3; depth++) { await step(); await sleep(30); }
        t.eq(`${label}, ${how}: held three levels down`, await page.evaluate("window.__walks"), 5);
        const id = await folderId();
        await page.evaluate(how === "Clear" ? `${P}.importer.clear();0` : `${P}.importer.removeFolder(${JSON.stringify(id)});0`);
        await sleep(60);
        await page.evaluate(`(()=>{const l=${P}.importer.links;let v=l.scanSeen;window.__seen=[];Object.defineProperty(l,"scanSeen",{configurable:true,get:()=>v,set:(x)=>{v=x;window.__seen.push(x)}});0})()`);
        await release("__gate");
        await sleep(200);
        t.eq(`${label}, ${how}: a walk that has been stopped counts nothing more, at any depth`, (await page.evaluate("window.__seen")).filter((n) => n !== null), []);
        t.eq(`${label}, ${how}: and the row shows no count`, await scanCount(), [0, null]);
      }
    }
  });

  await section("changed-batch", async () => {
    for (const [label, url] of PAGES) {
      await a.open({ url });
      await a.setTree("A", { Lib: manyOld() });
      await a.link("A");
      await page.evaluate(`for(const v of Object.values(window.__tree.A.Lib))v.stamp=9;0`);
      const before = await page.evaluate(`${P}.importer.library.version`);
      await rescan();
      t.ok(`${label}: a batch of changed files shows as it goes`, (await page.evaluate(`${P}.importer.library.version`)) - before >= 3, (await page.evaluate(`${P}.importer.library.version`)) - before);
      t.eq(`${label}: and each is stored as it is now`, (await a.tracks()).every((r) => r.modified === 9), true);
    }
  });

  await section("marks-remove", async () => {
    // The product page replaces marks at the end of the scan. The test page keeps bad.flac's old one.
    for (const [label, url, marks, left] of [["product page", PRODUCT, 3, 0], ["test page", IMPORT, 4, 4]]) {
      await a.open({ url });
      await a.setTree("A", { Lib: { "ok.wav": tone(), "gone.flac": file({ unreadable: true }), "bad.flac": file({ broken: true }) } });
      await a.link("A");
      t.eq(`${label}: two files could not be read`, await skipped(), 2);
      await page.evaluate(`window.__tree.A.Lib["new.flac"]={file:true,size:20};0`);
      await full(true);
      await rescan();
      await full(false);
      t.eq(`${label}: with the rest capped`, await skipped(), marks);
      await page.evaluate(`${P}.importer.openFailed(${P}.importer.songs[0]);0`);
      await remove();
      await sleep(60);
      t.eq(`${label}: Remove takes what spec 46 says`, await skipped(), left);
      if (!left) t.eq(`${label}: from the store too`, [((await a.meta()).failed ?? []).length, ((await a.meta()).capped ?? []).length], [0, 0]);
    }
  });

  await section("marks-scan", async () => {
    const lib = (name) => `window.__tree.A.Lib[${JSON.stringify(name)}]`;
    await a.open();
    await a.setTree("A", { Lib: { "ok.wav": tone() } });
    await a.link("A");

    console.log("# capped");
    await page.evaluate(`${lib("new.wav")}=${JSON.stringify(tone())};0`);
    await full(true);
    await rescan();
    await full(false);
    t.eq("capped", await skipped(), 1);
    await rescan();
    t.eq("a scan that finishes replaces it with what it found", [await skipped(), (await songNames()).length], [0, 2]);

    console.log("# a mark from an older version of a file");
    await page.evaluate(`${lib("bad.flac")}={file:true,size:20,stamp:1,broken:true};0`);
    await rescan();
    t.eq("it could not be read", await skipped(), 1);
    await page.evaluate(`Object.assign(${lib("bad.flac")},{stamp:2,broken:false});0`);
    await rescan();
    t.eq("the new version reads, and the old mark goes", await skipped(), 0);

    console.log("# a file that has gone");
    await page.evaluate(`${lib("gone.flac")}={file:true,size:20,unreadable:true};0`);
    await rescan();
    t.eq("it would not open", await skipped(), 1);
    await page.evaluate(`delete ${lib("gone.flac")};0`);
    await rescan();
    t.eq("its mark goes with it", await skipped(), 0);

    console.log("# a failed open the scan can answer");
    await page.evaluate(`${P}.importer.openFailed(${P}.importer.songs[0]);0`);
    t.eq("counted", await skipped(), 1);
    await rescan();
    t.eq("the scan finds the file, so the mark goes", await skipped(), 0);

    console.log("# a file that will not decode");
    await page.evaluate(`Object.assign(${lib("ok.wav")},{junk:true,audio:false});__saveTree();0`);
    await page.evaluate(`${P}.playback.start(${P}.importer.songs.filter((s)=>s.path.endsWith("ok.wav")),0);0`);
    t.ok("it counts", await waitFor(async () => (await skipped()) === 1, 1500));
    await rescan();
    t.eq("a scan cannot see that, so the mark lasts while the file does", await skipped(), 1);
    await a.reopen();
    await a.idle();
    await sleep(60);
    t.eq("across a restart too", await skipped(), 1);
    await page.evaluate(`Object.assign(${lib("ok.wav")},{junk:false,audio:true,stamp:3});0`);
    await rescan();
    t.eq("a changed file loses it", await page.evaluate(`[...${P}.importer.library.failed,...${P}.importer.library.capped]`), []);

    console.log("# the test page stays as it was");
    await a.open({ url: IMPORT });
    await a.setTree("A", { Lib: { "ok.wav": tone() } });
    await a.link("A");
    await page.evaluate(`${lib("new.wav")}=${JSON.stringify(tone())};0`);
    await full(true);
    await rescan();
    await full(false);
    await rescan();
    t.eq("a capped mark stays there", await skipped(), 1);
  });

  await section("marks-stop", async () => {
    await a.open();
    await a.setTree("A", { Lib: { "a.flac": file({ size: 20, unreadable: true }), "b.flac": file({ size: 20 }) } });
    await a.link("A");
    t.eq("marked", await skipped(), 1);
    await page.evaluate(`delete window.__tree.A.Lib["a.flac"].unreadable;0`);
    await gate("__sliceGate");
    await page.evaluate(`${P}.importer.rescan();0`);
    await sleep(150);
    await page.evaluate(`${P}.importer.stopScans();0`);
    await release("__sliceGate");
    await sleep(200);
    t.eq("a scan that stops early changes none", await skipped(), 1);
  });

  await section("marks-import", async () => {
    const again = `${P}.importFiles([new File(["x"],"a.flac",{lastModified:5})]).then(()=>1)`;
    await a.open();
    await full(true);
    await page.evaluate(again);
    await full(false);
    t.eq("capped", await skipped(), 1);
    await page.evaluate(again);
    t.eq("a file imported again clears its own marks", [await skipped(), (await songNames()).length], [0, 1]);
    for (const [label, url, left] of [["product page", PRODUCT, 0], ["test page", IMPORT, 1]]) {
      await a.open({ url });
      await page.evaluate(again);
      await a.reopen({ url });
      await a.idle();
      await page.evaluate(`${P}.playback.start(${P}.importer.songs,0);0`);
      t.ok(`${label}: a stored track with no file fails to open`, await waitFor(async () => (await skipped()) === 1, 1500));
      await sleep(100);
      await page.evaluate(again);
      t.eq(`${label}: imported again`, await skipped(), left);
    }
  });

  await section("marks-open", async () => {
    for (const [label, url, left] of [["product page", PRODUCT, 0], ["test page", IMPORT, 1]]) {
      await a.open({ url });
      await a.setTree("A", { Lib: { "a.wav": tone() } });
      await a.link("A");
      await page.evaluate(`Object.assign(window.__tree.A.Lib["a.wav"],{stamp:7,broken:true});0`);
      await rescan();
      t.eq(`${label}: a failed read leaves a mark on a track that still plays`, await skipped(), 1);
      await page.evaluate(`${P}.playback.start(${P}.importer.songs,0);0`);
      await waitFor(() => page.evaluate(`${P}.playback.playing`), 2000);
      await sleep(100);
      t.eq(`${label}: a track that opens`, await skipped(), left);
      await page.evaluate(`${P}.playback.clear()`);
    }
  });

  await section("extras-skipped", async () => {
    const card = (name) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nEND:VCARD\r\n`;
    const items = async () => ((await a.meta()).contacts?.items ?? []).map((c) => c.name);
    await a.open();
    await a.setTree("C", { "a.vcf": file({ text: card("Ada") }) });
    await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
    await page.evaluate(`for(const k of Object.keys(window.__tree.C))delete window.__tree.C[k];window.__tree.C["b.vcf"]={file:true,text:"not a card"};window.__tree.C["c.vcf"]={file:true,text:"x",fakeSize:${64 * 1024 * 1024 + 1}};0`);
    await page.evaluate(`${P}.extras.rescan("contacts")`);
    t.eq("a read in which every file was skipped keeps the stored data", await items(), ["Ada"]);
    t.eq("and stores the new Skipped count", (await a.meta()).contacts.skipped, 2);
    t.eq("in memory too", await page.evaluate(`[${P}.extras.data.contacts.items.length,${P}.extras.data.contacts.skipped]`), [1, 2]);
    await page.evaluate(`window.__tree.C["d.vcf"]={file:true,text:${JSON.stringify(card("Bea"))}};0`);
    await page.evaluate(`${P}.extras.rescan("contacts")`);
    t.eq("one good file replaces it", [await items(), (await a.meta()).contacts.skipped], [["Bea"], 2]);

    console.log("# with nothing stored");
    await a.open();
    await a.setTree("C", { "b.vcf": file({ text: "not a card" }) });
    await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
    t.eq("it records the folder as 44 says", [(await a.meta()).contacts?.testId, (await a.meta()).contacts?.skipped, await items()], ["C", 1, []]);

    console.log("# through the file input");
    await page.evaluate(`${P}.extras.fromFiles("contacts",[new File([${JSON.stringify(card("Cy"))}],"a.vcf")])`);
    await page.evaluate(`${P}.extras.fromFiles("contacts",[new File(["not a card"],"b.vcf")])`);
    t.eq("the same", [await items(), (await a.meta()).contacts.skipped], [["Cy"], 1]);
  });

  await section("extras-generation", async () => {
    const card = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nEND:VCARD\r\n";
    const cal = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Next\r\nDTSTART:20991231T100000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    await a.open();
    await a.setTree("C", { "a.vcf": file({ text: card }) });
    await a.setTree("E", { "a.ics": file({ text: cal }) });
    await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
    await gate("__openGate");
    await page.evaluate(`window.__read=${P}.extras.link("calendar",__fake("E"));0`);
    await sleep(60);
    await page.evaluate(`${P}.extras.remove("contacts");0`);
    await release("__openGate");
    await page.evaluate("window.__read.then(()=>1)");
    t.eq("removing one kind does not end a read of the other", ((await a.meta()).calendar?.items ?? []).map((e) => e.title), ["Next"]);
  });

  await section("extras-bom", async () => {
    const mark = Buffer.from([0xef, 0xbb, 0xbf]);
    const card = (name, encoding) => Buffer.from(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nEND:VCARD\r\n`, encoding);
    const joined = (encoding) => file({ b64: Buffer.concat([mark, card("Zoé", encoding), mark, card("Ada", encoding)]).toString("base64") });
    for (const [label, encoding] of [["UTF-8", "utf8"], ["Windows-1252", "latin1"]]) {
      await a.open();
      await a.setTree("C", { "a.vcf": joined(encoding) });
      await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
      const { contacts } = await a.meta();
      t.eq(`${label}: joined files lose no card`, [contacts.items.map((c) => c.name).sort(), contacts.skipped], [["Ada", "Zoé"], 0]);
    }
  });

  await section("calendar-zone", async () => {
    // Today, on this page only, is the week of Toronto's clock change on 8 March 2026.
    await page.send("Emulation.setTimezoneOverride", { timezoneId: "America/Toronto" });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{const Real=Date;const by=new Real(2026,2,5,12).getTime()-Real.now();window.Date=class extends Real{constructor(...a){if(a.length)super(...a);else super(Real.now()+by)}static now(){return Real.now()+by}}})();` });
    const event = (...body) => ["BEGIN:VEVENT", ...body, "END:VEVENT"].join("\r\n");
    await a.open();
    await a.setTree("E", { "a.ics": file({ text: ["BEGIN:VCALENDAR",
      event("SUMMARY:Trip", "DTSTART;VALUE=DATE:20260301", "DTEND;VALUE=DATE:20260304", "RRULE:FREQ=WEEKLY;COUNT=2"),
      event("SUMMARY:Day", "DTSTART;VALUE=DATE:20260301", "DTEND;VALUE=DATE:20260302", "RRULE:FREQ=WEEKLY;COUNT=2"),
      "END:VCALENDAR"].join("\r\n") }) });
    await page.evaluate(`${P}.extras.link("calendar",__fake("E")).then(()=>1)`);
    await a.focusRing();
    await a.pick("Extras");
    await a.pick("Calendar");
    await a.pick("Trip");
    t.eq("across the clock change, an all-day event keeps its last day", (await a.titles())[2], "All Day – Mar 10");
    await a.back();
    await a.pick("Day");
    t.eq("and one day stays one day", (await a.titles())[2], "All Day");
    await page.send("Emulation.setTimezoneOverride", { timezoneId: "" });
  });

  await section("calendar", async () => {
    const pad = (n) => String(n).padStart(2, "0");
    const ahead = (days) => { const w = new Date(); w.setDate(w.getDate() + days); return w; };
    const ymd = (days) => { const w = ahead(days); return `${w.getFullYear()}${pad(w.getMonth() + 1)}${pad(w.getDate())}`; };
    const event = (...body) => ["BEGIN:VEVENT", ...body, "END:VEVENT"].join("\r\n");
    const calendar = (...events) => ["BEGIN:VCALENDAR", ...events, "END:VCALENDAR"].join("\r\n");
    const past = Array.from({ length: 2100 }, (_, i) => event(`SUMMARY:Old ${i}`, `DTSTART:${ymd(-40)}T100000`, `DTEND:${ymd(-40)}T110000`));
    const ran = Array.from({ length: 2100 }, (_, i) => event(`SUMMARY:Ran ${i}`, `DTSTART:${ymd(-40)}T100000`, "RRULE:FREQ=DAILY;COUNT=3"));
    const short = (days) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(ahead(days));
    await a.open();
    await a.setTree("E", {
      "old.ics": file({ text: calendar(...past, ...ran) }),
      "main.ics": file({ text: calendar(
        event("UID:weekly", "SUMMARY:Weekly", `DTSTART:${ymd(1)}T100000`, "RRULE:FREQ=DAILY;INTERVAL=7;COUNT=3"),
        event("SUMMARY:Called off", "STATUS:CANCELLED", `DTSTART:${ymd(2)}T100000`),
        event("SUMMARY:Odd rule", `DTSTART:${ymd(3)}T100000`, "RRULE:FREQ=HOURLY"),
        event("SUMMARY:Overnight", `DTSTART:${ymd(4)}T220000`, "DURATION:PT5H"),
        event("SUMMARY:Trip", `DTSTART;VALUE=DATE:${ymd(5)}`, `DTEND;VALUE=DATE:${ymd(8)}`),
      ) }),
      "later.ics": file({ text: calendar(event("UID:weekly", "SUMMARY:Moved", `RECURRENCE-ID:${ymd(8)}T100000`, `DTSTART:${ymd(9)}T120000`)) }),
    });
    await page.evaluate(`${P}.extras.link("calendar",__fake("E")).then(()=>1)`);
    await a.focusRing();
    await a.pick("Extras");
    await a.pick("Calendar");
    t.eq("ended events leave before the 2,000 limit, and a change in another file applies", await a.titles(), ["Weekly", "Odd rule", "Overnight", "Trip", "Moved", "Weekly", "Calendar Folder"]);
    await a.pick("Calendar Folder");
    t.eq("only the rule we cannot follow counts as skipped", await a.value("Skipped"), "1");
    await d.press("menu"); await sleep(280);
    await a.pick("Overnight");
    const row = (await a.titles())[2];
    t.ok("a range ending on another day shows the short date of its end", row.includes(short(5)), row);
    await a.back();
    await a.pick("Trip");
    t.eq("an all-day event over several days too", (await a.titles())[2], `All Day – ${short(7)}`);
    t.eq("console clean", logs, []);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
