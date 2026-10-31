const KEY = "pod-player:settings";
const SHUFFLE = ["off", "songs"];
const REPEAT = ["off", "one", "all"];
const CLICKER = ["on", "off"];
export const BACKLIGHT_MODES = ["off", "1sec", "2sec", "3sec", "5sec", "always_on"];

class SettingsStore {
  listeners = new Set();
  chosen = false;

  constructor() {
    this.media = matchMedia("(prefers-color-scheme: dark)");
    this.values = this.#defaults();
    this.#read();
    this.#write();
    this.media.addEventListener("change", () => {
      if (this.chosen) return;
      this.values.backlight = this.#defaultBacklight();
      this.#emit();
    });
  }

  #defaultBacklight() { return this.media.matches ? "always_on" : "off"; }

  #defaults() {
    return { shuffle: "off", repeat: "off", clicker: "on", volume: 50, backlight: this.#defaultBacklight() };
  }

  #read() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (err) {
      console.warn("pod-player: settings read failed", err);
    }
    if (raw === null) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn("pod-player: settings parse failed", err);
      return;
    }
    if (!data || typeof data !== "object") return;
    const v = this.values;
    if (SHUFFLE.includes(data.shuffle)) v.shuffle = data.shuffle;
    if (REPEAT.includes(data.repeat)) v.repeat = data.repeat;
    if (CLICKER.includes(data.clicker)) v.clicker = data.clicker;
    if (typeof data.volume === "number" && Number.isFinite(data.volume) && data.volume >= 0 && data.volume <= 100) {
      v.volume = data.volume;
    }
    if (data.backlightChosen === true && BACKLIGHT_MODES.includes(data.backlight)) {
      v.backlight = data.backlight;
      this.chosen = true;
    }
  }

  #write() {
    const { shuffle, repeat, clicker, volume, backlight } = this.values;
    const out = { shuffle, repeat, clicker, volume };
    if (this.chosen) Object.assign(out, { backlight, backlightChosen: true });
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (err) {
      console.warn("pod-player: settings write failed", err);
    }
  }

  #emit() { for (const fn of this.listeners) fn(this.values); }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(field, value) {
    if (this.values[field] === value) return;
    this.values[field] = value;
    this.#write();
    this.#emit();
  }

  chooseBacklight(mode) {
    this.chosen = true;
    this.values.backlight = mode;
    this.#write();
    this.#emit();
  }

  reset() {
    this.chosen = false;
    this.values = this.#defaults();
    this.#write();
    this.#emit();
  }
}

let store = null;
export const settingsStore = () => (store ??= new SettingsStore());
