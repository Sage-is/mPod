import { deepActiveElement, el } from "./util.js";

export const NAME_LIMIT = 12;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -.'&";
const RING = [...LETTERS, "delete", "done"];

export class NameView {
  index = 0;

  constructor(device) {
    this.device = device;
    this.draft = device.deviceName;
    this.el = el("div", "pane name-pane", { role: "group", tabindex: "0", "aria-labelledby": device.titleId });
    this.text = el("span", "name-text");
    this.letter = el("div", "name-letter", { "aria-live": "polite" });
    const line = el("div", "name-line");
    line.append(this.text, el("i", "name-cursor", { "aria-hidden": "true" }));
    this.el.append(line, this.letter);
    this.onKey = (e) => this.#key(e);
    window.addEventListener("keydown", this.onKey, true);
  }

  get focusTarget() { return this.el; }

  get letterLabel() {
    const s = this.device.strings;
    const item = RING[this.index];
    if (item === " ") return s.t("space");
    return item.length > 1 ? s.t(item) : item;
  }

  turn(delta) {
    this.index = (((this.index + delta) % RING.length) + RING.length) % RING.length;
    this.device.invalidate();
    return true;
  }

  #add(letter) {
    if (this.draft.length >= NAME_LIMIT) return;
    this.draft += letter;
    this.device.invalidate();
  }

  #delete() {
    if (!this.draft) return;
    this.draft = this.draft.slice(0, -1);
    this.device.invalidate();
  }

  #done() {
    const d = this.device;
    const name = this.draft.trim();
    d.settings.set("name", name === d.defaultName ? "" : name);
    d.nav.pop();
  }

  select() {
    const item = RING[this.index];
    if (item === "delete") this.#delete();
    else if (item === "done") this.#done();
    else this.#add(item);
  }

  #key(e) {
    const d = this.device;
    if (d.view !== this || d.inert || e.ctrlKey || e.metaKey || e.altKey) return;
    const active = deepActiveElement();
    if (active && active !== document.body && !d.shadowRoot.contains(active)) return;
    if (e.key === "Backspace") this.#delete();
    else if (e.key === "Enter") { if (!e.repeat) this.#done(); }
    else if (e.key.length === 1 && LETTERS.includes(e.key)) this.#add(e.key);
    else return;
    e.preventDefault();
    e.stopPropagation();
    d.activity();
  }

  update() {
    this.text.textContent = this.draft;
    this.letter.textContent = this.letterLabel;
  }

  destroy() { window.removeEventListener("keydown", this.onKey, true); }
}
