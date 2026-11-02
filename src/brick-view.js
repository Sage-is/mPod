import { BALL_R, BRICK_H, BRICK_W, BrickGame, FIELD_H, FIELD_W, PADDLE_H, PADDLE_W, PADDLE_Y, STEER } from "./brick.js";
import { el } from "./util.js";

const LIT_BY_PADDLE = 2;
const EPS = 1 / 255;

export class BrickView {
  raf = 0;
  woke = true;
  last = 0;
  acc = 0;
  dirty = true;
  first = true;
  steerDir = 0;
  steerMoved = false;

  constructor(device) {
    this.device = device;
    this.game = new BrickGame();
    this.el = el("div", "pane brick");
    this.canvas = el("canvas", "brick-canvas", { "aria-hidden": "true" });
    this.canvas.width = FIELD_W;
    this.canvas.height = FIELD_H;
    this.status = el("p", "vh", { role: "status" });
    this.el.append(this.canvas, this.status);
    this.ctx = this.canvas.getContext("2d");
    const cells = FIELD_W * FIELD_H;
    this.cells = new Uint8Array(cells);
    this.mid = new Float32Array(cells);
    this.ink = new Float32Array(cells);
    this.litBy = new Uint8Array(cells);
    this.observer = new ResizeObserver(() => this.#resize());
    this.observer.observe(device);
    this.onResolution = () => { this.#resize(); this.#watchResolution(); };
    this.#watchResolution();
    this.statusKey = null;
  }

  get focusTarget() { return null; }

  #watchResolution() {
    this.resolution?.removeEventListener("change", this.onResolution);
    this.resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.resolution.addEventListener("change", this.onResolution);
  }

  #resize() {
    const wanted = Math.round(this.canvas.clientWidth * this.device.deviceScale * devicePixelRatio);
    const width = wanted >= FIELD_W * 3 ? wanted : FIELD_W;
    const height = width === FIELD_W ? FIELD_H : Math.round(width * FIELD_H / FIELD_W);
    if (this.image && width === this.canvas.width) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.image = this.ctx.createImageData(width, height);
    const axis = (size, cells) => {
      const s = size / cells;
      const cell = new Uint16Array(size);
      const factor = new Float32Array(size);
      for (let p = 0; p < size; p++) {
        cell[p] = Math.min(cells - 1, Math.floor((p + 0.5) / s));
        if (s <= 1) { factor[p] = 1; continue; }
        const b = Math.round((p + 0.5) / s) * s;
        factor[p] = 1 - 0.3 * Math.max(0, 1 - Math.abs(p + 0.5 - b));
      }
      return { cell, factor };
    };
    this.xs = axis(width, FIELD_W);
    this.ys = axis(height, FIELD_H);
    const m = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/.exec(getComputedStyle(this.canvas).color);
    this.rgb = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [72, 70, 71];
    this.dirty = true;
    this.wake();
  }

  update() {
    if (!this.image) this.#resize();
    const message = this.message;
    if (message !== this.statusKey) {
      this.statusKey = message;
      this.status.textContent = message;
    }
    this.wake();
  }

  get message() {
    const key = this.game.message;
    return key ? this.device.strings.t(key) : "";
  }

  wake() {
    if (this.raf || this.destroyed || !this.#needsFrame(false)) return;
    this.woke = true;
    this.raf = requestAnimationFrame((now) => this.#frame(now));
  }

  #needsFrame(fading) {
    const { game } = this;
    const running = !this.device.halted && (game.inPlay || game.countdown > 0 || this.steerDir !== 0);
    return running || this.dirty || fading;
  }

  #frame(now) {
    this.raf = 0;
    const dt = this.woke ? 0 : now - this.last;
    this.woke = false;
    this.last = now;
    const { game } = this;
    const paused = this.device.halted;
    let tick = game.tickMs;
    const before = `${game.balls}|${game.score}|${game.message}`;
    this.acc = Math.min(this.acc + dt, tick * 10);
    while (this.acc >= tick) {
      this.acc -= tick;
      if (paused) continue;
      if (this.steerDir) {
        game.movePaddle(this.steerDir * STEER);
        this.steerMoved = true;
      }
      game.tick();
      this.dirty = true;
      tick = game.tickMs;
    }
    if (this.dirty) {
      this.#draw();
      this.dirty = false;
    }
    const fading = this.#fade(dt);
    this.#paint();
    if (before !== `${game.balls}|${game.score}|${game.message}`) this.device.invalidate();
    if (this.#needsFrame(fading)) {
      this.raf = requestAnimationFrame((t) => this.#frame(t));
    }
  }

  #fill(x, y, w, h, value) {
    const left = Math.round(x), top = Math.round(y);
    const x0 = Math.max(0, left), x1 = Math.min(FIELD_W, left + w);
    const y0 = Math.max(0, top), y1 = Math.min(FIELD_H, top + h);
    for (let row = y0; row < y1; row++) {
      this.cells.fill(value, row * FIELD_W + x0, row * FIELD_W + Math.max(x0, x1));
    }
  }

  #draw() {
    const { game } = this;
    this.cells.fill(0);
    game.bricks.forEach((live, i) => {
      if (live) this.#fill(3 + 12 * (i % 12), 3 + 8 * Math.floor(i / 12), BRICK_W, BRICK_H, 1);
    });
    this.#fill(game.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, LIT_BY_PADDLE);
    this.#fill(game.x - BALL_R, game.y - BALL_R, 3, 3, 1);
  }

  #fade(dt) {
    const { cells, mid, ink, litBy } = this;
    if (this.first) {
      this.first = false;
      for (let i = 0; i < cells.length; i++) {
        ink[i] = mid[i] = cells[i] ? 1 : 0;
        if (cells[i]) litBy[i] = cells[i];
      }
      return false;
    }
    const attack = 1 - Math.exp(-dt / 20);
    const release = 1 - Math.exp(-dt / 70);
    const paddle = 1 - Math.exp(-dt / 25);
    let changing = false;
    for (let i = 0; i < cells.length; i++) {
      const target = cells[i] ? 1 : 0;
      if (cells[i]) litBy[i] = cells[i];
      if (Math.abs(target - mid[i]) > EPS || Math.abs(target - ink[i]) > EPS) {
        const rel = litBy[i] === LIT_BY_PADDLE ? paddle : release;
        mid[i] += (target - mid[i]) * (target > mid[i] ? attack : rel);
        ink[i] += (mid[i] - ink[i]) * (mid[i] > ink[i] ? attack : rel);
        changing = true;
      } else {
        mid[i] = ink[i] = target;
      }
    }
    return changing;
  }

  #paint() {
    const { image, xs, ys, ink, rgb } = this;
    if (!image) return;
    const { data, width, height } = image;
    let o = 0;
    for (let y = 0; y < height; y++) {
      const row = ys.cell[y] * FIELD_W;
      const fy = ys.factor[y];
      for (let x = 0; x < width; x++) {
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
        data[o + 3] = ink[row + xs.cell[x]] * xs.factor[x] * fy * 255;
        o += 4;
      }
    }
    this.ctx.putImageData(image, 0, 0);
  }

  select() {
    this.game.select();
    this.dirty = true;
    this.device.invalidate();
    this.wake();
  }

  turn(fraction) {
    if (this.game.movePaddle(fraction)) this.dirty = true;
    this.wake();
  }

  steerStart(dir) {
    this.steerDir = dir;
    this.steerMoved = false;
    this.wake();
  }

  steerEnd(tap) {
    const dir = this.steerDir;
    this.steerDir = 0;
    if (tap && dir && !this.steerMoved && !this.device.inert) this.turn(dir * STEER);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer.disconnect();
    this.resolution?.removeEventListener("change", this.onResolution);
  }
}
