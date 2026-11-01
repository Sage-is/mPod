const HOLDS = {
  menu: { first: 1000, repeat: 0 },
  back: { first: 1000, repeat: 500 },
  forward: { first: 1000, repeat: 500 },
  select: { first: 5000, repeat: 0 },
};

export class Buttons {
  held = null;
  swallow = null;

  constructor(device, els) {
    this.device = device;
    this.els = els;
    this.onWindowClick = (e) => {
      if (!this.swallow) return;
      const btn = this.els[this.swallow];
      if (!e.composedPath().includes(btn)) return;
      this.swallow = null;
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    this.onWindowPress = () => { this.swallow = null; };
    this.onWindowBlur = () => this.cancel();

    for (const name of Object.keys(els)) {
      const btn = els[name];
      btn.addEventListener("click", () => device.press(name));
      if (!HOLDS[name]) continue;
      btn.addEventListener("pointerdown", (e) => this.#pointerDown(name, e));
      btn.addEventListener("pointerup", () => this.#release(name));
      btn.addEventListener("pointerleave", () => this.#abandon(name));
      btn.addEventListener("pointercancel", () => this.#abandon(name));
      btn.addEventListener("contextmenu", (e) => { if (this.held) e.preventDefault(); });
    }
    for (const name of ["menu", "back", "forward"]) {
      const btn = els[name];
      btn.addEventListener("keydown", (e) => this.#keyDown(name, e));
      btn.addEventListener("keyup", (e) => this.#keyUp(name, e));
      btn.addEventListener("blur", () => { if (this.held?.keyboard) this.cancel(); });
    }
  }

  attach() {
    window.addEventListener("click", this.onWindowClick, true);
    window.addEventListener("pointerdown", this.onWindowPress, true);
    window.addEventListener("blur", this.onWindowBlur);
  }

  detach() {
    window.removeEventListener("click", this.onWindowClick, true);
    window.removeEventListener("pointerdown", this.onWindowPress, true);
    window.removeEventListener("blur", this.onWindowBlur);
    this.cancel();
  }

  holdEnabled(name) {
    const d = this.device;
    if (name === "menu") return true;
    if (d.inert) return false;
    if (name === "select") return d.nav.top.key === "about";
    return !d.modes.scrubActive;
  }

  fire(name, first) {
    const d = this.device;
    if (name === "menu") d.backlight.toggle();
    else if (name === "select") d.openBrick();
    else d.modes.holdSeek(name === "back" ? -1 : 1, first);
  }

  #begin(name, keyboard) {
    const hold = { name, keyboard, fired: false, timer: 0, repeat: 0 };
    this.held = hold;
    const cfg = HOLDS[name];
    hold.timer = setTimeout(() => {
      hold.timer = 0;
      hold.fired = true;
      if (!keyboard) this.swallow = name;
      this.fire(name, true);
      if (cfg.repeat) hold.repeat = setInterval(() => this.fire(name, false), cfg.repeat);
    }, cfg.first);
  }

  cancel() {
    const h = this.held;
    if (!h) return;
    clearTimeout(h.timer);
    clearInterval(h.repeat);
    this.held = null;
  }

  refresh() {
    if (this.held && !this.holdEnabled(this.held.name)) this.cancel();
  }

  #pointerDown(name, e) {
    if (!e.isPrimary || e.button !== 0 || this.held || !this.holdEnabled(name)) return;
    const btn = this.els[name];
    if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    this.#begin(name, false);
  }

  // Touch on the ring: the wedge under the finger behaves as a press of that button.
  ringHold(name) {
    if (HOLDS[name] && !this.held && this.holdEnabled(name)) this.#begin(name, false);
  }

  ringRelease(name) {
    const fired = this.held?.name === name && this.held.fired;
    if (this.held?.name === name) this.cancel();
    return fired;
  }

  #release(name) { if (this.held?.name === name) this.cancel(); }
  #abandon(name) { if (this.held?.name === name) this.cancel(); }

  #keyDown(name, e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.repeat || this.held) return;
    if (this.holdEnabled(name)) this.#begin(name, true);
    else this.held = { name, keyboard: true, fired: false, timer: 0, repeat: 0 };
  }

  #keyUp(name, e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    const h = this.held;
    if (!h?.keyboard || h.name !== name) return;
    const fired = h.fired;
    this.cancel();
    if (!fired) this.device.press(name);
  }
}
