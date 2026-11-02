export const LIST_TIERS = [1, 2, 3, 5, 8, 13, 21, 34];
export const SEEK_TIERS = [1, 2, 3, 5];
const VOLUME_STEP = 4.5;
const VOLUME_CLICK = 450 / 22;
const REVERSAL = 8;
export const TOUCH_SLOP = 8;

export class Accel {
  constructor(tiers) { this.tiers = tiers; this.reset(); }

  reset() { this.s = 0; this.dir = 0; this.last = null; this.start = null; }

  update(dir, speed, active) {
    if (!active) { this.reset(); return this.tiers[0]; }
    const now = performance.now();
    const stale = this.last !== null && now - this.last > 250;
    this.last = now;
    const v = Math.min(speed, 400);
    if (dir !== this.dir || stale) {
      this.s = v;
      this.dir = dir;
      this.start = null;
    } else {
      this.s += 0.15 * (v - this.s);
    }
    if (this.s <= 180) { this.start = null; return this.tiers[0]; }
    this.start ??= now;
    return this.tiers[Math.min(Math.floor((now - this.start) / 500), this.tiers.length - 1)];
  }
}

function segmentDistance(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(ax, ay);
  const t = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export class Wheel {
  dragStepDegrees = 15;
  pointerId = null;
  dragSource = null;
  touch = null;

  constructor(device, wheelEl, ringEl) {
    this.device = device;
    this.wheelEl = wheelEl;
    this.ring = ringEl;
    this.fine = matchMedia("(any-pointer: fine)");
    this.listTracker = new Accel(LIST_TIERS);
    this.seekTracker = new Accel(SEEK_TIERS);
    this.#resetDrag();

    ringEl.addEventListener("pointerdown", (e) => this.#down(e));
    ringEl.addEventListener("pointermove", (e) => this.#move(e));
    ringEl.addEventListener("pointerup", (e) => this.#end(e));
    ringEl.addEventListener("pointercancel", (e) => this.#end(e));
    ringEl.addEventListener("lostpointercapture", (e) => this.#end(e));
    wheelEl.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse" && this.fine.matches && (e.width || e.height)) this.focusRing();
    });
    wheelEl.addEventListener("pointerdown", (e) => this.#touchDown(e));
    wheelEl.addEventListener("pointermove", (e) => this.#touchMove(e));
    wheelEl.addEventListener("pointerup", (e) => this.#touchEnd(e, true));
    wheelEl.addEventListener("pointercancel", (e) => this.#touchEnd(e, false));
    wheelEl.addEventListener("contextmenu", (e) => { if (this.touch) e.preventDefault(); });
  }

  // Touch, on the product page only. The buttons' visible band is thin at small scales,
  // so a still touch on the ring presses the wedge under it, and a finger that starts
  // anywhere on the wheel and moves turns it.
  wedgeAt(e) {
    const g = this.#geometry();
    const x = e.clientX - g.cx, y = e.clientY - g.cy;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "forward" : "back";
    return y < 0 ? "menu" : "play";
  }

  // The restart chord took this touch over, so its release must not press anything.
  dropTouch() { this.touch = null; }

  #touchDown(e) {
    if (e.pointerType !== "touch" || !e.isPrimary || !this.device.importEnabled || this.touch) return;
    const wedge = e.target === this.ring ? this.wedgeAt(e) : null;
    this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, wedge, moved: false };
    if (wedge) this.device.buttons.ringHold(wedge);
  }

  #touchMove(e) {
    const t = this.touch;
    if (!t || t.moved || e.pointerId !== t.id) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < TOUCH_SLOP) return;
    t.moved = true;
    this.device.buttons.cancel();
    if (this.pointerId !== null) return;
    const g = this.#geometry();
    this.pointerId = e.pointerId;
    this.ring.setPointerCapture(e.pointerId);
    this.#resetDrag();
    this.prev = { x: t.x - g.cx, y: t.y - g.cy, t: e.timeStamp };
    this.enterDragging("pointer");
  }

  #touchEnd(e, released) {
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    this.touch = null;
    const { buttons } = this.device;
    if (t.moved || !t.wedge) return;
    if (!released) { buttons.cancel(); return; }
    if (!buttons.ringRelease(t.wedge)) this.device.press(t.wedge);
  }

  focusRing() { this.ring.focus({ preventScroll: true }); }

  #resetDrag() {
    this.accum = 0;
    this.clickAccum = 0;
    this.volumeChanged = false;
    this.lastStep = 0;
    this.lastVolume = false;
    this.prev = null;
    this.direction = 0;
    this.reversal = 0;
  }

  #geometry() {
    const r = this.ring.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, radius: Math.min(r.width, r.height) / 2 };
  }

  enterDragging(source) {
    if (this.dragSource) return;
    this.dragSource = source;
    this.wheelEl.classList.add("dragging");
    if (!this.device.loading) this.device.modes.dragStart();
  }

  leaveDragging(source) {
    if (this.dragSource !== source) return;
    this.dragSource = null;
    this.wheelEl.classList.remove("dragging");
    this.device.modes.dragEnd();
  }

  #down(e) {
    if (e.pointerType === "mouse" && this.fine.matches) this.focusRing();
    if (this.pointerId !== null) return;
    const g = this.#geometry();
    const x = e.clientX - g.cx, y = e.clientY - g.cy;
    const d2 = x * x + y * y;
    const inner = 0.3623 * g.radius;
    if (d2 > g.radius * g.radius + 1e-6 || d2 < inner * inner) return;
    this.pointerId = e.pointerId;
    this.ring.setPointerCapture(e.pointerId);
    this.#resetDrag();
    this.prev = { x, y, t: e.timeStamp };
    this.enterDragging("pointer");
  }

  #end(e) {
    if (e.pointerId !== this.pointerId) return;
    const id = this.pointerId;
    this.pointerId = null;
    if (this.ring.hasPointerCapture(id)) this.ring.releasePointerCapture(id);
    this.#resetDrag();
    this.leaveDragging("pointer");
  }

  #move(e) {
    if (e.pointerId !== this.pointerId) return;
    const g = this.#geometry();
    const x = e.clientX - g.cx, y = e.clientY - g.cy;
    const p = this.prev;
    this.prev = { x, y, t: e.timeStamp };
    if (segmentDistance(p.x, p.y, x, y) < 0.1 * g.radius) return;

    let delta = (Math.atan2(y, x) - Math.atan2(p.y, p.x)) * 180 / Math.PI;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    if (delta === 0) return;

    const sign = Math.sign(delta);
    if (!this.direction || sign === this.direction) {
      this.direction = sign;
      this.reversal = 0;
    } else {
      this.reversal += Math.abs(delta);
      if (this.reversal < REVERSAL) return;
      this.direction = sign;
      this.reversal = 0;
    }
    const degrees = Math.abs(delta);
    const elapsed = e.timeStamp - p.t;
    this.#scroll(sign, degrees, elapsed > 0 ? degrees / elapsed * 1000 : 0);
  }

  #scroll(step, degrees, speed) {
    const d = this.device;
    d.activity();
    if (d.inert) return;
    const target = d.scrollTarget;
    const listRows = this.listTracker.update(step, speed, target === "list");
    const seekSeconds = this.seekTracker.update(step, speed, target === "seek");
    if (target === "brick") {
      d.brick?.turn(step * degrees / 360);
      return;
    }
    const isVolume = target === "volume";
    if (step !== this.lastStep || isVolume !== this.lastVolume) {
      this.accum = 0;
      this.clickAccum = 0;
    }
    this.lastStep = step;
    this.lastVolume = isVolume;
    this.accum += degrees;

    if (isVolume) {
      const count = Math.floor(this.accum / VOLUME_STEP);
      if (count >= 1) {
        this.accum -= count * VOLUME_STEP;
        if (d.modes.volumeStep(step * count)) this.volumeChanged = true;
      }
      this.clickAccum += degrees;
      const n = Math.floor(this.clickAccum / VOLUME_CLICK);
      if (n >= 1) {
        this.clickAccum -= n * VOLUME_CLICK;
        if (this.volumeChanged) {
          d.click(n);
          this.volumeChanged = false;
        }
      }
      return;
    }

    const size = this.dragStepDegrees;
    const count = Math.floor(this.accum / size);
    if (count >= 1) {
      this.accum -= count * size;
      if (target === "seek") {
        d.modes.scrubStep(step * count * seekSeconds);
      } else if (d.nav.move(step * count * listRows)) {
        d.click(count);
      }
    }
    if (target === "seek") d.modes.touchScrub();
  }
}
