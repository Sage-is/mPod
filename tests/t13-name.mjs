// Spec 33: the device name.
import { BASE, boot, CLEAR_STORED, driver, sleep, T, waitFor } from "./h.mjs";

const { page, close, logs } = await boot();
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
const PRODUCT = BASE + "index.html";

const load = async (url = IMPORT) => {
  await page.evaluate(CLEAR_STORED).catch(() => {});
  await page.send("Page.bringToFront");
  await page.send("Page.navigate", { url });
  await sleep(100);
  await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 5000);
  await waitFor(async () => (await d.state()).view === "list", 4000);
};
const state = () => d.state();
const titles = async () => (await state()).rows.map((r) => r.text);
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
const focusRing = async () => { await d.press("menu"); await sleep(280); };
const openName = async () => { await focusRing(); await pick("Settings"); await pick("Name"); };
const draft = async () => (await state()).rows[0].text;
const letter = async () => (await state()).rows[0].value;
const stored = () => page.evaluate("JSON.parse(localStorage.getItem('pod-player:settings'))");
const steps = async (n) => { for (let i = 0; i < n; i++) await d.key(n > 0 ? "ArrowDown" : "ArrowUp"); };
const type = async (key, code = key) => { await d.key(key, code); };

try {
  await section("defaults", async () => {
    await load(PRODUCT);
    t.eq("product root title", (await state()).title, "mPod");
    await page.send("Page.navigate", { url: PRODUCT });
    await sleep(300);
    t.eq("boot word follows the name", await page.evaluate(`${root}.querySelector('.boot').textContent`), "mPod");
    await sleep(2100);

    await load(BASE);
    t.eq("test page keeps Pod", (await state()).title, "Pod");
    t.eq("debugState keeps its exact shape", Object.keys(await state()), ["view", "title", "rows", "nowPlaying", "brick", "settings", "backlit"]);
    t.eq("settings shape too", Object.keys((await state()).settings), ["shuffle", "repeat", "clicker", "volume", "backlight"]);
    await focusRing();
    await pick("Settings");
    t.eq("no Name row without import", await titles(), ["About", "Shuffle", "Repeat", "Backlight Timer", "Clicker", "Reset All Settings"]);
    t.eq("no name in storage", Object.keys(await stored()), ["shuffle", "repeat", "clicker", "volume"]);

    await load(IMPORT);
    t.eq("test page with import, no stored name: still Pod", (await state()).title, "Pod");
    await focusRing();
    await pick("Settings");
    const s = await state();
    t.eq("Name directly above About, with its value and an arrow", s.rows.slice(0, 2).map((r) => [r.text, r.value, r.arrow]), [["Name", "Pod", true], ["About", null, true]]);
  });

  await section("wheel", async () => {
    await load();
    await openName();
    const s = await state();
    t.eq("screen", [s.view, s.title, await draft(), await letter()], ["name", "Name", "Pod", "A"]);
    t.eq("no input element, so no on-screen keyboard", await page.evaluate(`${root}.querySelectorAll('.name-pane input, .name-pane textarea, .name-pane [contenteditable]').length`), 0);
    t.eq("block cursor shows", await page.evaluate(`getComputedStyle(${root}.querySelector('.name-cursor')).width`), "12px");
    await d.shot("name-screen");
    await page.evaluate(`window.__clicks=0;const g=${P}.graph;const c=g.click.bind(g);g.click=()=>{__clicks++;c()};0`);
    await d.rotate(46);
    await sleep(50);
    t.eq("wheel moves the ring", await letter(), "D");
    t.eq("with clicks", await page.evaluate("__clicks"), 3);
    await d.rotate(-46);
    await sleep(50);
    t.eq("and back", await letter(), "A");
    await d.key("ArrowUp");
    t.eq("wraps to Done", await letter(), "Done");
    await d.key("ArrowUp");
    t.eq("then Delete", await letter(), "Delete");
    await d.key("ArrowUp"); await d.key("ArrowUp"); await d.key("ArrowUp"); await d.key("ArrowUp"); await d.key("ArrowUp");
    t.eq("then the space, by name", await letter(), "Space");
    await d.key("ArrowDown"); await d.key("ArrowDown"); await d.key("ArrowDown"); await d.key("ArrowDown"); await d.key("ArrowDown"); await d.key("ArrowDown");
    t.eq("wraps forward to Done", await letter(), "Done");
    await d.key("ArrowDown");
    t.eq("wraps to A", await letter(), "A");
    await d.press("select");
    t.eq("Select adds the letter", await draft(), "PodA");
    await d.key("ArrowUp"); await d.key("ArrowUp");
    await d.press("select");
    t.eq("Delete removes one", await draft(), "Pod");
    await d.key("ArrowDown");
    await d.key("ArrowRight"); await sleep(280);
    t.eq("Done on an unchanged default stores nothing", [(await state()).title, Object.keys(await stored()).includes("name")], ["Settings", false]);
  });

  await section("save", async () => {
    await load();
    await openName();
    for (let i = 0; i < 3; i++) await type("Backspace");
    t.eq("Backspace", await draft(), "");
    await type("Backspace");
    t.eq("Backspace on empty", await draft(), "");
    for (const k of "Al's") await type(k);
    await type(" ", "Space");
    await type("-");
    await type("&");
    await type(".");
    t.eq("typing, space included", await draft(), "Al's -&.");
    await type("é");
    await type("/");
    t.eq("letters outside the ring are ignored", await draft(), "Al's -&.");
    for (const k of "abcdefgh") await type(k);
    t.eq("stops at 12", await draft(), "Al's -&.abcd");
    await type("Enter", "Enter");
    await sleep(280);
    let s = await state();
    t.eq("Enter saves", [s.title, s.rows[0].value], ["Settings", "Al's -&.abcd"]);
    t.eq("stored in the settings key", (await stored()).name, "Al's -&.abcd");
    t.eq("debugState settings still the same keys", Object.keys(s.settings), ["shuffle", "repeat", "clicker", "volume", "backlight"]);
    t.eq("document title follows", await page.evaluate("document.title"), "Al's -&.abcd");
    await d.press("menu"); await sleep(280);
    t.eq("root title follows", (await state()).title, "Al's -&.abcd");

    console.log("# survives reload, Menu does not save");
    await page.goto(IMPORT); await sleep(2150);
    t.eq("survives a reload", (await state()).title, "Al's -&.abcd");
    await openName();
    await type("Backspace"); await type("Backspace");
    await d.press("menu"); await sleep(280);
    t.eq("Menu leaves without saving", (await state()).rows[0].value, "Al's -&.abcd");
    await pick("Name");
    t.eq("draft is gone", await draft(), "Al's -&.abcd");

    console.log("# trim");
    for (let i = 0; i < 12; i++) await type("Backspace");
    await type(" ", "Space"); await type("X"); await type(" ", "Space");
    await type("Enter", "Enter"); await sleep(280);
    t.eq("surrounding spaces trimmed", (await state()).rows[0].value, "X");

    console.log("# empty restores the default");
    await pick("Name");
    await type("Backspace");
    await type("Enter", "Enter"); await sleep(280);
    t.eq("empty on Done", (await state()).rows[0].value, "Pod");
    t.eq("nothing stored", Object.keys(await stored()).includes("name"), false);

    console.log("# only spaces");
    await pick("Name");
    for (let i = 0; i < 3; i++) await type("Backspace");
    await type(" ", "Space");
    await type("Enter", "Enter"); await sleep(280);
    t.eq("spaces alone are empty", (await state()).rows[0].value, "Pod");

    console.log("# reset");
    await pick("Name");
    await type("!"); await type("Z");
    await type("Enter", "Enter"); await sleep(280);
    t.eq("set", (await state()).rows[0].value, "PodZ");
    await pick("Reset All Settings");
    await d.key("ArrowDown"); await d.key("ArrowRight"); await sleep(280);
    s = await state();
    t.eq("Reset All Settings restores the default", s.rows[0].value, "Pod");
    t.eq("console clean", logs, []);
  });

  await section("long", async () => {
    await load();
    await openName();
    for (let i = 0; i < 3; i++) await type("Backspace");
    for (let i = 0; i < 12; i++) await type("W");
    await type("Enter", "Enter"); await sleep(280);
    const fit = await page.evaluate(`(()=>{const r=${root}.querySelector('.row');const v=r.querySelector('.row-value');return {row:r.scrollWidth<=r.clientWidth,over:v.scrollWidth>v.clientWidth,tail:getComputedStyle(v).textOverflow}})()`);
    t.eq("a long value truncates like any other", [fit.row, fit.tail], [true, "ellipsis"]);
    await d.shot("name-long");
  });

  await section("idle-and-focus", async () => {
    await load();
    await focusRing();
    await pick("Songs");
    await d.key("ArrowRight"); await sleep(500);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await pick("Settings"); await pick("Name");
    await sleep(10400);
    t.eq("idle jump does not take the Name screen", (await state()).title, "Name");
    await type("Backspace");
    t.eq("still editing", await draft(), "Po");
    await page.evaluate(`const i=document.createElement("input");i.id="outside";i.onkeydown=(e)=>{window.__got=e.key};document.body.append(i);i.focus();0`);
    await type("Q");
    t.eq("typing elsewhere on the page is left alone", [await draft(), await page.evaluate("window.__got")], ["Po", "Q"]);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
