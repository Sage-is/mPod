// Specs 48 and 49: the off screen's unlit LCD, and the buttons' haptics, on the product page.
import { boot, sleep, T, waitFor } from "./h.mjs";
import { FAKES, P, product, ROOT } from "./product.mjs";

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

// A battery to charge, as in t21, and a vibrate that only records.
const STUB = `
window.__battery = Object.assign(new EventTarget(), { level: 0.4, charging: false });
navigator.getBattery = () => Promise.resolve(window.__battery);
window.__setBattery = (level, charging) => {
  const b = window.__battery;
  b.level = level;
  b.charging = charging;
  b.dispatchEvent(new Event("levelchange"));
  b.dispatchEvent(new Event("chargingchange"));
};
window.__buzz = [];
Object.defineProperty(navigator, "vibrate", { configurable: true, value: (ms) => { window.__buzz.push(ms); return true; } });`;

const view = async () => (await a.state()).view;
const frames = () => page.evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))");
// The inside of the screen, past its border and its inner shadow.
const shot = async () => {
  const r = await page.evaluate(`(()=>{const r=${ROOT}.querySelector('.screen').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const inset = 18;
  const clip = { x: r.x + inset, y: r.y + inset, width: r.width - 2 * inset, height: r.height - 2 * inset, scale: 1 };
  return (await page.send("Page.captureScreenshot", { format: "png", clip })).data;
};
// Ink is dark. The unlit LCD, its tint and its reflection are all light.
const inked = (png) => page.evaluate(`(async()=>{const i=new Image();i.src="data:image/png;base64,${png}";await i.decode();const c=new OffscreenCanvas(i.width,i.height);const x=c.getContext("2d");x.drawImage(i,0,0);const p=x.getImageData(0,0,i.width,i.height).data;let n=0;for(let k=0;k<p.length;k+=4)if(0.3*p[k]+0.59*p[k+1]+0.11*p[k+2]<110)n++;return n})()`);
// How many pixels differ between two shots, and where, for a failure's message.
const diff = (one, two) => page.evaluate(`(async()=>{const load=async(s)=>{const i=new Image();i.src="data:image/png;base64,"+s;await i.decode();const c=new OffscreenCanvas(i.width,i.height);const x=c.getContext("2d");x.drawImage(i,0,0);return x.getImageData(0,0,i.width,i.height)};const a=await load(${JSON.stringify(one)}),b=await load(${JSON.stringify(two)});let n=0,box=[1e9,1e9,-1,-1],most=0;for(let k=0;k<a.data.length;k+=4){const d=Math.max(...[0,1,2].map((j)=>Math.abs(a.data[k+j]-b.data[k+j])));if(d){n++;most=Math.max(most,d);const p=k/4,x=p%a.width,y=Math.floor(p/a.width);box=[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]}}return {n,most,box,size:[a.width,a.height]}})()`);
// Chrome dithers the LCD's gradients a little differently from frame to frame, by up to 2 of 255.
// Ink and the old #111 differ by over 100.
const same = async (one, two) => (await diff(one, two)).most <= 3;
// The bare unlit LCD: the same screen with the off layer and everything on it hidden.
const bare = async (hide = ".power") => {
  await page.evaluate(`${ROOT}.querySelectorAll(${JSON.stringify(hide)}).forEach((el)=>{el.style.visibility="hidden"});0`);
  await frames();
  const png = await shot();
  await page.evaluate(`${ROOT}.querySelectorAll(${JSON.stringify(hide)}).forEach((el)=>{el.style.visibility=""});0`);
  await frames();
  return png;
};
const start = async () => {
  await a.open();
  await page.evaluate(`${P}.settings.chooseBacklight("off");0`);
  await a.focusRing();
  await sleep(100);
};

const buzz = () => page.evaluate("window.__buzz");
const quiet = () => page.evaluate("window.__buzz.length=0;0");
const spot = async (name) => {
  const r = await d.rect();
  const off = 0.447 * r.width;
  const [dx, dy] = { select: [0, 0], menu: [0, -off], back: [-off, 0], forward: [off, 0], play: [0, off] }[name];
  return [r.cx + dx, r.cy + dy];
};
const press = async (name, held = 40) => {
  const [x, y] = await spot(name);
  await page.mouse("mouseMoved", x, y);
  await page.mouse("mousePressed", x, y, 1);
  await sleep(held);
  const down = await buzz();
  await page.mouse("mouseReleased", x, y);
  await sleep(40);
  return [down, await buzz()];
};

try {
  await section("off-look", async () => {
    await start();
    const before = await shot();
    await page.evaluate(`${P}.power.enter();0`);
    await frames();
    t.eq("off", await view(), "off");
    const off = await shot();
    t.eq("off is the bare unlit LCD, with its tint and its reflection, at once", await same(off, await bare()), true);
    t.eq("with no ink drawn: no title bar, battery, list or text", await inked(off), 0);
    t.eq("the backlight is off", (await a.state()).backlit, false);
    t.eq("the body is unchanged", await page.evaluate(`getComputedStyle(${ROOT}.querySelector('.device')).visibility`), "visible");
    await d.press("select");
    await frames();
    const woken = await shot();
    t.ok("waking shows the same screen as before, at once", (await view()) === "list" && (await same(before, woken)), JSON.stringify(await diff(before, woken)));
    t.eq("console clean", logs, []);
  });

  await section("charging-look", async () => {
    await start();
    await page.evaluate("__setBattery(0.4,true);0");
    await page.evaluate(`${P}.power.enter();0`);
    await frames();
    const charging = await shot();
    t.ok("Charging draws its title and battery in ink", (await inked(charging)) > 200, await inked(charging));
    t.eq("in the screen's ink colour", await page.evaluate(`getComputedStyle(${ROOT}.querySelector('.power-title')).color===getComputedStyle(${ROOT}.querySelector('.screen')).color`), true);
    t.eq("on the same unlit LCD, with nothing else drawn", await same(await bare(".power-title, .power .battery"), await bare()), true);
    await page.evaluate("__setBattery(1,true);0");
    await frames();
    t.ok("Charged too", (await inked(await shot())) > 200);
    await page.evaluate("__setBattery(1,false);0");
    await sleep(80);
    const plain = await shot();
    const lcd = await bare();
    t.ok("when charging stops, the plain unlit LCD", (await same(plain, lcd)) && (await inked(plain)) === 0, JSON.stringify(await diff(plain, lcd)));
  });

  // Specs 49 and 51: one 10 ms tick as a button goes down, and nothing as it comes up.
  await section("buttons", async () => {
    await start();
    for (const name of ["menu", "back", "forward", "play", "select"]) {
      await quiet();
      t.eq(`${name}: 10 ms going down, nothing coming up`, await press(name), [[10], [10]]);
      await a.focusRing();
    }

    console.log("# the wheel's limit");
    await quiet();
    await page.evaluate(`${P}.click(1);0`);
    t.eq("a button right after a wheel tick still ticks", (await press("menu"))[1], [4, 10]);

    console.log("# off");
    await page.evaluate(`${P}.power.enter();0`);
    await quiet();
    t.eq("the press that wakes ticks too", await press("menu"), [[10], [10]]);
    t.eq("and wakes", await view(), "list");

    console.log("# a hold that takes");
    await quiet();
    t.eq("Play held to off: the one tick only", await press("play", 2300), [[10], [10]]);
    t.eq("it did turn off", await view(), "off");
    await press("menu");
    await a.focusRing();
    await quiet();
    t.eq("Menu held for the backlight: the one tick only", await press("menu", 1200), [[10], [10]]);

    console.log("# keys");
    await quiet();
    await d.key("ArrowLeft");
    await sleep(80);
    t.eq("a key stands for a press but is no switch", await buzz(), []);

    console.log("# Clicker off");
    await page.evaluate(`${P}.settings.set("clicker","off");0`);
    await quiet();
    await press("forward");
    await d.rotate(60);
    t.eq("none at all", await buzz(), []);
  });

  await section("wheel", async () => {
    await start();
    await quiet();
    const before = await d.sel();
    await d.rotate(70);
    const moved = (await d.sel()) - before;
    const ticks = await buzz();
    t.ok("the wheel ticks 4 ms with each move", moved > 0 && ticks.length > 0 && ticks.length <= moved && ticks.every((ms) => ms === 4), JSON.stringify([moved, ticks]));
    await d.rotate(-200);
    t.eq("back at the top", await d.sel(), 0);
    await sleep(100);
    await quiet();
    await d.rotate(-60);
    t.eq("at a list's end, where nothing moves, none", [await d.sel(), await buzz()], [0, []]);
  });

  // Spec 50: the wheel only turns. A touch presses only on a button's own area.
  await section("touch", async () => {
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    await start();
    await page.evaluate(`window.__pressed=[];const press=${P}.press.bind(${P});${P}.press=(n)=>{__pressed.push(n);press(n)};0`);
    const pressed = () => page.evaluate("window.__pressed");
    const r = await d.rect();
    const touch = (type, points) => page.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const point = (radius, deg, id = 1) => ({ x: r.cx + radius * r.width * Math.sin(deg * Math.PI / 180), y: r.cy - radius * r.width * Math.cos(deg * Math.PI / 180), id });
    const still = async (p, ms = 40) => {
      await touch("touchStart", [p]);
      await sleep(ms);
      const down = await buzz();
      await touch("touchEnd", []);
      await sleep(80);
      return [down, await buzz()];
    };

    for (const deg of [0, 90, 180, 270]) {
      await quiet();
      t.eq(`a still touch on the ring at ${deg} degrees ticks nothing`, await still(point(0.3, deg)), [[], []]);
    }
    t.eq("and presses nothing", [await pressed(), await view()], [[], "list"]);
    await quiet();
    t.eq("nor does one held there", await still(point(0.3, 180), 2300), [[], []]);
    t.eq("it does not turn the device off", [await pressed(), await view()], [[], "list"]);

    console.log("# a turn that starts on the ring");
    await quiet();
    await touch("touchStart", [point(0.27, 90)]);
    for (let i = 1; i <= 24; i++) { await touch("touchMove", [point(0.27, 90 + i * 4)]); await sleep(10); }
    await sleep(100);
    await touch("touchEnd", []);
    await sleep(60);
    const turned = await buzz();
    t.ok("only the wheel's 4 ms ticks, and no 8 ms switch", turned.length > 0 && turned.every((ms) => ms === 4), JSON.stringify(turned));

    console.log("# the buttons' own areas");
    for (const [name, deg] of [["menu", 0], ["forward", 90], ["play", 180], ["back", 270]]) {
      await a.focusRing();
      await page.evaluate("window.__pressed.length=0;0");
      await quiet();
      t.eq(`a touch on ${name} ticks once, going down`, await still(point(0.447, deg)), [[10], [10]]);
      t.eq(`and presses it`, (await pressed()).at(-1), name);
    }
    await a.focusRing();
    await page.evaluate("window.__pressed.length=0;0");
    await quiet();
    t.eq("Select too", [await still(point(0, 0)), (await pressed()).at(-1)], [[[10], [10]], "select"]);

    console.log("# holds on the buttons");
    await a.focusRing();
    await quiet();
    t.eq("Play held on its own button ticks once only", await still(point(0.447, 180), 2300), [[10], [10]]);
    t.eq("and still turns the device off", await view(), "off");
    await still(point(0.447, 0));
    await a.focusRing();
    await page.evaluate("window.__marker=1;0");
    await touch("touchStart", [point(0.447, 180, 1)]);
    await sleep(60);
    await touch("touchStart", [point(0.447, 180, 1), point(0.447, 0, 2)]);
    await sleep(5300);
    t.ok("the restart chord works with two touches on Menu and Play", await page.evaluate("window.__marker === undefined").catch(() => false));
    await touch("touchEnd", []).catch(() => {});
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  });
  // Spec 51: one tick per press, and nothing for the phone to answer while a finger is down.
  await section("one-tick", async () => {
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await start();
    const r = await d.rect();
    const touch = (type, points) => page.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const point = (radius, deg, dx = 0) => ({ x: r.cx + radius * r.width * Math.sin(deg * Math.PI / 180) + dx, y: r.cy - radius * r.width * Math.cos(deg * Math.PI / 180), id: 1 });
    const BUTTONS = [["menu", 0.447, 0], ["forward", 0.447, 90], ["play", 0.447, 180], ["back", 0.447, 270], ["select", 0, 0]];

    for (const [name, radius, deg] of BUTTONS) {
      await a.focusRing();
      await quiet();
      await touch("touchStart", [point(radius, deg)]);
      await sleep(2500);
      const held = await buzz();
      await touch("touchEnd", []);
      await sleep(80);
      t.eq(`${name} held 2.5 s calls vibrate once, with 10`, [held, await buzz()], [[10], [10]]);
      if ((await view()) === "off") await d.press("menu");
    }
    await a.focusRing();
    await quiet();
    await touch("touchStart", [point(0.447, 90)]);
    await touch("touchEnd", []);
    await sleep(80);
    t.eq("a quick tap calls it once", await buzz(), [10]);

    console.log("# nothing else while a finger is down");
    await quiet();
    await touch("touchStart", [point(0.447, 0)]);
    await sleep(60);
    await page.evaluate(`${P}.click(1);0`);
    await sleep(60);
    const during = await buzz();
    await touch("touchEnd", []);
    await sleep(1100);
    t.eq("not even a wheel tick", during, [10]);

    console.log("# the phone's own long press");
    const parts = [".device", ".rim", ".screen", ".sheen", ".wheel", ".ring", ".select", ".btn.menu", ".btn.back", ".btn.forward", ".btn.play"];
    t.eq("contextmenu on any part of the device is cancelled at once, with no hold running", await page.evaluate(`(()=>{${P}.buttons.cancel();return ${JSON.stringify(parts)}.filter((s)=>{const e=new MouseEvent("contextmenu",{bubbles:true,composed:true,cancelable:true});${ROOT}.querySelector(s).dispatchEvent(e);return !e.defaultPrevented})})()`), []);
    t.eq("and nothing on it can be selected", await page.evaluate(`getComputedStyle(${ROOT}.querySelector('.device')).userSelect`), "none");

    console.log("# a resting finger");
    // It drifts along the wheel, the way that would turn it.
    const drift = 15;
    const took = () => page.evaluate(`${P}.wheel.pointerId !== null`);
    await a.focusRing();
    const before = await d.sel();
    const lit = (await a.state()).backlit;
    await quiet();
    await touch("touchStart", [point(0.447, 0)]);
    for (let i = 1; i <= 10; i++) { await touch("touchMove", [point(0.447, 0, (drift * i) / 10)]); await sleep(110); }
    await sleep(100);
    const drifted = [await took(), await buzz()];
    await touch("touchEnd", []);
    await sleep(100);
    t.eq(`a finger that drifts ${drift} px during a hold turns nothing and ticks nothing`, [await d.sel(), ...drifted], [before, false, [10]]);
    t.eq("and the hold still takes", (await a.state()).backlit, !lit);
    await quiet();
    // The ring takes a touch at once, so a turn can start there. Each step it turns calls activity().
    const side = (dy) => ({ ...point(0.3, 90), y: point(0.3, 90).y + dy });
    await page.evaluate(`window.__steps=0;const act=${P}.activity.bind(${P});${P}.activity=()=>{window.__steps++;act()};0`);
    await touch("touchStart", [side(0)]);
    await page.evaluate("window.__steps=0;0");
    for (let i = 1; i <= 10; i++) { await touch("touchMove", [side((drift * i) / 10)]); await sleep(60); }
    const resting = await page.evaluate("window.__steps");
    await touch("touchEnd", []);
    await sleep(100);
    t.eq("nor does one resting on the ring", [await d.sel(), resting, await buzz()], [before, 0, []]);
    console.log("# past the allowance it turns");
    await touch("touchStart", [point(0.3, 90)]);
    for (let i = 1; i <= 24; i++) { await touch("touchMove", [point(0.3, 90 + i * 4)]); await sleep(10); }
    await touch("touchEnd", []);
    await sleep(100);
    t.ok("a real turn still turns", (await d.sel()) !== before, await d.sel());
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
