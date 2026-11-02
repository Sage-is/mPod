// Spec 40: Shuffle Albums, EQ and Contrast.
import { EQ_BANDS, EQ_PRESETS } from "../src/eq-presets.js";
import { BASE, boot, driver, sleep, T, waitFor } from "./h.mjs";
import { FAKES, file, P, product, ROOT, tagged } from "./product.mjs";

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
const SETTINGS = "pod-player:settings";
const song = (title, album, track, artist = "Art") => file({ b64: tagged({ title, artist, album, track }, 40) });
const LIBRARY = { Lib: {
  "a1.mp3": song("A1", "Alpha", 1), "a2.mp3": song("A2", "Alpha", 2), "a3.mp3": song("A3", "Alpha", 3),
  "b2.mp3": song("B2", "Bravo", 2), "b1.mp3": song("B1", "Bravo", 1),
  "c1.mp3": song("C1", "Coda", 1), "c2.mp3": song("C2", "Coda", 2),
  "d1.mp3": song("D1", "Coda", 1, "Other"),
} };
const played = () => page.evaluate(`${P}.playback.order.map((i)=>${P}.playback.queue[i].name)`);
const graph = (field) => page.evaluate(`${P}.graph.${field}`);
const gains = () => graph("filters.map((f)=>Number(f.gain.value.toFixed(2)))");
const settled = (want) => waitFor(async () => JSON.stringify(await gains()) === JSON.stringify(want), 1000);
const preamp = () => graph("preamp.gain.value");
const near = (x, y) => Math.abs(x - y) < 0.01;
const preset = (id) => EQ_PRESETS.find((p) => p.id === id).gains;
const FLAT = EQ_BANDS.map(() => 0);
const toSettings = async () => { await a.focusRing(); await a.pick("Settings"); };
const choose = async (row, choice) => { await a.pick(row); await a.pick(choice); };

try {
  await section("shuffle-row", async () => {
    await a.open();
    await toSettings();
    t.eq("starts Off", await a.value("Shuffle"), "Off");
    await a.pick("Shuffle");
    t.eq("then Songs", [await a.value("Shuffle"), (await a.stored()).shuffle], ["Songs", "songs"]);
    await a.pick("Shuffle");
    t.eq("then Albums", [await a.value("Shuffle"), (await a.stored()).shuffle], ["Albums", "albums"]);
    await a.reopen();
    await toSettings();
    t.eq("survives a reload", (await a.state()).settings.shuffle, "albums");
    await a.pick("Shuffle");
    t.eq("then Off", await a.value("Shuffle"), "Off");
  });

  await section("album-order", async () => {
    await a.open();
    await page.evaluate(`${P}.settings.set("shuffle","albums");0`);
    await a.setTree("A", LIBRARY);
    await a.link("A");
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Songs");
    await a.pick("A2");
    await sleep(200);
    const order = await played();
    const n = await a.np();
    t.eq("the current song leads", [n.title, n.index, n.total], ["A2", 1, 8]);
    t.eq("then the rest of its album", order.slice(0, 2), ["A2", "A3"]);
    t.eq("then the earlier songs of the first album", order.at(-1), "A1");
    const middle = order.slice(2, -1).join();
    t.ok("other albums each in track order", middle.includes("B1,B2") && middle.includes("C1,C2"), middle);
    t.ok("album means the pair: D1 stands alone", !/C1,D1|D1,C2/.test(middle), middle);
    t.eq("the same icon as Songs", await page.evaluate(`${ROOT}.querySelector('.np-icons svg')?.childElementCount`), 3);
    await d.press("forward"); await sleep(150);
    t.eq("it plays in that order", (await a.np()).title, "A3");

    console.log("# no start song");
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    const firsts = new Set();
    for (let i = 0; i < 8; i++) {
      await a.highlight("Albums");
      await a.pick("Albums");
      await d.key("ArrowLeft"); await sleep(280);
      await a.highlight("Songs");
      await page.evaluate(`${P}.playback.clear()`);
      await sleep(60);
      await d.press("play");
      await sleep(250);
      firsts.add((await a.np()).title);
      await d.press("menu"); await sleep(280);
    }
    t.ok("the first song of a random album", [...firsts].every((name) => ["A1", "B1", "C1", "D1"].includes(name)), [...firsts].join());
    t.ok("and it varies", firsts.size > 1, [...firsts].join());

    console.log("# turned on while playing");
    await page.evaluate(`${P}.settings.set("shuffle","off");0`);
    await a.pick("Songs");
    await a.pick("B1");
    await sleep(200);
    await page.evaluate(`${P}.settings.set("shuffle","albums");0`);
    await sleep(120);
    const live = await played();
    t.eq("applies live", [live[0], live[1], (await a.np()).index], ["B1", "B2", 1]);
    await page.evaluate(`${P}.settings.set("shuffle","off");0`);
    await sleep(120);
    t.eq("and Off returns the true index", (await a.np()).index, 4);
    t.eq("console clean", logs, []);
  });

  await section("eq-graph", async () => {
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__edges = [];
      window.__targets = [];
      const names = new Map();
      const label = (node) => {
        if (node instanceof AudioDestinationNode) return "destination";
        if (!names.has(node)) names.set(node, node.constructor.name.replace("Node", "") + names.size);
        return names.get(node);
      };
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (to, ...rest) { window.__edges.push([label(this), label(to)]); return connect.call(this, to, ...rest); };
      const target = AudioParam.prototype.setTargetAtTime;
      AudioParam.prototype.setTargetAtTime = function (value, at, constant) { window.__targets.push(constant); return target.call(this, value, at, constant); };` });
    await a.open();
    const shape = await page.evaluate(`${P}.graph.filters.map((f)=>[f.type,f.frequency.value,Number(f.Q.value.toFixed(2))])`);
    t.eq("ten filters, shelves at the ends", shape.map((f) => f[0]), ["lowshelf", ...Array(8).fill("peaking"), "highshelf"]);
    t.eq("at the table's bands", shape.map((f) => f[1]), EQ_BANDS);
    t.ok("Q 1.4", shape.every((f) => f[2] === 1.4), JSON.stringify(shape));
    t.ok("Off is flat", await settled(FLAT));
    t.ok("with no preamp", near(await preamp(), 1), await preamp());

    await a.setTree("A", LIBRARY);
    await a.link("A");
    await a.focusRing();
    await a.pick("Browse");
    await a.pick("Songs");
    await d.press("select");
    await waitFor(async () => (await a.np())?.playing, 3000);
    const edges = await page.evaluate("window.__edges");
    const after = (from) => edges.find((e) => e[0] === from)?.[1];
    const fade = after(edges.find(([from]) => from.startsWith("MediaElementAudioSource"))[0]);
    const path = [fade];
    while (after(path.at(-1)) && path.length < 16) path.push(after(path.at(-1)));
    t.eq("fade gain, preamp, ten filters, master gain, out", path.map((n) => n.replace(/\d+$/, "")), ["Gain", "Gain", ...Array(10).fill("BiquadFilter"), "Gain", "destination"]);
    t.eq("channels connect to the preamp, not the master", await page.evaluate(`(()=>{const g=${P}.graph;return g.input===g.preamp})()`), true);

    console.log("# live");
    await page.evaluate("window.__targets.length=0;0");
    await page.evaluate(`${P}.settings.set("eq","rock");0`);
    t.ok("the filter gains follow, live", await settled(preset("rock")), JSON.stringify(await gains()));
    t.ok("every gain moves with a 0.02 s time constant", (await page.evaluate("window.__targets")).every((c) => near(c, 0.02)));
    t.eq("all ten and the preamp move", (await page.evaluate("window.__targets")).length, 11);
    t.ok("preamp is minus the largest gain, less 1.5 dB", await waitFor(async () => near(await preamp(), 10 ** (-5.5 / 20)), 1000), await preamp());
    t.ok("still playing", (await a.np()).playing);
    await page.evaluate(`${P}.settings.set("eq","bass-reducer");0`);
    t.ok("a preset that only cuts", await settled(preset("bass-reducer")));
    t.ok("needs no preamp", await waitFor(async () => near(await preamp(), 1), 1000), await preamp());
    await page.evaluate(`${P}.settings.set("eq","dance");0`);
    t.ok("Dance peaks at 6", await waitFor(async () => near(await preamp(), 10 ** (-7.5 / 20)), 1000), await preamp());
    await page.evaluate(`${P}.settings.set("eq","off");0`);
    t.ok("Off is every gain at 0 dB", await settled(FLAT));
    t.ok("and 0 dB of preamp", await waitFor(async () => near(await preamp(), 1), 1000), await preamp());

    console.log("# clicks bypass it");
    await page.evaluate(`window.__edges.length=0;${P}.graph.nextTime=0;${P}.graph.click();0`);
    const click = await page.evaluate("window.__edges");
    t.eq("a click goes to its own gain", click.map(([from]) => from.replace(/\d+$/, "")), ["AudioBufferSource"]);
    t.eq("which goes straight out", edges.find((e) => e[0] === click[0][1])?.[1], "destination");
    t.eq("console clean", logs, []);
  });

  await section("eq-curve", async () => {
    await a.open();
    const peaks = await page.evaluate(`(async () => {
      const { EQ_BANDS, EQ_PRESETS, eqPreamp } = await import("/src/eq-presets.js");
      const ctx = new OfflineAudioContext(1, 128, 44100);
      const size = 2000;
      const hz = Float32Array.from({ length: size }, (_, i) => 20 * 1000 ** (i / (size - 1)));
      const gain = new Float32Array(size);
      const phase = new Float32Array(size);
      return EQ_PRESETS.map(({ name, gains }) => {
        const total = new Float64Array(size).fill(eqPreamp(gains));
        EQ_BANDS.forEach((frequency, i) => {
          const type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
          new BiquadFilterNode(ctx, { type, frequency, Q: 1.4, gain: gains[i] }).getFrequencyResponse(hz, gain, phase);
          for (let k = 0; k < size; k++) total[k] += 20 * Math.log10(gain[k]);
        });
        return [name, Number(Math.max(...total).toFixed(2))];
      });
    })()`);
    console.log(`    highest combined peak ${Math.max(...peaks.map(([, peak]) => peak))} dB`);
    t.eq("every preset's combined curve stays at or below 0 dB", peaks.filter(([, peak]) => peak > 0), []);
  });

  await section("eq-screen", async () => {
    await a.open();
    await toSettings();
    t.eq("row with its value", [await a.value("EQ")], ["Off"]);
    await a.pick("EQ");
    const s = await a.state();
    t.eq("a choice list: Off, then the presets in order", [s.title, s.rows.map((r) => r.text)], ["EQ", ["Off", ...EQ_PRESETS.map((p) => p.name)]]);
    t.eq("no arrows, like Backlight Timer", s.rows.some((r) => r.arrow), false);
    t.eq("opens on the current choice", s.rows.findIndex((r) => r.selected), 0);
    await a.pick("R&B");
    t.eq("back on Settings, with the name as value", [(await a.state()).title, await a.value("EQ")], ["Settings", "R&B"]);
    t.ok("applied", await settled(preset("r-and-b")));
    t.eq("stored", (await a.stored()).eq, "r-and-b");
    await a.pick("EQ");
    t.eq("reopens on it", (await a.state()).rows.find((r) => r.selected).text, "R&B");
    await d.press("menu"); await sleep(280);
    await a.reopen();
    await toSettings();
    t.eq("survives a reload", await a.value("EQ"), "R&B");
    t.ok("and reaches the filters", await settled(preset("r-and-b")));
    await a.pick("Reset All Settings");
    await d.key("ArrowDown"); await d.key("ArrowRight"); await sleep(280);
    t.eq("Reset All Settings restores it", await a.value("EQ"), "Off");
    t.ok("live too", await settled(FLAT));
    t.eq("the field is written all the same", (await a.stored()).eq, "off");
  });

  await section("contrast", async () => {
    const filters = () => page.evaluate(`[".menu-layer",".scrim",".lamp"].map((s)=>getComputedStyle(${ROOT}.querySelector(s)).filter)`);
    await a.open();
    await toSettings();
    await a.pick("Contrast");
    const s = await a.state();
    t.eq("a choice list", [s.title, s.rows.map((r) => r.text)], ["Contrast", ["Lightest", "Light", "Normal", "Dark", "Darkest"]]);
    t.eq("opens on Normal", s.rows.findIndex((r) => r.selected), 2);
    t.eq("Normal adds nothing", (await filters())[0], "none");
    for (const [name, value, id] of [["Lightest", 0.7, "lightest"], ["Light", 0.85, "light"], ["Dark", 1.2, "dark"], ["Darkest", 1.4, "darkest"]]) {
      await a.pick(name);
      const [content, scrim, lamp] = await filters();
      t.eq(`${name}: CSS contrast on the content`, content, `contrast(${value})`);
      t.eq(`${name}: not on the backlight layers`, [scrim, lamp], ["none", "none"]);
      t.eq(`${name}: stored`, (await a.stored()).contrast, id);
      await a.pick("Contrast");
    }
    await d.shot("contrast-darkest");
    await a.pick("Normal");
    t.eq("back to none", (await filters())[0], "none");
    t.eq("the field is written all the same", (await a.stored()).contrast, "normal");
    await a.pick("Contrast");
    await a.pick("Dark");
    await a.reopen();
    t.eq("survives a reload", (await filters())[0], "contrast(1.2)");
    await toSettings();
    await a.pick("Reset All Settings");
    await d.key("ArrowDown"); await d.key("ArrowRight"); await sleep(280);
    t.eq("Reset All Settings restores it", (await filters())[0], "none");
  });

  await section("writes", async () => {
    await a.open();
    t.eq("every field goes in every write", Object.keys(await a.stored()).sort(), ["clicker", "contrast", "eq", "name", "repeat", "shuffle", "volume"]);
    await page.evaluate(`${P}.settings.set("eq","jazz");${P}.settings.set("contrast","dark");${P}.settings.set("name","Mine");0`);
    await page.evaluate(`${P}.settings.set("clicker","off");0`);
    const s = await a.stored();
    t.eq("a write keeps them", [s.eq, s.contrast, s.name, s.clicker], ["jazz", "dark", "Mine", "off"]);
  });

  await section("test-page", async () => {
    await page.goto(BASE);
    await page.evaluate(`localStorage.setItem("${SETTINGS}", JSON.stringify({shuffle:"albums",repeat:"off",clicker:"on",volume:50,eq:"rock",contrast:"dark"}));0`);
    await page.goto(IMPORT);
    await sleep(2150);
    const test = driver(page);
    const s = await test.state();
    t.eq("stored values read as defaults", s.settings, { shuffle: "off", repeat: "off", clicker: "on", volume: 50, backlight: s.settings.backlight });
    t.eq("the audio graph stays as in 17", await page.evaluate(`[${P}.graph.filters ?? null,${P}.graph.preamp ?? null,${P}.graph.input===${P}.graph.master]`), [null, null, true]);
    t.eq("no contrast", await page.evaluate(`getComputedStyle(${ROOT}.querySelector('.menu-layer')).filter`), "none");
    await a.focusRing();
    await a.pick("Settings");
    t.eq("no new rows", (await a.titles()).filter((r) => r === "EQ" || r === "Contrast"), []);
    t.eq("Shuffle reads Off", await a.value("Shuffle"), "Off");
    await a.pick("Shuffle");
    t.eq("and cycles as in 15", await a.value("Shuffle"), "Songs");
    await a.pick("Shuffle");
    t.eq("Songs goes back to Off", await a.value("Shuffle"), "Off");

    console.log("# it keeps what it does not show");
    await page.evaluate(`localStorage.setItem("${SETTINGS}", JSON.stringify({shuffle:"albums",repeat:"off",clicker:"on",volume:50,eq:"rock",contrast:"dark",name:"Mine"}));0`);
    await page.goto(BASE);
    await sleep(2150);
    await page.evaluate(`${P}.settings.set("clicker","off");0`);
    const kept = await a.stored();
    t.eq("a write on the test page keeps them", [kept.eq, kept.contrast, kept.name, kept.shuffle, kept.clicker], ["rock", "dark", "Mine", "albums", "off"]);
    await page.evaluate(`${P}.resetSettings();0`);
    const reset = await a.stored();
    t.eq("so does its reset", [reset.eq, reset.contrast, reset.shuffle], ["rock", "dark", "off"]);
    await a.reopen();
    t.eq("and the product page finds them", [(await a.state()).settings.eq, (await a.state()).settings.contrast], ["rock", "dark"]);
    await page.evaluate("localStorage.clear();0");
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
