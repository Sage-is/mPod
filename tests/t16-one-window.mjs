// Spec 41: one window at a time. Two pages on one origin, as an installed app and a tab would be.
import { openPage } from "../dev/cdp.mjs";
import { BASE, boot, driver, sleep, T, waitFor } from "./h.mjs";
import { FAKES, P, product, ROOT, tone } from "./product.mjs";

const { browser, page, close, logs } = await boot();
const a = product(page);
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + HOLD_HANDLERS });
  await fn();
  await page.resetSection();
};
const IMPORT = BASE + "?import";
const MUSIC = { Art: { Alb: { "01 One.wav": tone(), "02 Two.wav": tone() } } };
// Keeps each Media Session handler past its removal, as a system may have done already.
const HOLD_HANDLERS = `
window.__held = {};
const session = navigator.mediaSession;
const register = session.setActionHandler.bind(session);
session.setActionHandler = (name, fn) => { if (fn) window.__held[name] = fn; register(name, fn); };`;

// A second window on the same origin, closed again by the section that opens it.
const secondWindow = async () => {
  const other = await openPage(browser, BASE);
  await other.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES });
  return other;
};
const shut = (other) => other.send("Page.close");
const lostText = (p) => p.evaluate(`[...${ROOT}.querySelectorAll('.lost-line')].map((l)=>l.textContent)`);
const held = (p) => p.evaluate("navigator.locks.query().then((q)=>q.held.map((l)=>l.name))");

const playing = async () => {
  await a.open();
  await a.setTree("A", MUSIC);
  await a.link("A");
  await a.focusRing();
  await a.pick("Browse");
  await a.pick("Songs");
  await a.d.press("select");
  t.ok("first window plays", await waitFor(async () => (await a.np())?.playing, 3000));
};

try {
  await section("takeover", async () => {
    await playing();
    t.eq("the lock is held", await held(page), ["mpod"]);
    const before = await a.stored();
    await page.evaluate("window.__gate=new Promise((open)=>{window.__open=open});0");
    await a.setTree("A", { Art: { Alb: { "01 One.wav": MUSIC.Art.Alb["01 One.wav"], "03 New.wav": tone() } } });
    await page.evaluate(`${P}.importer.rescan();0`);

    const other = await secondWindow();
    const b = product(other);
    await b.open({ clear: false });
    t.ok("the first window sees it lost", await waitFor(async () => (await a.state()).view === "lost", 2000));
    t.eq("the newest window wins", (await b.state()).view, "list");
    t.eq("overlay lines", await lostText(page), ["Playing in", "another window"]);
    const look = await page.evaluate(`(()=>{const o=${ROOT}.querySelector('.lost');const s=getComputedStyle(o);const m=getComputedStyle(${ROOT}.querySelector('.menu-layer'));return {hidden:o.hidden,position:s.position,menu:m.visibility}})()`);
    t.eq("over the screen, in the style of the offline overlay", look, { hidden: false, position: "absolute", menu: "hidden" });
    await a.d.shot("one-window-lost");

    t.ok("playback paused", await waitFor(() => page.evaluate(`${P}.playback.paused`), 1000));
    t.eq("audio element paused", await page.evaluate(`${P}.playback.current.el.paused`), true);
    t.eq("Media Session cleared", await page.evaluate("[navigator.mediaSession.metadata, navigator.mediaSession.playbackState]"), [null, "none"]);

    console.log("# not inert");
    const open = await page.evaluate(`(()=>{const b=${ROOT}.querySelector('.btn.menu');return [b.hasAttribute('aria-disabled'),b.hasAttribute('tabindex'),${ROOT}.querySelector('.screen').classList.contains('inert'),${P}.inert]})()`);
    t.eq("the lost window is not inert", open, [false, false, false, false]);
    await page.evaluate("window.__held.play({action:'play'});window.__held.nexttrack({action:'nexttrack'});window.__held.seekto({action:'seekto',seekTime:3});0");
    await sleep(200);
    t.eq("it ignores Media Session actions", await page.evaluate(`[${P}.playback.paused,${P}.playback.position,${P}.playback.time<3||${P}.playback.time>4]`), [true, 1, true]);

    await page.evaluate("window.__open();0");
    await sleep(300);
    t.eq("a rescan in progress stopped", await page.evaluate(`${P}.importer.songs.length`), 2);
    t.eq("and wrote nothing: no addition and no deletion", (await b.tracks()).map((r) => r.path).sort(), ["A/Art/Alb/01 One.wav", "A/Art/Alb/02 Two.wav"]);

    console.log("# no writes");
    await page.evaluate(`${P}.settings.set("clicker","off");0`);
    t.eq("settings are not written", await a.stored(), before);
    const resume = (await b.meta()).resume;
    await page.evaluate(`${P}.resume.save();${P}.importer.noteDuration(${P}.importer.songs[0],123);0`);
    await sleep(120);
    t.eq("resume state is not written", (await b.meta()).resume, resume);
    t.ok("nor is IndexedDB", (await b.tracks()).every((r) => r.duration !== 123));
    t.eq("no auto-off", await page.evaluate(`${P}.power.update();${P}.power.timer`), 0);
    await shut(other);
  });

  await section("press", async () => {
    await playing();
    const other = await secondWindow();
    const b = product(other);
    await b.open({ clear: false });
    await waitFor(async () => (await a.state()).view === "lost", 2000);
    await page.evaluate("window.__marker=1");
    await page.evaluate(`(()=>{const press=${P}.press.bind(${P});${P}.press=(n)=>{sessionStorage.setItem("pressed",n);press(n)};0})()`);
    await a.d.press("select");
    t.ok("a press reloads the page", await waitFor(() => page.evaluate("window.__marker === undefined").catch(() => false), 3000));
    t.eq("that first press runs only the steal", await page.evaluate("sessionStorage.getItem('pressed')"), null);
    await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 3000);
    t.ok("the first window is back", await waitFor(async () => (await a.state().catch(() => null))?.view === "list", 4000));
    t.ok("the second window lost it", await waitFor(async () => (await b.state()).view === "lost", 2000));
    t.ok("from fresh stored data", (await a.state()).rows.some((r) => r.text === "Now Playing"));

    console.log("# a key takes it back too");
    await other.send("Page.bringToFront");
    await other.evaluate("window.__marker=1");
    await other.evaluate(`${ROOT}.querySelector('.ring').focus({preventScroll:true});0`);
    await b.d.key("ArrowDown");
    t.ok("the key reloads that page", await waitFor(() => other.evaluate("window.__marker === undefined").catch(() => false), 3000));
    t.ok("and takes the lock", await waitFor(async () => (await a.state()).view === "lost", 3000));
    await shut(other);

    console.log("# a reload keeps working alone");
    await page.send("Page.bringToFront");
    await a.d.press("select");
    await waitFor(async () => (await a.state().catch(() => null))?.view === "list", 6000);
    await a.reopen();
    await sleep(300);
    t.eq("no window to lose to", (await a.state()).view, "list");
    t.eq("still the lock's holder", await held(page), ["mpod"]);
    await a.reopen();
    await sleep(300);
    t.eq("and again", (await a.state()).view, "list");
    t.eq("console clean", logs, []);
  });

  await section("off", async () => {
    await a.open();
    await page.evaluate(`${P}.power.enter();0`);
    await waitFor(async () => (await a.state()).view === "off", 500);
    const other = await secondWindow();
    const b = product(other);
    await b.open({ clear: false });
    t.ok("a window that is off shows it lost too", await waitFor(async () => (await a.state()).view === "lost", 2000));
    await shut(other);
  });

  await section("test-page", async () => {
    await page.goto(IMPORT);
    await sleep(2150);
    t.eq("no lock taken", await held(page), []);
    const other = await secondWindow();
    await other.goto(IMPORT);
    await sleep(2150);
    t.eq("two test pages run side by side", [(await driver(page).state()).view, (await driver(other).state()).view], ["list", "list"]);
    await shut(other);
  });

  await section("no-locks", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete Navigator.prototype.locks;" });
    await a.open();
    t.eq("without navigator.locks all of this is skipped", [await page.evaluate("'locks' in navigator"), (await a.state()).view], [false, "list"]);
    t.eq("console clean", logs, []);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
