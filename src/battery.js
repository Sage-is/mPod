import { reducedMotion } from "./util.js";

const BARS = 4;
const STEP_MS = 500;

// Spec 39. Never shows a level it was not told: until the API answers, `known` is false.
export class Battery {
  known = false;
  level = 0;
  charging = false;
  sawCharging = false;
  step = 1;
  timer = 0;
  source = null;

  constructor(onChange) {
    this.onChange = onChange;
    this.onEvent = () => this.#read();
  }

  start() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then((source) => {
      this.source = source;
      source.addEventListener("levelchange", this.onEvent);
      source.addEventListener("chargingchange", this.onEvent);
      this.known = true;
      this.#read();
    }, () => {});
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    this.source?.removeEventListener("levelchange", this.onEvent);
    this.source?.removeEventListener("chargingchange", this.onEvent);
    this.source = null;
  }

  get full() { return this.level >= 1; }
  get animating() { return this.charging && !this.full && !reducedMotion(); }
  get bars() { return this.animating ? this.step : Math.ceil(this.level * BARS); }

  #read() {
    this.level = this.source.level;
    this.charging = this.source.charging;
    if (this.charging && !this.full) this.sawCharging = true;
    if (!this.animating) {
      clearInterval(this.timer);
      this.timer = 0;
    } else if (!this.timer) {
      this.step = 1;
      this.timer = setInterval(() => {
        this.step = this.step % BARS + 1;
        this.onChange();
      }, STEP_MS);
    }
    this.onChange();
  }
}

export function showBars(icon, count) {
  Array.from(icon.children).forEach((bar, i) => bar.classList.toggle("dim", i >= count));
}
