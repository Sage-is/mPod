import { CONTRASTS, EQ_PRESETS } from "./eq-presets.js";

const KEY = "pod-player:settings";
const SHUFFLE = ["off", "songs", "albums"];
const REPEAT = ["off", "one", "all"];
const CLICKER = ["on", "off"];
export const BACKLIGHT_MODES = ["off", "1sec", "2sec", "3sec", "5sec", "always_on"];
const NAME_MAX = 12;

class SettingsStore {
  listeners = new Set();
  chosen = false;
  frozen = false;
  product = false;
  held = {};

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
    return {
      shuffle: "off", repeat: "off", clicker: "on", volume: 50, backlight: this.#defaultBacklight(), name: "",
      eq: "off", contrast: "normal",
    };
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
    if (typeof data.name === "string") v.name = data.name.trim().slice(0, NAME_MAX);
    if (EQ_PRESETS.some((preset) => preset.id === data.eq)) v.eq = data.eq;
    if (CONTRASTS.some((choice) => choice.id === data.contrast)) v.contrast = data.contrast;
    if (data.backlightChosen === true && BACKLIGHT_MODES.includes(data.backlight)) {
      v.backlight = data.backlight;
      this.chosen = true;
    }
  }

  // The element does not know its page until it connects, so these two follow the first read.
  useProduct() {
    this.product = true;
    this.#write();
  }

  // Spec 40: other pages read these fields as defaults. Spec 42: they still keep what is stored.
  useDefaults() {
    const v = this.values;
    if (v.shuffle === "albums") this.held.shuffle = "albums";
    if (v.eq !== "off") this.held.eq = v.eq;
    if (v.contrast !== "normal") this.held.contrast = v.contrast;
    if (v.shuffle === "albums") v.shuffle = "off";
    v.eq = "off";
    v.contrast = "normal";
  }

  // Spec 41: a window that lost the lock keeps its values and stores nothing more.
  freeze() { this.frozen = true; }

  #write() {
    if (this.frozen) return;
    const { shuffle, repeat, clicker, volume, backlight, name, eq, contrast } = this.values;
    const out = { shuffle, repeat, clicker, volume };
    if (this.product) Object.assign(out, { name, eq, contrast });
    else {
      if (name) out.name = name;
      if (eq !== "off") out.eq = eq;
      if (contrast !== "normal") out.contrast = contrast;
    }
    Object.assign(out, this.held);
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
    delete this.held[field];
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
    delete this.held.shuffle;
    this.#write();
    this.#emit();
  }
}

let store = null;
export const settingsStore = () => (store ??= new SettingsStore());
