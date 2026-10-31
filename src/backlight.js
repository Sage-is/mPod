const LIT_MS = { "1sec": 1000, "2sec": 2000, "3sec": 3000, "5sec": 5000 };

export class Backlight {
  constructor(mode, onChange) {
    this.mode = mode;
    this.onChange = onChange;
    this.lit = mode === "always_on";
    this.litBefore = this.lit;
    this.forcedOn = false;
    this.forcedOff = false;
    this.timer = 0;
  }

  #cancel() { clearTimeout(this.timer); this.timer = 0; }

  #set(lit) {
    if (this.lit === lit) return;
    this.lit = lit;
    this.onChange();
  }

  #wake() {
    this.#cancel();
    this.#set(true);
    this.timer = setTimeout(() => { this.timer = 0; this.#set(false); }, LIT_MS[this.mode]);
  }

  activity() {
    this.litBefore = this.lit;
    if (this.forcedOn) return;
    if (this.forcedOff) {
      this.forcedOff = false;
      this.#set(this.mode === "always_on");
    }
    if (LIT_MS[this.mode]) this.#wake();
  }

  toggle() {
    this.#cancel();
    this.forcedOn = !this.litBefore;
    this.forcedOff = this.litBefore;
    this.litBefore = this.forcedOn;
    this.#set(this.forcedOn);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.forcedOn = false;
    this.forcedOff = false;
    this.#cancel();
    if (mode === "always_on") this.#set(true);
    else if (mode === "off") this.#set(false);
    else this.activity();
  }

  stop() { this.#cancel(); }
}
