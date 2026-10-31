export const FIELD_W = 148;
export const FIELD_H = 101;
export const PADDLE_W = 30;
export const PADDLE_H = 4;
export const PADDLE_Y = 97;
export const BRICK_W = 10;
export const BRICK_H = 4;
export const BALL_R = 1.5;
const COLS = 12;
const TRAVEL = FIELD_W - PADDLE_W;
const SERVE_X = 1.5;
const SERVE_Y = 50.5;
const SERVE_V = 1.7;
const SPEED = Math.hypot(SERVE_V, SERVE_V);
export const STEER = 0.035;

export class BrickGame {
  constructor() { this.reset(); }

  reset() {
    this.level = 1;
    this.score = 0;
    this.balls = 3;
    this.paddleX = 59;
    this.over = false;
    this.countdown = 0;
    this.inPlay = false;
    this.#wall();
    this.#place();
  }

  get tickMs() { return 40 / Math.min(1 + 0.1 * (this.level - 1), 1.5); }

  get message() {
    if (this.over) return "gameOver";
    if (this.inPlay || this.countdown > 0) return "";
    return "launchPrompt";
  }

  #wall() {
    this.bricks = new Array(Math.min(this.level + 1, 5) * COLS).fill(true);
    this.remaining = this.bricks.length;
  }

  #place() {
    this.x = SERVE_X;
    this.y = SERVE_Y;
    this.dx = SERVE_V;
    this.dy = SERVE_V;
  }

  #serve() {
    this.#place();
    this.inPlay = false;
    this.countdown = Math.round(1000 / this.tickMs);
  }

  select() {
    if (this.over) { this.reset(); return; }
    this.countdown = 0;
    this.inPlay = true;
  }

  movePaddle(fraction) {
    if (this.over) return false;
    const next = Math.min(TRAVEL, Math.max(0, this.paddleX + fraction * TRAVEL));
    const moved = next !== this.paddleX;
    this.paddleX = next;
    return moved;
  }

  tick() {
    if (this.countdown > 0) {
      this.countdown -= 1;
      if (this.countdown === 0) this.inPlay = true;
    }
    if (!this.inPlay) return;

    const r = BALL_R;
    const wasAbove = this.y + r < PADDLE_Y;
    this.x += this.dx;
    this.y += this.dy;
    if ((this.x <= r && this.dx < 0) || (this.x >= FIELD_W - r && this.dx > 0)) this.dx = -this.dx;
    if (this.y <= r && this.dy < 0) this.dy = -this.dy;

    if (this.y >= FIELD_H) {
      this.balls -= 1;
      if (this.balls > 0) {
        this.#serve();
      } else {
        this.over = true;
        this.inPlay = false;
      }
      return;
    }

    if (this.dy > 0 && wasAbove && this.y + r >= PADDLE_Y
      && this.x + r >= this.paddleX && this.x - r <= this.paddleX + PADDLE_W) {
      this.#bounce();
    }

    if (this.#hitBrick() && this.remaining === 0) {
      this.level += 1;
      this.#wall();
      this.#serve();
    }
  }

  #bounce() {
    const a = Math.min(1, Math.max(-1, (this.x - (this.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2)));
    const v = SPEED * (1 + 0.25 * Math.abs(a));
    const u = 0.8 * a;
    const m = Math.hypot(u, 1);
    this.dx = v * u / m;
    this.dy = -v / m;
  }

  #hitBrick() {
    const { x, y, dx, dy, bricks } = this;
    const r = BALL_R;
    const s = Math.sign(dx);
    for (let i = 0; i < bricks.length; i++) {
      if (!bricks[i]) continue;
      const bx = 3 + 12 * (i % COLS);
      const by = 3 + 8 * Math.floor(i / COLS);
      if (x + r < bx || x - r > bx + BRICK_W || y + r < by || y - r > by + BRICK_H) continue;
      const px = dx > 0 ? x + r - bx : bx + BRICK_W - x + r;
      const py = dy > 0 ? y + r - by : by + BRICK_H - y + r;
      const n = i - s;
      const blocked = n >= 0 && n < bricks.length && Math.floor(n / COLS) === Math.floor(i / COLS) && bricks[n];
      let side;
      if (!blocked && px * Math.abs(dy) < py * Math.abs(dx)) {
        if ((bx + BRICK_W / 2 - x) * dx <= 0) continue;
        side = true;
      } else {
        if ((by + BRICK_H / 2 - y) * dy <= 0) continue;
        side = false;
      }
      bricks[i] = false;
      this.remaining -= 1;
      this.score += 1;
      if (side) this.dx = -this.dx;
      else this.dy = -this.dy;
      return true;
    }
    return false;
  }
}
