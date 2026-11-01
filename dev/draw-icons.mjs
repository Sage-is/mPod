// Draws the app icons with Node alone: a front view of the click wheel on the page background.
//   node dev/draw-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "../icons");
const PAGE = [31, 31, 31];
const SAMPLES = 4;

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}
function png(size, rgb) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 2;
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) rgb.copy(rows, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const inTriangle = (x, y, a, b, c) => {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s = [side(a, b), side(b, c), side(c, a)];
  return s.every((v) => v >= 0) || s.every((v) => v <= 0);
};

// x, y and the radii are in wheel units: 1 is the wheel's edge.
function colour(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1) return null;
  if (r > 0.97) return [150, 150, 150];
  if (r < 0.28) return r > 0.265 ? [150, 150, 150] : [226, 226, 224];
  if (r < 0.79 && r > 0.775) return [170, 170, 170];
  if (r < 0.775) return [236, 236, 234];
  const ink = [120, 120, 120];
  const t = 0.84, tip = 0.93;
  if (inTriangle(y, x, [t, -0.06], [t, 0.06], [tip, 0])) return ink;
  if (inTriangle(x, y, [t, -0.06], [t, 0.06], [tip, 0])) return ink;
  if (inTriangle(x, y, [-t, -0.06], [-t, 0.06], [-tip, 0])) return ink;
  if (Math.abs(x) < 0.09 && y < -0.86 && y > -0.9) return ink;
  return [246, 246, 244];
}

function draw(size, wheel) {
  const rgb = Buffer.alloc(size * size * 3);
  const radius = size * wheel;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES - size / 2) / radius;
          const y = (py + (sy + 0.5) / SAMPLES - size / 2) / radius;
          const c = colour(x, y) ?? PAGE;
          for (let i = 0; i < 3; i++) sum[i] += c[i];
        }
      }
      for (let i = 0; i < 3; i++) rgb[(py * size + px) * 3 + i] = Math.round(sum[i] / (SAMPLES * SAMPLES));
    }
  }
  return png(size, rgb);
}

mkdirSync(out, { recursive: true });
const write = (name, size, wheel) => writeFileSync(join(out, name), draw(size, wheel));
write("icon-192.png", 192, 0.46);
write("icon-512.png", 512, 0.46);
write("icon-maskable-512.png", 512, 0.38);
write("apple-touch-icon.png", 180, 0.44);
write("favicon.png", 32, 0.48);
