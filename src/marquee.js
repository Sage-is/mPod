import { el, reducedMotion } from "./util.js";

const GAP = 30;
const SECONDS_PER_PX = 0.05;
const DELAY_MS = 2000;

export class Marquee {
  constructor() {
    this.el = el("div", "marquee");
    this.track = el("div", "marquee-track");
    this.el.append(this.track);
    this.key = null;
    this.overflowing = false;
    this.animation = null;
    this.observer = new ResizeObserver(() => this.#measure());
    this.observer.observe(this.el);
    this.onActivate = null;
  }

  #primary(text, href) {
    const span = el("span", "marquee-text", { dir: "auto" });
    if (href) {
      const a = el("a", "song-link", { href });
      a.textContent = text;
      a.addEventListener("click", (e) => this.onActivate?.(e, a));
      span.append(a);
    } else {
      span.textContent = text;
    }
    return span;
  }

  set(text, songKey, href) {
    const key = `${songKey}\u0000${text}\u0000${href ?? ""}`;
    if (key === this.key) return;
    this.key = key;
    this.text = text;
    this.#stop();
    this.overflowing = false;
    this.el.classList.remove("overflow");
    this.primary = this.#primary(text, href);
    this.track.replaceChildren(this.primary);
    this.observer.observe(this.primary);
    this.#measure();
  }

  #stop() {
    this.animation?.cancel();
    this.animation = null;
  }

  #measure() {
    if (!this.primary) return;
    const width = this.primary.offsetWidth;
    const over = width - this.el.clientWidth > 1;
    if (over === this.overflowing && (!over || this.width === width)) return;
    this.overflowing = over;
    this.width = width;
    this.#stop();
    this.track.querySelector(".marquee-dup")?.remove();
    this.track.querySelector(".marquee-gap")?.remove();
    this.el.classList.toggle("overflow", over);
    if (!over || reducedMotion()) {
      this.el.classList.toggle("static", over);
      return;
    }
    this.el.classList.remove("static");
    const gap = el("span", "marquee-gap");
    const dup = el("span", "marquee-text marquee-dup", { "aria-hidden": "true", dir: "auto" });
    dup.textContent = this.text;
    this.track.append(gap, dup);
    const distance = width + GAP;
    const rtl = getComputedStyle(this.primary).direction === "rtl";
    this.track.style.direction = rtl ? "rtl" : "ltr";
    this.animation = this.track.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${rtl ? distance : -distance}px)` }],
      { duration: distance * SECONDS_PER_PX * 1000, delay: DELAY_MS, iterations: Infinity, easing: "linear" },
    );
  }

  destroy() {
    this.#stop();
    this.observer.disconnect();
  }
}
