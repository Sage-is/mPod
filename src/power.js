import { showBars } from "./battery.js";
import { TOUCH_SLOP } from "./wheel.js";

const AUTO_OFF = 120000;
const RESTART_HOLD = 5000;
const WORKER_WAIT = 5000;
const CHORD_KEYS = { " ": "play", Spacebar: "play", Escape: "menu" };

const stop = (e) => { e.stopPropagation(); e.preventDefault(); };

// Spec 39: the off state, the auto-off timer and the restart chord. Every press in the device
// passes through here first, so a press that wakes can stop before anything acts, and a press
// that completes the chord can cancel the first one's hold (42 exempts it from 05's rule).
export class Power {
  off = false;
  autoOffMs = AUTO_OFF;
  timer = 0;
  chord = 0;
  down = new Map();
  eatClick = false;
  eatClicks = false;

  constructor(device) {
    this.device = device;
    this.wheelEl = device.parts.wheel;
    this.body = device.parts.device;
    this.onPointerDown = (e) => this.#pointerDown(e);
    this.onPointerMove = (e) => this.#pointerMove(e);
    this.onPointerUp = (e) => this.#release(`pointer ${e.pointerId}`);
    this.onKeyDown = (e) => this.#keyDown(e);
    this.onKeyUp = (e) => this.#release(`key ${e.key}`);
    this.onClick = (e) => this.#click(e);
    this.onBlur = () => this.#clear();
  }

  start() {
    this.wheelEl.addEventListener("pointerdown", this.onPointerDown, true);
    this.body.addEventListener("keydown", this.onKeyDown, true);
    this.body.addEventListener("keyup", this.onKeyUp, true);
    this.body.addEventListener("click", this.onClick, true);
    window.addEventListener("pointermove", this.onPointerMove, true);
    window.addEventListener("pointerup", this.onPointerUp, true);
    window.addEventListener("pointercancel", this.onPointerUp, true);
    window.addEventListener("blur", this.onBlur);
  }

  stop() {
    this.wheelEl.removeEventListener("pointerdown", this.onPointerDown, true);
    this.body.removeEventListener("keydown", this.onKeyDown, true);
    this.body.removeEventListener("keyup", this.onKeyUp, true);
    this.body.removeEventListener("click", this.onClick, true);
    window.removeEventListener("pointermove", this.onPointerMove, true);
    window.removeEventListener("pointerup", this.onPointerUp, true);
    window.removeEventListener("pointercancel", this.onPointerUp, true);
    window.removeEventListener("blur", this.onBlur);
    this.#clear();
    clearTimeout(this.timer);
    this.timer = 0;
  }

  // Off

  enter() {
    if (this.off) return;
    const d = this.device;
    const pb = d.playback;
    if (d.nav.top.key === "brick") d.nav.pop();
    this.off = true;
    if (pb.queue.length) pb.pause();
    d.backlight.sleep();
    d.invalidate();
  }

  wake() {
    if (!this.off) return;
    const d = this.device;
    this.off = false;
    d.graph?.unlock();
    d.backlight.wake();
    d.invalidate();
  }

  #arm() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = 0;
      if (this.#eligible) this.enter();
    }, this.autoOffMs);
  }

  get #eligible() {
    const d = this.device;
    const { key } = d.nav.top;
    return !d.halted && !d.playback.playing && !d.playback.starting && key !== "brick" && key !== "name";
  }

  update() {
    const eligible = this.#eligible;
    if (eligible && !this.timer) this.#arm();
    else if (!eligible && this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
  }

  activity() { if (this.timer) this.#arm(); }

  // Presses

  // Returns true when this press belongs to the chord, so nothing else may see it.
  #pressed(source, press) {
    if (!press) return false;
    this.down.set(source, press);
    if (this.chord) return true;
    const names = new Set([...this.down.values()].map(({ name }) => name));
    if (!names.has("play") || !names.has("menu")) return false;
    const d = this.device;
    d.buttons.cancel();
    d.ringKeys.cancel();
    d.wheel.dropTouch();
    this.eatClicks = true;
    this.chord = setTimeout(() => this.restart(), RESTART_HOLD);
    return true;
  }

  // A fresh press ends any eating of clicks, whichever way it comes.
  #freshPress() {
    if (this.down.size) return;
    this.eatClick = false;
    this.eatClicks = false;
  }

  #release(source) {
    if (!this.down.delete(source)) return;
    clearTimeout(this.chord);
    this.chord = 0;
  }

  #clear() {
    this.down.clear();
    clearTimeout(this.chord);
    this.chord = 0;
  }

  // Spec 43: a finger that turns the wheel is not a press. The wheel lets go of a finger in the
  // chord, and never sees one that joined it, so the chord watches them itself.
  #pointerMove(e) {
    const source = `pointer ${e.pointerId}`;
    const press = this.down.get(source);
    if (press?.touch && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= TOUCH_SLOP) this.#release(source);
  }

  #buttonAt(e) {
    const d = this.device;
    const { menu, play } = d.buttonEls;
    const button = e.target.closest?.("button");
    if (button === menu) return "menu";
    if (button === play) return "play";
    if (e.pointerType !== "touch" || button) return null;
    const wedge = d.wheel.wedgeAt(e);
    return wedge === "menu" || wedge === "play" ? wedge : null;
  }

  #pointerDown(e) {
    this.#freshPress();
    const name = this.#buttonAt(e);
    const press = name && { name, touch: e.pointerType === "touch", x: e.clientX, y: e.clientY };
    const inChord = this.#pressed(`pointer ${e.pointerId}`, press);
    if (this.off) {
      this.wake();
      this.eatClick = true;
      stop(e);
    } else if (inChord) {
      stop(e);
    }
  }

  #keyDown(e) {
    const d = this.device;
    if (e.repeat) {
      if (this.off) stop(e);
      return;
    }
    this.#freshPress();
    const name = e.target === d.parts.ring ? CHORD_KEYS[e.key] : null;
    const inChord = this.#pressed(`key ${e.key}`, name && { name });
    if (this.off) {
      this.wake();
      if (!e.ctrlKey && !e.metaKey && !e.altKey) stop(e);
    } else if (inChord) {
      stop(e);
    }
  }

  // A wake swallows its one click, as after a hold. The chord eats them all until a fresh press.
  #click(e) {
    if (!this.eatClick && !this.eatClicks) return;
    this.eatClick = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  // Restart

  async restart() {
    await this.device.resume?.save();
    const worker = await navigator.serviceWorker?.getRegistration?.().then((r) => r?.waiting, () => null);
    if (worker) {
      await new Promise((done) => {
        setTimeout(done, WORKER_WAIT);
        worker.addEventListener("statechange", () => { if (worker.state === "activated") done(); });
        worker.postMessage("skipWaiting");
      });
    }
    location.reload();
  }

  // Drawing

  render() {
    const { parts, battery, strings: s } = this.device;
    parts.power.hidden = !this.off;
    parts.battery.hidden = !battery.known;
    const charging = this.off && battery.known && battery.charging && (!battery.full || battery.sawCharging);
    parts.power.classList.toggle("charging", charging);
    if (charging) {
      parts.powerTitle.textContent = s.t(battery.full ? "charged" : "charging");
      showBars(parts.powerBattery, battery.bars);
    }
    if (battery.known) showBars(parts.battery, battery.bars);
  }
}
