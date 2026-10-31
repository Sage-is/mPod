import { boot, driver, sleep, T } from "./h.mjs";

const { page, browser, close, logs } = await boot();
const d = driver(page);
const t = new T();
const np = async () => (await d.state()).nowPlaying;
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await fn();
  await page.resetSection();
};
let paused = null;
browser.on((m) => { if (m.method === "Fetch.requestPaused" && paused) paused(m.params.requestId); });
const interceptOff = async () => { paused = null; await page.send("Fetch.disable").catch(() => {}); };
async function intercept(fn) {
  paused = fn;
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*catalogue.json" }] });
}
const fulfill = (requestId, code, body) => page.send("Fetch.fulfillRequest", {
  requestId, responseCode: code, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
  body: Buffer.from(body).toString("base64"),
});

try {
  await section("crossfade", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await d.press("forward", 2650);
    const seen = [];
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      const n = await np();
      const k = `${n.index}@${n.elapsed}`;
      if (seen.at(-1) !== k) seen.push(k);
      await sleep(40);
    }
    console.log("    ", seen.join(" "));
    const flip = seen.findIndex((k) => k.startsWith("2@"));
    t.eq("flips to track 2 reading 0:01", seen[flip], "2@0:01");
    t.ok("outgoing shown past 0:28", seen.includes("1@0:28") || seen.includes("1@0:29"));
  });

  await section("repeat-one", async () => {
    await d.fresh();
    await d.rotate(46); await d.press("select"); await sleep(280);
    await d.rotate(32); await d.press("select");
    await d.press("menu"); await sleep(280);
    await d.rotate(-16);
    await d.press("play"); await sleep(300);
    await d.press("forward", 2650);
    const seen = [];
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      const n = await np();
      const k = `${n.index}@${n.elapsed}`;
      if (seen.at(-1) !== k) seen.push(k);
      await sleep(40);
    }
    console.log("    ", seen.join(" "));
    t.ok("0:28/0:29 then 0:01 same index", seen.every((k) => k.startsWith("1@")) && seen.includes("1@0:01"));
  });

  await section("queue-end", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.rotate(720, { steps: 120, stepMs: 10 });
    t.eq("last row", await d.sel(), 47);
    await d.press("select"); await sleep(300);
    t.eq("48 of 48", (await np()).index, 48);
    await d.press("forward", 2650);
    await sleep(5000);
    let s = await d.state();
    t.eq("returns to list on row of last song", [s.view, s.title, await d.sel()], ["list", "Songs", 47]);
    await d.press("menu"); await sleep(280);
    t.eq("root has four rows", (await d.state()).rows.length, 4);

    await d.fresh();
    await d.rotate(16); await d.press("select"); await sleep(280);
    await d.rotate(16); await d.press("select"); await sleep(280); // Alder Quay
    t.eq("artist", (await d.state()).title, "Alder Quay");
    await d.press("select"); await sleep(300);
    await d.press("forward"); await sleep(120); await d.press("forward"); await sleep(120); await d.press("forward"); await sleep(120);
    t.eq("4 of 4", [(await np()).index, (await np()).total], [4, 4]);
    await d.press("forward", 2650);
    await sleep(5000);
    s = await d.state();
    t.eq("artist queue end on row 3", [s.title, await d.sel()], ["Alder Quay", 3]);

    console.log("# queue end from Root's Now Playing row");
    await d.fresh();
    await d.rotate(32); await d.press("select"); await sleep(280);
    await d.rotate(720, { steps: 120, stepMs: 10 });
    await d.press("select"); await sleep(300);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    t.eq("root 5 rows", (await d.state()).rows.length, 5);
    await d.rotate(32); await d.sel();
    t.eq("on Now Playing row", (await d.state()).rows[await d.sel()].text, "Now Playing");
    await d.press("select"); await sleep(280);
    await d.press("forward", 2650);
    await sleep(5000);
    s = await d.state();
    t.eq("queue end from NP row selects row 0", [s.title, s.rows.length, await d.sel()], ["Pod", 4, 0]);
  });

  await section("source", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await d.press("forward"); await sleep(120); await d.press("forward"); await sleep(120);
    await d.press("menu"); await sleep(280);
    await d.press("select"); await sleep(280);
    t.eq("Songs opens on current song", [(await d.state()).title, await d.sel()], ["Songs", 2]);
    await d.press("forward"); await sleep(200);
    t.eq("follows song", await d.sel(), 3);
    await d.rotate(16);
    await d.press("forward"); await sleep(200);
    t.eq("user moved stops follow", await d.sel(), 4);
  });

  await section("idle", async () => {
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await d.press("menu"); await sleep(280);
    await d.rotate(16);
    t.eq("moved to row 3", await d.sel(), 3);
    await sleep(9000);
    t.eq("nothing at 9 s", (await d.state()).view, "list");
    await sleep(1400);
    t.eq("now playing at 10.3 s", (await d.state()).view, "now-playing");
    await d.press("menu"); await sleep(280);
    t.eq("menu returns to moved row", [(await d.state()).title, await d.sel()], ["Pod", 3]);
  });

  await section("backlight", async () => {
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await d.fresh();
    let s = await d.state();
    t.eq("light default off", [s.settings.backlight, s.backlit], ["off", false]);
    await d.shot("light-root");
    await d.rotate(46); await d.press("select"); await sleep(280);
    await d.rotate(46); await d.press("select"); await sleep(280);
    s = await d.state();
    t.eq("backlight screen row of mode", [s.title, await d.sel(), s.rows.map((r) => r.text)], ["Backlight Timer", 0, ["Off", "1 second", "2 seconds", "3 seconds", "5 seconds", "Always On"]]);
    await d.rotate(46); await d.press("select"); await sleep(280);
    s = await d.state();
    t.eq("chose 3sec, pop, lit", [s.settings.backlight, s.title, s.backlit], ["3sec", "Settings", true]);
    await sleep(3400);
    t.eq("dark after 3.4 s", (await d.state()).backlit, false);
    await d.rotate(5);
    t.eq("tiny rotation relights", (await d.state()).backlit, true);
    await sleep(3400);
    t.eq("dark again", (await d.state()).backlit, false);
    await d.press("menu", 1100); await sleep(50);
    t.eq("menu hold from dark lit", (await d.state()).backlit, true);
    t.eq("hold did not pop", (await d.state()).title, "Settings");
    await sleep(3600);
    t.eq("stays lit past 3.5 s", (await d.state()).backlit, true);
    await d.rotate(5);
    await d.press("menu", 1100); await sleep(50);
    t.eq("second hold goes dark", (await d.state()).backlit, false);
    await d.rotate(5); await sleep(50);
    t.eq("relights normal timer", (await d.state()).backlit, true);
    await sleep(3400);
    t.eq("times out again", (await d.state()).backlit, false);
    const stored = await page.evaluate("JSON.parse(localStorage.getItem('pod-player:settings'))");
    t.eq("persisted", [stored.backlight, stored.backlightChosen], ["3sec", true]);
    await d.fresh({ clear: false });
    s = await d.state();
    t.eq("survives reload", s.settings.backlight, "3sec");
    await page.send("Emulation.setEmulatedMedia", { features: [] });
  });

  await section("boot", async () => {
    await d.fresh({ waitBoot: false });
    const s0 = await d.state();
    t.eq("loading right after load", s0.view, "loading");
    await sleep(1000);
    const elapsed = await page.evaluate("performance.now()");
    await sleep(Math.max(0, 1500 - elapsed));
    await d.press("select");
    await sleep(300);
    t.eq("press at 1.5 s dropped", (await d.state()).title, "Pod");
    const live = () => page.evaluate("document.querySelector('pod-player').shadowRoot.querySelector('.live').textContent");
    t.eq("live Loading", await live(), "Loading");
    await sleep(800);
    t.eq("view list after boot", (await d.state()).view, "list");
    t.eq("live Ready", await live(), "Ready");
    await d.press("select"); await sleep(200);
    t.eq("press after 2.1 s works", (await d.state()).title, "Playlists");

    await d.fresh({ waitBoot: false });
    const lit = (await d.state()).backlit;
    await d.press("menu", 1100); await sleep(50);
    t.eq("menu hold during boot toggles", (await d.state()).backlit, !lit);
  });

  await section("errors", async () => {
    await intercept((id) => fulfill(id, 500, "nope"));
    await d.fresh();
    let s = await d.state();
    t.eq("500 still boots", [s.view, s.rows.length], ["list", 4]);
    for (const [row, title] of [[0, "Playlists"], [16, "Artists"], [32, "Songs"]]) {
      if (row) await d.rotate(row);
      await d.press("select"); await sleep(280);
      s = await d.state();
      t.eq(`no music in ${title}`, [s.title, s.rows], [title, [{ text: "No Music", value: null, selected: true, arrow: false }]]);
      await d.press("select"); await sleep(100);
      t.eq("no music select nothing", (await d.state()).title, title);
      await d.press("menu"); await sleep(280);
      if (row) await d.rotate(-row);
    }
    await interceptOff();

    await intercept((id) => fulfill(id, 200, JSON.stringify({ schemaVersion: 2, songs: [], artists: [], playlists: [] })));
    await d.fresh();
    await d.rotate(46); await d.press("select"); await sleep(280);
    await d.press("select"); await sleep(280);
    s = await d.state();
    t.eq("schema 2 about songs 0", s.rows[1].value, "0");
    await interceptOff();
  });

  await section("slow", async () => {
    await intercept(async (id) => { await sleep(3000); await page.send("Fetch.continueRequest", { requestId: id }); });
    await d.fresh({ waitBoot: false });
    await sleep(2700);
    t.eq("slow 3 s: still loading at 2.7", (await d.state()).view, "loading");
    await sleep(600);
    t.eq("slow 3 s: list at 3.3", (await d.state()).view, "list");
    await interceptOff();
  });

  await section("very-slow", async () => {
    await intercept(async (id) => { await sleep(12000); await page.send("Fetch.continueRequest", { requestId: id }); });
    await d.fresh({ waitBoot: false });
    await sleep(9500);
    t.eq("slow 12: loading at 9.5", (await d.state()).view, "loading");
    await sleep(800);
    let s = await d.state();
    t.eq("slow 12: list at 10.3", s.view, "list");
    await d.rotate(32); await d.press("select"); await sleep(280);
    t.eq("no music for now", (await d.state()).rows[0].text, "No Music");
    await sleep(2200);
    s = await d.state();
    t.eq("fills in live", [s.view, s.rows.length], ["list", 48]);
    await interceptOff();
  });

  await section("offline", async () => {
    await page.send("Network.enable");
    await d.fresh();
    await d.rotate(32); await d.press("play"); await sleep(300);
    await d.press("forward"); await sleep(1200);
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(200);
    let s = await d.state();
    t.eq("offline view, np kept, paused", [s.view, s.title, s.nowPlaying.playing], ["offline", "Now Playing", false]);
    await d.shot("offline");
    const at = s.nowPlaying.elapsed;
    await d.press("play"); await sleep(100);
    t.eq("input dropped offline", (await d.state()).nowPlaying.playing, false);
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await sleep(200);
    s = await d.state();
    t.eq("back online, menu as it was, paused", [s.view, s.nowPlaying.playing, s.nowPlaying.elapsed], ["now-playing", false, at]);
    await d.press("play"); await sleep(300);
    t.eq("play resumes", (await d.state()).nowPlaying.playing, true);
  });

  t.eq("console clean", logs.filter((l) => !/catalogue failed|ERR_INTERNET|ERR_FAILED|500|net::/.test(l)), []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
