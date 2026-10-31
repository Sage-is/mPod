import { reducedMotion } from "./util.js";

const SLIDE_MS = 240;
const inOut = (t) => -0.5 * (Math.cos(Math.PI * t) - 1);
const sine = (t) => Math.sin(Math.PI * t / 2);

export class Slider {
  current = null;
  moving = new Map();
  raf = 0;

  constructor(body, isRtl) {
    this.body = body;
    this.isRtl = isRtl;
  }

  #place(view, x) { view.el.style.transform = x ? `translateX(${x}px)` : ""; }

  #remove(view) {
    this.moving.delete(view);
    view.el.remove();
    view.destroy?.();
  }

  #run(view, from, to, duration, ease, leaving) {
    if (duration <= 0 || from === to) {
      if (leaving) this.#remove(view);
      else { this.moving.delete(view); this.#place(view, to); }
      return;
    }
    this.#place(view, from);
    this.moving.set(view, { from, to, duration, ease, leaving, x: from, start: performance.now() });
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.#frame(t));
  }

  #frame() {
    this.raf = 0;
    const now = performance.now();
    for (const [view, a] of [...this.moving]) {
      const p = Math.min(1, (now - a.start) / a.duration);
      a.x = a.from + (a.to - a.from) * a.ease(p);
      this.#place(view, a.x);
      if (p < 1) continue;
      if (a.leaving) this.#remove(view);
      else this.moving.delete(view);
    }
    if (this.moving.size) this.raf = requestAnimationFrame((t) => this.#frame(t));
  }

  // dir: 1 push, -1 pop, 0 first show
  show(view, dir) {
    const { body } = this;
    const w = body.clientWidth;
    const old = this.current;
    this.current = view;
    body.append(view.el);

    if (!dir || !w || reducedMotion() || document.visibilityState === "hidden") {
      for (const leftover of [...this.moving.keys()]) this.#remove(leftover);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (old) this.#remove(old);
      this.#place(view, 0);
      return;
    }

    const side = dir * (this.isRtl() ? -1 : 1);
    let from = side * w;
    let duration = SLIDE_MS;
    let ease = inOut;
    for (const [other, a] of this.moving) {
      if (!a.leaving || Math.sign(a.to) !== side) continue;
      from = a.x;
      duration = SLIDE_MS * Math.abs(a.x) / w;
      ease = sine;
      this.#remove(other);
      break;
    }

    if (old) {
      const entering = this.moving.get(old);
      const far = -side * w;
      if (entering && !entering.leaving) {
        const distance = Math.abs(far - entering.x);
        this.#run(old, entering.x, far, SLIDE_MS * Math.min(1, distance / w), sine, true);
      } else {
        this.#run(old, 0, far, SLIDE_MS, inOut, true);
      }
    }
    this.#run(view, from, 0, duration, ease, false);
  }

  clear() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const view of [...this.moving.keys()]) this.#remove(view);
    if (this.current) this.#remove(this.current);
    this.current = null;
  }
}
