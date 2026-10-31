import { boot, driver, sleep, T } from "./h.mjs";

const { page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const goSongs = async () => { await d.key("ArrowDown"); await d.key("ArrowDown"); await d.key("ArrowRight"); await sleep(300); };
try {
  console.log("# 02 rotate table");
  for (const [deg, want] of [[14, 0], [16, 1], [32, 2], [44, 2], [46, 3]]) {
    await d.fresh();
    await d.press("select"); // Playlists -> 4 rows? use songs list instead
    await d.press("menu");
    await sleep(300);
    await d.rotate(0.001);
    await sleep(50);
    await d.rotate(32); await d.press("select"); await sleep(300); // Songs
    t.eq(`into Songs for ${deg}`, (await d.state()).title, "Songs");
    await d.rotate(deg);
    t.eq(`rotate ${deg}`, await d.sel(), want);
  }
  await d.fresh();
  await d.rotate(-32);
  t.eq("-32 at top", await d.sel(), 0);
  await d.rotate(14); await sleep(30); await d.rotate(14);
  t.eq("two 14 drags", await d.sel(), 0);

  console.log("# 03 acceleration");
  await d.fresh();
  await d.rotate(32); await d.press("select"); await sleep(300);
  await d.rotate(150, { steps: 60, stepMs: 21 });
  const r150 = await d.sel();
  t.ok("150 in 1.3 s moves about 9-10", r150 >= 9 && r150 <= 10, r150);
  await d.fresh();
  await d.rotate(32); await d.press("select"); await sleep(300);
  await d.rotate(720, { steps: 120, stepMs: 10 });
  t.eq("720 in 1.3 s reaches the end", await d.sel(), 47);
  await d.fresh();
  await d.rotate(32); await d.press("select"); await sleep(300);
  await d.rotate(62, { steps: 20, stepMs: 9 });
  t.eq("62 in .2 s", await d.sel(), 4);

  console.log("# 05 ring keyboard");
  await d.fresh();
  await d.press("menu"); // focus ring with no effect at root
  await d.key("ArrowDown"); await d.key("ArrowDown"); await d.key("ArrowUp");
  t.eq("down down up", await d.sel(), 1);
  await d.key("ArrowRight"); await sleep(280);
  t.eq("right opens Artists", (await d.state()).title, "Artists");
  await d.key("ArrowLeft"); await sleep(280);
  let s = await d.state();
  t.eq("left back, row 1 kept", [s.title, await d.sel()], ["Pod", 1]);
  await d.key(" ", "Space");
  t.eq("space on Artists row nothing", (await d.state()).view, "list");
  await d.key("ArrowDown"); await d.key(" ", "Space"); await sleep(400);
  s = await d.state();
  t.eq("space on Songs row starts song 1", [s.view, s.nowPlaying?.index, s.nowPlaying?.total], ["now-playing", 1, 48]);
  await d.key("ArrowUp"); await d.key("ArrowUp");
  t.eq("up up", (await d.state()).nowPlaying.volume, 60);
  t.eq("setting lags", (await d.state()).settings.volume, 50);
  await d.key("ArrowDown");
  s = await d.state();
  t.eq("down", [s.nowPlaying.volume, s.nowPlaying.mode], [55, "volume"]);
  await d.key("Enter");
  t.eq("enter leaves volume", (await d.state()).nowPlaying.mode, "progress");
  await d.key(" ", "Space"); await sleep(100);
  await d.key("Enter");
  t.eq("enter scrub", (await d.state()).nowPlaying.mode, "scrub");
  await page.evaluate("0");
  const before = (await d.state()).nowPlaying.elapsed;
  await d.key("ArrowRight"); await d.key("ArrowUp"); await d.key("ArrowDown");
  const scrub = (await d.state()).nowPlaying.elapsed;
  console.log("    scrub", before, "->", scrub);
  await sleep(1200);
  t.eq("settings volume after save", (await d.state()).settings.volume, 55);

  console.log("# ArrowDown held 1.5 s in 13 rows");
  await d.fresh();
  await d.press("menu");
  await d.key("ArrowRight"); await sleep(280); // Playlists
  await d.key("ArrowRight"); await sleep(280); // Fixture Playlist 0
  t.eq("playlist title", (await d.state()).title, "Fixture Playlist 0");
  t.eq("12 rows", (await d.state()).rows.length, 12);
  await d.keyDown("ArrowDown"); await sleep(1500); await d.keyUp("ArrowDown");
  t.eq("held reaches last row", await d.sel(), 11);

  console.log("# 06 screen layer");
  await d.fresh();
  await d.key("ArrowDown");
  t.eq("focus on body: keys do nothing", await d.sel(), 0);
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(50);
  const focused = () => page.evaluate(`(()=>{let a=document.activeElement;while(a?.shadowRoot?.activeElement)a=a.shadowRoot.activeElement;return a?.getAttribute?.('role')||a?.className||a?.tagName})()`);
  t.eq("first tab lands on list", await focused(), "listbox");
  await d.key("ArrowDown"); await d.key("ArrowLeft"); await d.key("ArrowRight");
  t.eq("down moves, left right swallowed", [await d.sel(), (await d.state()).title], [1, "Pod"]);
  await d.key("Enter"); await sleep(300);
  t.eq("enter selects", (await d.state()).title, "Artists");
  t.eq("focus stays on list", await focused(), "listbox");
  await d.key("Escape"); await sleep(300);
  t.eq("escape back", (await d.state()).title, "Pod");
  t.eq("focus stays on list 2", await focused(), "listbox");
  const lit0 = (await d.state()).backlit;
  await d.keyDown("Escape"); await sleep(1100); await d.keyUp("Escape"); await sleep(30);
  s = await d.state();
  t.eq("escape held toggles backlight, stays", [s.backlit, s.title], [!lit0, "Pod"]);

  console.log("# mouse press focus");
  await d.fresh();
  await d.press("select"); await sleep(300);
  t.eq("focus on ring after press", await focused(), "ring");

  console.log("# 07 about, settings, reset");
  await d.fresh();
  await d.rotate(46); // Settings row 3
  await d.press("select"); await sleep(280);
  s = await d.state();
  t.eq("settings", s.rows.map((r) => [r.text, r.value, r.arrow]), [["About", null, true], ["Shuffle", "Off", false], ["Repeat", "Off", false], ["Backlight Timer", null, true], ["Clicker", "On", false], ["Reset All Settings", null, true]]);
  await d.press("select"); await sleep(280);
  s = await d.state();
  t.eq("about", s.rows.map((r) => [r.text, r.value, r.arrow]), [["Pod", null, false], ["Songs", "48", false], ["Capacity", "9.2 GB", false], ["Available", "4.5 GB", false], ["Version", "2644.1.0", false]]);
  await d.rotate(150, { steps: 40, stepMs: 8 });
  t.eq("walks to row 4", await d.sel(), 4);
  await d.press("menu"); await sleep(280);
  await d.rotate(16);
  await d.press("select"); await d.press("select");
  t.eq("shuffle toggle wraps", (await d.state()).rows[1].value, "Off");
  await d.press("select");
  await d.rotate(16);
  await d.press("select"); t.eq("repeat one", (await d.state()).rows[2].value, "One");
  await d.press("select"); t.eq("repeat all", (await d.state()).rows[2].value, "All");
  s = await d.state();
  t.eq("settings strings", [s.settings.shuffle, s.settings.repeat], ["songs", "all"]);
  await d.rotate(46); // Reset row 5
  t.eq("reset row selected", await d.sel(), 5);
  await d.press("select"); await sleep(280);
  s = await d.state();
  t.eq("reset screen opens on cancel", [s.title, await d.sel()], ["Reset All Settings", 0]);
  await d.rotate(16);
  await d.press("select"); await sleep(280);
  s = await d.state();
  t.eq("after reset", [s.title, s.rows[1].value, s.rows[2].value, s.rows[4].value, s.settings.backlight, await d.sel()], ["Settings", "Off", "Off", "On", "always_on", 5]);
  await d.press("select"); await sleep(280);
  t.eq("reopen on cancel", await d.sel(), 0);
  await d.press("select"); await sleep(280);
  t.eq("cancel pops", (await d.state()).title, "Settings");

  console.log("# backlight timer screen");
  await d.rotate(-32); await d.sel();
  await d.rotate(-16);
  console.log("    row", await d.sel());
  await d.press("menu"); await sleep(280);

  console.log("# 09 scroll, 10 memory");
  await d.fresh();
  await d.rotate(16); await d.press("select"); await sleep(280);
  s = await d.state();
  t.eq("artists first row All", [s.rows[0].text, s.rows.length, s.rows[0].arrow], ["All", 13, true]);
  await d.rotate(46); await d.rotate(16);
  t.eq("artist row 4", await d.sel(), 4);
  await d.press("select"); await sleep(280);
  t.eq("artist list", (await d.state()).rows.length, 4);
  await d.press("menu"); await sleep(280);
  await d.press("menu"); await sleep(280);
  await d.press("select"); await sleep(280);
  t.eq("back into Artists lands on row 4", await d.sel(), 4);
  await d.rotate(-46); await d.rotate(-16);
  t.eq("row 0", await d.sel(), 0);
  await d.press("select"); await sleep(280);
  t.eq("All Songs title", (await d.state()).title, "All Songs");
  const scrollH = await page.evaluate("document.querySelector('pod-player').shadowRoot.querySelector('.list').scrollHeight");
  t.eq("scroll height 1440", scrollH, 1440);

  t.eq("console clean", logs, []);
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
  console.log(logs);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
