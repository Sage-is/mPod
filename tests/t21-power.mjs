// Spec 39: off, the battery, the charging screen and restart, against a stubbed battery object.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, boot, driver, sleep, T, waitFor } from "./h.mjs";
import { FAKES, P, product, ROOT, tone } from "./product.mjs";

const { page, close, logs } = await boot();
const a = product(page);
const { d } = a;
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + STUB });
  await fn();
  await page.resetSection();
};
const IMPORT = BASE + "?import";
const COPY_PORT = Number(process.env.COPY_PORT ?? 8437);
const COPY = `http://127.0.0.1:${COPY_PORT}/app/`;
const COPY_DIR = "work/power-copy";

const STUB = `
window.__battery = Object.assign(new EventTarget(), { level: 1, charging: false });
navigator.getBattery = () => Promise.resolve(window.__battery);
window.__setBattery = (level, charging) => {
  const b = window.__battery;
  const levelChanged = b.level !== level;
  const chargingChanged = b.charging !== charging;
  b.level = level;
  b.charging = charging;
  if (levelChanged) b.dispatchEvent(new Event("levelchange"));
  if (chargingChanged) b.dispatchEvent(new Event("chargingchange"));
};`;
const REDUCED = { features: [{ name: "prefers-reduced-motion", value: "reduce" }] };
const view = async () => (await a.state()).view;
const off = () => waitFor(async () => (await view()) === "off", 800);
const playButton = async () => { const r = await d.rect(); return [r.cx, r.cy + 0.447 * r.width]; };
const menuButton = async () => { const r = await d.rect(); return [r.cx, r.cy - 0.447 * r.width]; };
const hold = async ([x, y], ms) => {
  await page.mouse("mouseMoved", x, y);
  await page.mouse("mousePressed", x, y, 1);
  await sleep(ms);
  await page.mouse("mouseReleased", x, y);
  await sleep(40);
};
const bars = (selector = ".titlebar .battery") => page.evaluate(`[...${ROOT}.querySelectorAll('${selector} i')].filter((b)=>getComputedStyle(b).visibility==="visible").length`);
const icon = () => page.evaluate(`${ROOT}.querySelector('.titlebar .battery').hidden`);
const samples = async (selector, count = 10, gap = 240) => {
  const out = [];
  for (let i = 0; i < count; i++) { out.push(await bars(selector)); await sleep(gap); }
  return out;
};
const stepped = (seen) => [1, 2, 3, 4].every((n) => seen.includes(n));
const library = async () => {
  await a.open();
  await a.setTree("A", { Art: { Alb: { "01 One.wav": tone(), "02 Two.wav": tone() } } });
  await a.link("A");
  await a.focusRing();
};
const playFirst = async () => {
  await a.pick("Browse");
  await a.pick("Songs");
  await d.press("select");
  await waitFor(async () => (await a.np())?.playing, 3000);
};
const element = `${P}.playback.current.el`;
const pressed = () => page.evaluate(`(()=>{window.__pressed=[];const press=${P}.press.bind(${P});${P}.press=(n)=>{__pressed.push(n);press(n)};0})()`);
const firstKey = (key, code) => page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code });
const liftKey = (key, code) => page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
const SPACE = [" ", "Space"];
const ESCAPE = ["Escape", "Escape"];

try {
  await section("test-page", async () => {
    await page.goto(BASE);
    await sleep(2150);
    const test = driver(page);
    t.eq("the still, full battery", [await bars(), await icon()], [4, false]);
    await hold(await playButton(), 2200);
    t.eq("no Play hold", (await test.state()).view, "list");
    t.eq("and the press stands", await page.evaluate(`${P}.power`), undefined);
    await page.goto(IMPORT);
    await sleep(2150);
    t.eq("nor with import", [(await test.state()).view, await bars()], ["list", 4]);
    await page.evaluate(`${ROOT}.querySelector('.ring').focus({preventScroll:true});0`);
    await firstKey(...SPACE);
    await sleep(60);
    await liftKey(...SPACE);
    await sleep(60);
    t.eq("Space stays a press", (await test.state()).view, "list");
  });

  await section("hold", async () => {
    await library();
    await playFirst();
    const at = await page.evaluate(`${element}.currentTime`);
    await hold(await playButton(), 1700);
    t.eq("1.7 s is a press: it pauses", [await view(), await page.evaluate(`${P}.playback.paused`)], ["now-playing", true]);
    await d.press("play"); await sleep(250);
    await hold(await playButton(), 2150);
    t.eq("2 s is off", await view(), "off");
    t.eq("the track is paused", await page.evaluate(`${P}.playback.paused`), true);
    t.ok("and keeps its position", (await page.evaluate(`${element}.currentTime`)) >= at);
    t.eq("no track played on", await page.evaluate(`${element}.paused`), true);
    const screen = await page.evaluate(`(()=>{const p=${ROOT}.querySelector('.power');const s=getComputedStyle(p);const r=p.getBoundingClientRect();const c=${ROOT}.querySelector('.screen').getBoundingClientRect();return {hidden:p.hidden,background:s.backgroundColor,opacity:s.opacity,covers:r.width>c.width-20&&r.height>c.height-20,device:getComputedStyle(${ROOT}.querySelector('.device')).visibility,lit:${ROOT}.querySelector('.screen').classList.contains('lit')}})()`);
    t.eq("the screen is the unlit LCD, which 48 puts in place of #111, and the body stays", screen, { hidden: false, background: "rgba(0, 0, 0, 0)", opacity: "1", covers: true, device: "visible", lit: false });
    t.eq("the backlight is off", (await a.state()).backlit, false);
    await d.shot("power-off");
    await sleep(700);
    t.eq("its held release does not wake it", await view(), "off");
  });

  await section("ring", async () => {
    await library();
    await a.pick("Browse");
    await a.pick("Songs");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    await page.evaluate(`${ROOT}.querySelector('.ring').focus({preventScroll:true});0`);
    await firstKey(...SPACE);
    await sleep(400);
    await liftKey(...SPACE);
    await sleep(120);
    t.eq("Space released early acts as a press", [await view(), await page.evaluate(`${P}.playback.paused`)], ["now-playing", true]);
    await firstKey(...SPACE);
    await sleep(1800);
    t.eq("not yet at 1.8 s", await view(), "now-playing");
    await sleep(350);
    t.eq("Space held for 2 s", await view(), "off");
    await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: " ", code: "Space", autoRepeat: true });
    await sleep(60);
    t.eq("auto-repeat does not wake it", await view(), "off");
    await liftKey(...SPACE);
    await sleep(60);
    t.eq("nor does the release", await view(), "off");
    await d.key("Enter");
    await sleep(80);
    t.eq("a new key wakes it", await view(), "now-playing");
    t.eq("and does not act: no scrub", (await a.np()).mode, "progress");

    console.log("# a focused Play/Pause button");
    await page.evaluate(`${ROOT}.querySelector('.btn.play').focus();0`);
    await firstKey("Enter", "Enter");
    await sleep(100);
    await liftKey("Enter", "Enter");
    await sleep(150);
    t.eq("Enter released early is a click", await page.evaluate(`${P}.playback.paused`), false);
    await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", autoRepeat: true }).catch(() => {});
    await liftKey("Enter", "Enter");
    await firstKey("Enter", "Enter");
    await sleep(2150);
    t.eq("Enter held is off", await view(), "off");
    await liftKey("Enter", "Enter");
  });

  await section("auto", async () => {
    await library();
    await page.evaluate(`${P}.power.autoOffMs=350;${P}.activity();0`);
    await sleep(200);
    await d.key("ArrowDown");
    await sleep(200);
    await d.key("ArrowUp");
    await sleep(200);
    t.eq("activity puts it off", await view(), "list");
    t.ok("no activity: auto-off", await waitFor(async () => (await view()) === "off", 800));
    await d.key("ArrowDown");
    await sleep(50);
    t.eq("awake again", await view(), "list");

    console.log("# not with a track playing");
    await playFirst();
    await sleep(600);
    t.eq("playing keeps it on", await view(), "now-playing");
    await d.press("play");
    t.ok("paused, it goes off", await waitFor(async () => (await view()) === "off", 900));
    t.eq("default is 2 minutes", await page.evaluate(`new (${P}.power.constructor)(${P}).autoOffMs`), 120000);

    console.log("# not during Brick");
    await a.reopen();
    await a.focusRing();
    await a.pick("About");
    await d.press("select", 5200);
    await sleep(100);
    t.eq("in Brick", await view(), "brick");
    await page.evaluate(`${P}.power.autoOffMs=250;${P}.power.update();${P}.activity();0`);
    await sleep(600);
    t.eq("Brick stays", await view(), "brick");

    console.log("# not on Name, like the idle jump");
    await a.reopen();
    await a.focusRing();
    await a.pick("Settings");
    await page.evaluate(`${P}.power.autoOffMs=250;${P}.activity();0`);
    await a.pick("Name");
    await sleep(600);
    t.eq("Name stays", await view(), "name");
    t.eq("console clean", logs, []);
  });

  await section("brick", async () => {
    await a.open();
    await a.focusRing();
    await a.pick("About");
    await d.press("select", 5200);
    await sleep(100);
    t.eq("in Brick", await view(), "brick");
    await hold(await playButton(), 2150);
    t.eq("Hold Play during Brick goes off", await view(), "off");
    await d.press("menu");
    await sleep(350);
    const s = await a.state();
    t.eq("it abandoned Brick as Menu does", [s.view, s.title], ["list", "About"]);
    t.eq("the game is gone", await page.evaluate(`${P}.brick`), null);
  });

  await section("wake", async () => {
    await library();
    await playFirst();
    await d.press("menu"); await sleep(280);
    await d.key("ArrowDown");
    const before = await a.state();
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await pressed();
    await d.press("menu");
    await sleep(120);
    const s = await a.state();
    t.eq("Menu only wakes", [s.view, s.title, s.rows.findIndex((r) => r.selected)], ["list", before.title, before.rows.findIndex((r) => r.selected)]);
    t.eq("its click was swallowed", await page.evaluate("window.__pressed"), []);
    t.eq("the track stays paused", await page.evaluate(`${P}.playback.paused`), true);
    t.eq("the backlight follows its setting", (await a.state()).backlit, true);
    await d.press("menu");
    await sleep(280);
    t.eq("the next press acts", await page.evaluate("window.__pressed"), ["menu"]);

    console.log("# each button");
    for (const name of ["play", "select", "back", "forward"]) {
      await page.evaluate(`${P}.power.enter();window.__pressed.length=0;0`);
      await off();
      await d.press(name);
      await sleep(100);
      t.eq(`${name} only wakes`, [await view(), await page.evaluate("window.__pressed.length")], ["list", 0]);
    }

    console.log("# a press that wakes starts no single hold");
    const lit = (await a.state()).backlit;
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await hold(await menuButton(), 1250);
    t.eq("no Menu hold", [(await a.state()).backlit, await view()], [lit, "list"]);
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await hold(await playButton(), 2250);
    t.eq("no Play hold: it stays awake", await view(), "list");
    await page.evaluate(`${ROOT}.querySelector('.ring').focus({preventScroll:true});${P}.power.enter();0`);
    await off();
    await firstKey(...SPACE);
    await sleep(2250);
    t.eq("nor on the ring", await view(), "list");
    await liftKey(...SPACE);
    await sleep(60);
    t.eq("and its release is not a press", await page.evaluate("window.__pressed.length"), 0);

    console.log("# entering off clears a forced backlight");
    await page.evaluate(`${P}.settings.chooseBacklight("off");0`);
    await sleep(60);
    await hold(await menuButton(), 1150);
    t.eq("Menu hold forces it on", (await a.state()).backlit, true);
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    t.eq("off clears forcedOn", await page.evaluate(`[${P}.backlight.forcedOn,${P}.backlight.forcedOff]`), [false, false]);
    await d.press("menu");
    await sleep(80);
    t.eq("so waking follows the setting", (await a.state()).backlit, false);
    await page.evaluate(`${P}.settings.chooseBacklight("always_on");0`);
    await sleep(60);
    await hold(await menuButton(), 1150);
    t.eq("Menu hold forces it off", (await a.state()).backlit, false);
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    t.eq("off clears forcedOff", await page.evaluate(`[${P}.backlight.forcedOn,${P}.backlight.forcedOff]`), [false, false]);
    await d.press("menu");
    await sleep(80);
    t.eq("and it wakes lit", (await a.state()).backlit, true);

    console.log("# the ring");
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    const selection = await d.sel();
    await d.rotate(60);
    await sleep(100);
    t.eq("a turn wakes and does not move the list", [await view(), await d.sel()], ["list", selection]);

    console.log("# a timed backlight");
    await page.evaluate(`${P}.settings.chooseBacklight("off");0`);
    await sleep(60);
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await d.press("menu");
    await sleep(80);
    t.eq("Off stays dark", (await a.state()).backlit, false);
    await page.evaluate(`${P}.settings.chooseBacklight("1sec");${P}.power.enter();0`);
    await off();
    await d.press("menu");
    await sleep(80);
    t.eq("a timer lights it", (await a.state()).backlit, true);
    t.ok("and runs out", await waitFor(async () => !(await a.state()).backlit, 1500));
  });

  await section("media", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__handlers = {};
      const session = { metadata: null, playbackState: "none", setActionHandler: (n, f) => { window.__handlers[n] = f; }, setPositionState() {} };
      Object.defineProperty(navigator, "mediaSession", { configurable: true, value: session });
      window.MediaMetadata = class { constructor(i) { Object.assign(this, i); } };` });
    await library();
    await playFirst();
    await d.press("play"); await sleep(200);
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await page.evaluate("window.__handlers.play({action:'play'});0");
    t.ok("a media action wakes the device", await waitFor(async () => (await view()) !== "off", 500));
    t.ok("and acts", await waitFor(async () => (await a.np())?.playing, 1500));
  });

  await section("battery", async () => {
    await a.open();
    t.eq("level 1 is four bars", [await icon(), await bars()], [false, 4]);
    for (const [level, want] of [[0.76, 4], [0.75, 3], [0.51, 3], [0.5, 2], [0.25, 1], [0.01, 1], [0, 0]]) {
      await page.evaluate(`__setBattery(${level},false);0`);
      await sleep(40);
      t.eq(`level ${level}`, await bars(), want);
    }

    console.log("# charging");
    await page.evaluate("__setBattery(0.3,true);0");
    await sleep(40);
    const seen = await samples(".titlebar .battery");
    t.ok("steps from 1 to 4 and round again", stepped(seen), seen.join());
    await page.evaluate("__setBattery(0.3,false);0");
    await sleep(40);
    t.eq("stops with the charger", await bars(), 2);
    await page.evaluate("__setBattery(1,true);0");
    await sleep(40);
    const full = await samples(".titlebar .battery", 4);
    t.eq("full and charging: four still bars, as a computer reports", [...new Set(full)], [4]);

    console.log("# reduced motion");
    await page.send("Emulation.setEmulatedMedia", REDUCED);
    await page.evaluate("__setBattery(0.3,true);0");
    await sleep(40);
    t.eq("shows the level, still", [...new Set(await samples(".titlebar .battery", 4))], [2]);
    await page.send("Emulation.setEmulatedMedia", { features: [] });

    console.log("# missing or refused");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete navigator.getBattery; delete Navigator.prototype.getBattery;" });
    await a.reopen();
    t.eq("missing: hidden", await icon(), true);
    await page.resetSection();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "navigator.getBattery = () => Promise.reject(new DOMException('no','NotAllowedError'));" });
    await a.reopen();
    t.eq("refused: hidden", await icon(), true);
    t.eq("console clean", logs, []);
  });

  await section("charging", async () => {
    const title = () => page.evaluate(`${ROOT}.querySelector('.power-title').textContent`);
    const shown = () => page.evaluate(`(()=>{const p=${ROOT}.querySelector('.power');const s=getComputedStyle(p);return [s.backgroundColor,getComputedStyle(${ROOT}.querySelector('.power-title')).display]})()`);
    // Spec 48: plain off is the unlit LCD, with nothing drawn on it.
    const SOLID = ["rgba(0, 0, 0, 0)", "none"];
    const big = ".power .battery";

    console.log("# a computer with no battery");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__battery.charging=true;" });
    await a.open();
    t.eq("full and charging from the start: four still bars", await bars(), 4);
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await sleep(60);
    t.eq("stays solid: no Charged, since charging below full was never seen", await shown(), SOLID);
    await d.press("select");
    await sleep(80);
    await page.resetSection();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + STUB });

    await a.open();
    await page.evaluate("__setBattery(0.4,true);0");
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await sleep(60);
    t.eq("while off and charging: the title", await title(), "Charging");
    t.eq("over the screen's own colours", await shown(), ["rgba(0, 0, 0, 0)", "block"]);
    const seen = await samples(big);
    t.ok("a large battery, animated like the icon", stepped(seen), seen.join());
    await d.shot("power-charging");
    const ink = await page.evaluate(`getComputedStyle(${ROOT}.querySelector('${big}')).borderTopColor`);
    t.eq("drawn in ink", ink, await page.evaluate(`getComputedStyle(${ROOT}.querySelector('.screen')).color`));
    await page.evaluate("__setBattery(1,true);0");
    await sleep(60);
    t.eq("at full charge, having been seen below it", await title(), "Charged");
    t.eq("the battery is still", [...new Set(await samples(big, 4))], [4]);
    await d.shot("power-charged");
    await page.evaluate("__setBattery(1,false);0");
    await sleep(60);
    t.eq("charging stops: solid again", await shown(), SOLID);
    await page.evaluate("__setBattery(0.5,true);0");
    await sleep(60);
    t.eq("still off", await view(), "off");
    await d.press("select");
    await sleep(80);
    t.eq("any press wakes it", await view(), "list");
    await page.evaluate("__setBattery(0.5,false);0");
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await page.send("Emulation.setEmulatedMedia", REDUCED);
    await page.evaluate("__setBattery(0.5,true);0");
    await sleep(60);
    t.eq("reduced motion: the level, still", [...new Set(await samples(big, 4))], [2]);
    await page.send("Emulation.setEmulatedMedia", { features: [] });
  });

  await section("restart", async () => {
    const touch = (type, touchPoints) => page.send("Input.dispatchTouchEvent", { type, touchPoints });
    const reloaded = () => page.evaluate("window.__marker === undefined").catch(() => false);

    console.log("# two fingers on the wheel");
    await library();
    await playFirst();
    await d.press("play"); await sleep(200);
    await d.press("menu"); await sleep(280);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    await page.evaluate("window.__marker=1");
    await pressed();
    const r = await d.rect();
    // Spec 50: on the buttons themselves. A touch on the ring is no press.
    const play = { x: r.cx, y: r.cy + 0.447 * r.width, id: 1 };
    const menu = { x: r.cx, y: r.cy - 0.447 * r.width, id: 2 };
    await touch("touchStart", [play]);
    await sleep(100);
    await touch("touchStart", [play, menu]);
    await sleep(2400);
    t.eq("a second press cancels the single hold", await view(), "list");
    await sleep(2300);
    t.eq("no reload at 4.7 s", await reloaded(), false);
    await touch("touchEnd", []);
    await sleep(150);
    t.eq("released early: nothing", [await reloaded(), await page.evaluate("window.__pressed"), await view()], [false, [], "list"]);
    await sleep(600);
    await touch("touchStart", [play]);
    await touch("touchStart", [play, menu]);
    await sleep(5200);
    t.ok("held for 5 s it reloads", await reloaded());
    await touch("touchEnd", []).catch(() => {});
    await sleep(300);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 3000);
    await waitFor(async () => (await a.state().catch(() => null))?.view === "list", 4000);
    t.ok("Resume brings the track back", (await a.titles()).includes("Now Playing"));

    console.log("# Space and Escape on the ring");
    await a.focusRing();
    await page.evaluate("window.__marker=1");
    await pressed();
    await firstKey(...SPACE);
    await sleep(60);
    await firstKey(...ESCAPE);
    await sleep(2300);
    t.eq("neither single hold fires", [await view(), (await a.state()).backlit], ["list", true]);
    await liftKey(...ESCAPE);
    await sleep(50);
    await liftKey(...SPACE);
    await sleep(100);
    t.eq("released early: nothing, and neither click runs", [await reloaded(), await page.evaluate("window.__pressed")], [false, []]);
    await firstKey(...ESCAPE);
    await sleep(60);
    await firstKey(...SPACE);
    await sleep(5200);
    t.ok("the other way round too", await reloaded());
    await liftKey(...ESCAPE); await liftKey(...SPACE);
    await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 3000);
    await waitFor(async () => (await a.state().catch(() => null))?.view === "list", 4000);

    console.log("# a hold that fired stands");
    await a.focusRing();
    await page.evaluate(`window.__marker=1;${P}.settings.chooseBacklight("off");0`);
    await sleep(60);
    await firstKey(...ESCAPE);
    await sleep(1100);
    t.eq("the Menu hold fired", (await a.state()).backlit, true);
    await firstKey(...SPACE);
    await sleep(300);
    await liftKey(...ESCAPE);
    await liftKey(...SPACE);
    await sleep(100);
    t.eq("and it stands", [(await a.state()).backlit, await reloaded()], [true, false]);
    await page.evaluate(`${P}.settings.chooseBacklight("always_on");0`);

    console.log("# while off, with the presses that wake counting");
    await page.evaluate(`${P}.power.enter();0`);
    await off();
    await firstKey(...SPACE);
    await sleep(60);
    t.eq("the first press wakes", await view(), "list");
    await firstKey(...ESCAPE);
    await sleep(5150);
    t.ok("and counts", await reloaded());
    await liftKey(...ESCAPE); await liftKey(...SPACE);
    t.eq("console clean", logs, []);
  });

  await section("worker", async () => {
    rmSync(COPY_DIR, { recursive: true, force: true });
    mkdirSync(COPY_DIR, { recursive: true });
    for (const name of ["index.html", "sw.js", "sw-precache.js", "manifest.webmanifest", "src", "icons", "dev", "fixtures"]) cpSync(name, join(COPY_DIR, name), { recursive: true });
    const server = spawn(process.execPath, [join(COPY_DIR, "dev/serve.mjs"), String(COPY_PORT)], { stdio: "ignore" });
    try {
      await waitFor(() => fetch(COPY).then((r) => r.ok, () => false), 3000);
      await page.send("Storage.clearDataForOrigin", { origin: new URL(COPY).origin, storageTypes: "service_workers,cache_storage,indexeddb" });
      const active = () => waitFor(() => page.evaluate(`navigator.serviceWorker.getRegistration().then((r)=>r?.active?.state==="activated")`), 8000);
      await a.open({ clear: false, url: COPY });
      t.ok("first worker active", await active());
      await a.open({ clear: false, url: COPY });
      t.ok("the page is controlled", await waitFor(() => page.evaluate("!!navigator.serviceWorker.controller"), 3000));
      writeFileSync(join(COPY_DIR, "sw-precache.js"), readFileSync(join(COPY_DIR, "sw-precache.js"), "utf8").replace(/"version": "[0-9a-f]+"/, '"version": "0123456789abcdef"'));
      await page.evaluate("navigator.serviceWorker.getRegistration().then((r)=>r.update()).then(()=>1)");
      t.ok("a new worker waits", await waitFor(() => page.evaluate(`navigator.serviceWorker.getRegistration().then((r)=>r.waiting?.state==="installed")`), 5000));
      await page.evaluate(`window.__marker=1;${P}.power.restart();0`);
      t.ok("restart reloads", await waitFor(() => page.evaluate("window.__marker === undefined").catch(() => false), 2500));
      await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 3000);
      t.ok("and the new worker is in charge", await waitFor(() => page.evaluate(`navigator.serviceWorker.getRegistration().then((r)=>!r.waiting&&r.active?.state==="activated"&&caches.keys()).then((k)=>k&&k.includes("mpod-0123456789abcdef"))`), 4000));
      t.ok("the old cache went", await waitFor(async () => (await page.evaluate("caches.keys()")).length === 1, 4000));

      console.log("# a worker that never answers");
      await page.evaluate(`(()=>{window.__marker=1;window.__posted=[];const w=Object.assign(new EventTarget(),{state:"installed",postMessage:(m)=>window.__posted.push(m)});navigator.serviceWorker.getRegistration=()=>Promise.resolve({waiting:w});window.__began=performance.now();sessionStorage.setItem("began",String(Date.now()));${P}.power.restart();})()`);
      await sleep(200);
      t.eq("the message is skipWaiting", await page.evaluate("window.__posted ?? null"), ["skipWaiting"]);
      t.ok("it waits", await page.evaluate("window.__marker === 1"));
      t.ok("for 5,000 ms at most (43)", await waitFor(() => page.evaluate("window.__marker === undefined").catch(() => false), 5300));
    } finally {
      server.kill();
      rmSync(COPY_DIR, { recursive: true, force: true });
    }
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
