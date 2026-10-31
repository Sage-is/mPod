import { el } from "./util.js";

export class ListView {
  constructor(device) {
    this.device = device;
    this.nav = device.nav.navCount;
    this.el = el("div", "pane list-pane");
    this.list = el("div", "list", { role: "listbox", tabindex: "0", "aria-labelledby": device.titleId });
    this.el.append(this.list);
    this.keys = [];
    this.lastSelection = -1;
    this.restore = device.nav.scrollRestore;
  }

  get focusTarget() { return this.list; }
  get scrollTop() { return this.list.scrollTop; }

  #buildRow(row, index) {
    const node = el("div", "row");
    node.id = `pod-row-${this.nav}-${index}`;
    if (row.kind === "info") node.classList.add("info");
    else node.setAttribute("role", "option");
    if (row.center) node.classList.add("center");
    if (row.kind === "toggle") node.classList.add("toggle");
    const title = el("span", "row-title", { dir: "auto" });
    title.textContent = row.text;
    node.append(title);
    if (row.value !== null) {
      const value = el("span", "row-value", { dir: "auto" });
      value.textContent = row.value;
      node.append(value);
    }
    if (row.kind === "navigate") node.append(el("i", "chev", { "aria-hidden": "true" }));
    return node;
  }

  update() {
    const { nav } = this.device;
    const rows = nav.rows;
    const keys = rows.map((r) => `${r.id}\u0000${r.kind}\u0000${r.text}\u0000${r.value}`);
    let rebuilt = false;
    for (let i = 0; i < rows.length; i++) {
      if (this.keys[i] === keys[i]) continue;
      const node = this.#buildRow(rows[i], i);
      const old = this.list.children[i];
      if (old) old.replaceWith(node);
      else this.list.append(node);
      rebuilt = true;
    }
    while (this.list.children.length > rows.length) this.list.lastChild.remove();
    this.keys = keys;

    const selection = nav.selection;
    const mark = (node, on) => {
      if (!node) return;
      node.classList.toggle("selected", on);
      if (node.getAttribute("role") === "option") node.setAttribute("aria-selected", on ? "true" : "false");
    };
    if (rebuilt || this.lastSelection < 0) {
      Array.from(this.list.children).forEach((node, i) => mark(node, i === selection));
    } else if (selection !== this.lastSelection) {
      mark(this.list.children[this.lastSelection], false);
      mark(this.list.children[selection], true);
    }
    const active = this.list.children[selection];
    if (active) this.list.setAttribute("aria-activedescendant", active.id);
    else this.list.removeAttribute("aria-activedescendant");

    if (this.restore !== null && this.restore !== undefined) {
      this.list.scrollTop = this.restore;
      this.restore = null;
    }
    if (selection !== this.lastSelection || rebuilt) this.#scrollToSelection(active);
    this.lastSelection = selection;
  }

  #scrollToSelection(row) {
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    const { list } = this;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  resetScroll() {
    this.list.scrollTop = 0;
    this.lastSelection = -1;
  }
}
