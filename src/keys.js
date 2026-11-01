import { LIST_TIERS, SEEK_TIERS } from "./wheel.js";

const NAMES = {
  ArrowDown: "down", ArrowUp: "up", ArrowLeft: "left", ArrowRight: "right",
  Enter: "enter", " ": "space", Spacebar: "space", Escape: "escape",
};
const nameOf = (e) => NAMES[e.key] ?? (e.code === "Space" ? "space" : null);
const SCREEN_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", " ", "Spacebar", "Escape",
  "Home", "End", "PageUp", "PageDown"]);
const RANGE_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
const FIRST_REPEAT = 300;
const REPEAT = 80;

const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
const tier = (tiers, held) => tiers[Math.min(Math.floor(held / 500), tiers.length - 1)];

export class RingKeys {
  active = null;

  constructor(device, wheelEl, ringEl) {
    this.device = device;
    this.ring = ringEl;
    wheelEl.addEventListener("keydown", (e) => { if (e.target === ringEl) this.#down(e); });
    wheelEl.addEventListener("keyup", (e) => { if (e.target === ringEl) this.#up(e); });
    ringEl.addEventListener("blur", () => this.cancel());
  }

  #action(name, scrollTarget) {
    const d = this.device;
    const rtl = d.rtl;
    const target = scrollTarget === "letter" ? "list" : scrollTarget;
    const scroll = (dir) => ({ type: "scroll", dir });
    const press = (button) => ({ type: "press", button });
    const hold = (button) => ({ type: "hold", button, first: 1000, repeat: button === "menu" ? 0 : 500 });
    const steer = (dir) => ({ type: "steer", dir });
    switch (name) {
      case "down":
        if (target === "brick") return { type: "swallow" };
        return scroll(target === "list" ? 1 : -1);
      case "up":
        if (target === "brick") return { type: "swallow" };
        return scroll(target === "list" ? -1 : 1);
      case "left":
        if (target === "list") return press(rtl ? "select" : "menu");
        if (target === "volume") return hold("back");
        return target === "seek" ? scroll(-1) : steer(-1);
      case "right":
        if (target === "list") return press(rtl ? "menu" : "select");
        if (target === "volume") return hold("forward");
        return target === "seek" ? scroll(1) : steer(1);
      case "enter":
        if (d.nav.top.key === "about") return { type: "hold", button: "select", first: 5000, repeat: 0 };
        return press("select");
      case "space":
        return press("play");
      default:
        return hold("menu");
    }
  }

  #down(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) { this.cancel(); return; }
    const name = nameOf(e);
    if (!name) return;
    swallow(e);
    if (e.repeat || this.active?.name === name) return;
    this.cancel();
    const target = this.device.scrollTarget;
    const a = { ...this.#action(name, target), name, target };
    this.active = a;
    if (a.type === "scroll") this.#beginScroll(a);
    else if (a.type === "hold") this.#beginHold(a);
    else if (a.type === "steer") this.device.brick?.steerStart(a.dir);
  }

  #up(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) { this.cancel(); return; }
    const name = nameOf(e);
    if (!name) return;
    swallow(e);
    const a = this.active;
    if (a?.name !== name) return;
    this.active = null;
    clearTimeout(a.timer);
    clearInterval(a.interval);
    const d = this.device;
    if (a.type === "press") d.press(a.button);
    else if (a.type === "hold" && !a.fired) d.press(a.button);
    else if (a.type === "scroll") d.wheel.leaveDragging("key");
    else if (a.type === "steer") d.brick?.steerEnd(true);
  }

  cancel() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    clearTimeout(a.timer);
    clearInterval(a.interval);
    if (a.type === "scroll") this.device.wheel.leaveDragging("key");
    else if (a.type === "steer") this.device.brick?.steerEnd(false);
  }

  #stale(a) {
    if (this.active !== a) return true;
    const stale = this.device.scrollTarget !== a.target
      || (a.type === "hold" && a.first === 5000 && this.device.nav.top.key !== "about");
    if (stale) this.cancel();
    return stale;
  }

  #beginScroll(a) {
    const d = this.device;
    a.start = performance.now();
    d.wheel.enterDragging("key");
    this.#step(a);
    a.timer = setTimeout(() => {
      if (this.#stale(a)) return;
      this.#step(a);
      a.interval = setInterval(() => { if (!this.#stale(a)) this.#step(a); }, REPEAT);
    }, FIRST_REPEAT);
  }

  #step(a) {
    const d = this.device;
    d.activity();
    if (d.inert) return;
    const held = performance.now() - a.start;
    if (a.target === "seek") {
      d.modes.scrubStep(a.dir * tier(SEEK_TIERS, held));
      return;
    }
    let changed;
    if (a.target === "list") changed = d.nav.move(a.dir * tier(LIST_TIERS, held));
    else if (a.target === "letter") changed = d.nav.move(a.dir);
    else changed = d.modes.volumeStep(a.dir * 5);
    if (changed) d.click(1);
  }

  #beginHold(a) {
    const { buttons } = this.device;
    a.timer = setTimeout(() => {
      if (this.#stale(a)) return;
      if (!buttons.holdEnabled(a.button)) { this.cancel(); return; }
      a.fired = true;
      buttons.fire(a.button, true);
      if (a.repeat) {
        a.interval = setInterval(() => {
          if (!this.#stale(a)) buttons.fire(a.button, false);
        }, a.repeat);
      }
    }, a.first);
  }
}

export class ScreenKeys {
  escape = 0;

  constructor(device, bodyEl) {
    this.device = device;
    this.body = bodyEl;
    bodyEl.addEventListener("keydown", (e) => this.#down(e));
    bodyEl.addEventListener("keyup", (e) => this.#up(e));
    bodyEl.addEventListener("focusout", (e) => {
      if (!e.relatedTarget || !bodyEl.contains(e.relatedTarget)) this.resetEscape();
    });
  }

  resetEscape() { clearTimeout(this.escape); this.escape = 0; }

  #escapeDown(e) {
    swallow(e);
    if (e.repeat || this.escape) return;
    this.escape = setTimeout(() => {
      this.escape = 0;
      this.device.backlight.toggle();
    }, 1000);
  }

  #down(e) {
    const d = this.device;
    const kind = d.nav.kind;
    if (kind === "game") return;
    if (d.inert) {
      if (SCREEN_KEYS.has(e.key)) swallow(e);
      return;
    }
    if (e.key === "Escape") { this.#escapeDown(e); return; }

    if (kind === "list" || kind === "name") {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        swallow(e);
        d.nav.move(e.key === "ArrowDown" ? 1 : -1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        swallow(e);
      } else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        swallow(e);
        if (!e.repeat) d.select();
      }
      return;
    }

    const target = e.target;
    const onRange = target?.matches?.('input[type="range"]');
    if ((onRange && RANGE_KEYS.has(e.key)) || (target?.tagName === "A" && e.key === "Enter")) {
      e.stopPropagation();
      return;
    }
    if (RANGE_KEYS.has(e.key) && e.key.startsWith("Arrow")) swallow(e);
    else if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") swallow(e);
  }

  #up(e) {
    if (e.key !== "Escape") return;
    const d = this.device;
    if (d.nav.kind === "game") return;
    swallow(e);
    if (d.inert || !this.escape) return;
    this.resetEscape();
    d.press("menu");
  }
}
