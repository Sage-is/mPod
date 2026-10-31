// Builds src/pod-screen.ttf from fonts/pod-screen.glyphs.txt with Node alone.
//   node fonts/build-font.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, "pod-screen.glyphs.txt");
const TARGET = join(here, "..", "src", "pod-screen.ttf");

// 26 CSS px is 208 units, so one design pixel of 12 units is exactly 1.5 CSS px: a 30 px row is
// 20 design pixels. Small units keep every outline delta in one byte.
const UNIT = 12;
const UPM = 208;
const ASCENT = 168;
const DESCENT = 40;
const GAP = 2;
const ROWS = 17;
const BOTTOM_ROW = -2;
const ZONES = "^^^|||xxxxxxxxvvv";

function readGlyphs(path) {
  const text = readFileSync(path, "utf8");
  const glyphs = [];
  const fail = (label, why) => { throw new Error(`${path}: ${label}: ${why}`); };
  const blocks = text.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l && !l.startsWith("#")));
  for (const lines of blocks) {
    if (!lines.length) continue;
    const label = lines[0];
    const head = /^U\+([0-9A-F]{4,6})(?: .*)?$/.exec(label);
    if (!head && label !== ".notdef") fail(label, "first line must be U+XXXX or .notdef");
    const rows = lines.slice(1);
    if (rows.length !== ROWS) fail(label, `has ${rows.length} rows, not ${ROWS}`);
    const art = rows.map((row, i) => {
      if (row[0] !== ZONES[i] || row[1] !== " ") fail(label, `row ${i + 1} must start with "${ZONES[i]} "`);
      return row.slice(2);
    });
    const width = art[0].length;
    if (!width || art.some((r) => r.length !== width || /[^#.]/.test(r))) fail(label, "rows differ in width or use other marks");
    glyphs.push({ label, cp: head ? Number.parseInt(head[1], 16) : null, width, art });
  }
  if (glyphs[0]?.label !== ".notdef") throw new Error(".notdef must be the first block");
  const seen = new Set();
  for (const g of glyphs) {
    if (g.cp !== null && seen.has(g.cp)) fail(g.label, "appears twice");
    seen.add(g.cp);
  }
  return glyphs;
}

// Walks the edges of the ink with the filled side on the right, which merges pixels into plain
// outlines. Where two pixels meet only at a corner it turns right, keeping them apart.
function outline(glyph) {
  const { art, width } = glyph;
  const filled = (x, y) => {
    const row = art[ROWS - 1 - y];
    return row !== undefined && x >= 0 && x < width && row[x] === "#";
  };
  const from = new Map();
  const add = (ax, ay, bx, by) => {
    const key = `${ax},${ay}`;
    if (!from.has(key)) from.set(key, []);
    from.get(key).push({ ax, ay, bx, by, used: false });
  };
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x - 1, y)) add(x, y, x, y + 1);
      if (!filled(x, y + 1)) add(x, y + 1, x + 1, y + 1);
      if (!filled(x + 1, y)) add(x + 1, y + 1, x + 1, y);
      if (!filled(x, y - 1)) add(x + 1, y, x, y);
    }
  }
  const contours = [];
  for (const list of from.values()) {
    for (const first of list) {
      if (first.used) continue;
      const points = [];
      let edge = first;
      do {
        edge.used = true;
        points.push([edge.ax, edge.ay]);
        const dx = edge.bx - edge.ax, dy = edge.by - edge.ay;
        const next = from.get(`${edge.bx},${edge.by}`).filter((e) => !e.used || e === first);
        const turn = (e) => {
          const ex = e.bx - e.ax, ey = e.by - e.ay;
          if (ex === dy && ey === -dx) return 0;
          return ex === dx && ey === dy ? 1 : 2;
        };
        edge = next.sort((a, b) => turn(a) - turn(b))[0];
      } while (edge !== first);
      const corners = points.filter((p, i) => {
        const a = points[(i + points.length - 1) % points.length];
        const b = points[(i + 1) % points.length];
        return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
      });
      contours.push(corners.map(([x, y]) => [x * UNIT, (y + BOTTOM_ROW - 1) * UNIT]));
    }
  }
  return contours;
}

class Writer {
  constructor(size) { this.b = Buffer.alloc(size); this.at = 0; }
  u8(v) { this.b.writeUInt8(v, this.at); this.at += 1; return this; }
  u16(v) { this.b.writeUInt16BE(v, this.at); this.at += 2; return this; }
  i16(v) { this.b.writeInt16BE(v, this.at); this.at += 2; return this; }
  u32(v) { this.b.writeUInt32BE(v >>> 0, this.at); this.at += 4; return this; }
  bytes(buffer) { buffer.copy(this.b, this.at); this.at += buffer.length; return this; }
  tag(text) { this.b.write(text, this.at, "latin1"); this.at += 4; return this; }
}

function encodeGlyph(contours) {
  if (!contours.length) return Buffer.alloc(0);
  const points = contours.flat();
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const flags = [];
  const dxs = [], dys = [];
  let px = 0, py = 0;
  for (const [x, y] of points) {
    const dx = x - px, dy = y - py;
    let flag = 0x01;
    if (dx === 0) flag |= 0x10;
    else if (Math.abs(dx) < 256) { flag |= 0x02; if (dx > 0) flag |= 0x10; dxs.push([1, Math.abs(dx)]); } else dxs.push([2, dx]);
    if (dy === 0) flag |= 0x20;
    else if (Math.abs(dy) < 256) { flag |= 0x04; if (dy > 0) flag |= 0x20; dys.push([1, Math.abs(dy)]); } else dys.push([2, dy]);
    flags.push(flag);
    px = x; py = y;
  }
  const packed = [];
  for (let i = 0; i < flags.length;) {
    let run = 1;
    while (i + run < flags.length && flags[i + run] === flags[i] && run < 256) run++;
    if (run > 1) packed.push(flags[i] | 0x08, run - 1);
    else packed.push(flags[i]);
    i += run;
  }
  const delta = (list) => list.reduce((n, [size]) => n + size, 0);
  const size = 10 + contours.length * 2 + 2 + packed.length + delta(dxs) + delta(dys);
  const w = new Writer(size);
  w.i16(contours.length).i16(Math.min(...xs)).i16(Math.min(...ys)).i16(Math.max(...xs)).i16(Math.max(...ys));
  let end = -1;
  for (const c of contours) { end += c.length; w.u16(end); }
  w.u16(0);
  for (const byte of packed) w.u8(byte);
  for (const [n, v] of dxs) { if (n === 1) w.u8(v); else w.i16(v); }
  for (const [n, v] of dys) { if (n === 1) w.u8(v); else w.i16(v); }
  return w.b;
}

function cmapTable(mapping) {
  const codes = [...mapping.keys()].sort((a, b) => a - b);
  const segments = [];
  for (const cp of codes) {
    const gid = mapping.get(cp);
    const last = segments.at(-1);
    if (last && cp === last.end + 1 && gid === mapping.get(last.end) + 1) last.end = cp;
    else segments.push({ start: cp, end: cp });
  }
  segments.push({ start: 0xffff, end: 0xffff });
  const n = segments.length;
  const length = 16 + n * 8;
  const w = new Writer(4 + 8 * 2 + length);
  w.u16(0).u16(2);
  w.u16(0).u16(3).u32(20);
  w.u16(3).u16(1).u32(20);
  const power = 2 ** Math.floor(Math.log2(n));
  w.u16(4).u16(length).u16(0).u16(n * 2).u16(power * 2).u16(Math.log2(power)).u16(2 * n - power * 2);
  for (const s of segments) w.u16(s.end);
  w.u16(0);
  for (const s of segments) w.u16(s.start);
  for (const s of segments) w.u16(s.start === 0xffff ? 1 : (mapping.get(s.start) - s.start) & 0xffff);
  for (let i = 0; i < n; i++) w.u16(0);
  return w.b;
}

function nameTable(strings) {
  const ids = Object.keys(strings).map(Number).sort((a, b) => a - b);
  const records = [];
  const data = [];
  let offset = 0;
  const push = (platform, encoding, language, id, bytes) => {
    records.push({ platform, encoding, language, id, length: bytes.length, offset });
    data.push(bytes);
    offset += bytes.length;
  };
  for (const id of ids) push(1, 0, 0, id, Buffer.from(strings[id], "latin1"));
  for (const id of ids) push(3, 1, 0x409, id, Buffer.from(strings[id], "utf16le").swap16());
  const w = new Writer(6 + records.length * 12 + offset);
  w.u16(0).u16(records.length).u16(6 + records.length * 12);
  for (const r of records) w.u16(r.platform).u16(r.encoding).u16(r.language).u16(r.id).u16(r.length).u16(r.offset);
  for (const bytes of data) w.bytes(bytes);
  return w.b;
}

function checksum(buffer) {
  let sum = 0;
  const padded = Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4)]);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function build(glyphs) {
  const encoded = glyphs.map((g) => {
    const contours = outline(g);
    return { contours, data: encodeGlyph(contours), advance: (g.width + GAP) * UNIT };
  });
  const pointsIn = (e) => e.contours.reduce((n, c) => n + c.length, 0);

  const glyfParts = [];
  const offsets = [];
  let at = 0;
  for (const e of encoded) {
    offsets.push(at);
    const pad = Buffer.alloc((4 - (e.data.length % 4)) % 4);
    glyfParts.push(e.data, pad);
    at += e.data.length + pad.length;
  }
  offsets.push(at);
  const glyf = Buffer.concat(glyfParts);
  const loca = new Writer(offsets.length * 4);
  for (const o of offsets) loca.u32(o);

  const all = encoded.flatMap((e) => e.contours.flat());
  const allX = all.map((p) => p[0]), allY = all.map((p) => p[1]);
  const xMin = Math.min(...allX), yMin = Math.min(...allY), xMax = Math.max(...allX), yMax = Math.max(...allY);
  const lsbOf = (e) => (e.contours.length ? Math.min(...e.contours.flat().map((p) => p[0])) : 0);
  const rsbOf = (e) => (e.contours.length ? e.advance - Math.max(...e.contours.flat().map((p) => p[0])) : 0);

  const head = new Writer(54);
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x0001).u16(UPM);
  head.u32(0).u32(0xe3a7f100).u32(0).u32(0xe3a7f100);
  head.i16(xMin).i16(yMin).i16(xMax).i16(yMax).u16(0).u16(8).i16(2).i16(1).i16(0);

  const maxAdvance = Math.max(...encoded.map((e) => e.advance));
  const hhea = new Writer(36);
  hhea.u32(0x00010000).i16(ASCENT).i16(-DESCENT).i16(0).u16(maxAdvance);
  hhea.i16(Math.min(...encoded.map(lsbOf))).i16(Math.min(...encoded.map(rsbOf))).i16(xMax);
  hhea.i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(encoded.length);

  const hmtx = new Writer(encoded.length * 4);
  for (const e of encoded) hmtx.u16(e.advance).i16(lsbOf(e));

  const maxp = new Writer(32);
  maxp.u32(0x00010000).u16(encoded.length).u16(Math.max(...encoded.map(pointsIn)));
  maxp.u16(Math.max(...encoded.map((e) => e.contours.length))).u16(0).u16(0).u16(1);
  for (let i = 0; i < 7; i++) maxp.u16(0);

  const mapping = new Map();
  glyphs.forEach((g, gid) => { if (g.cp !== null) mapping.set(g.cp, gid); });
  const codes = [...mapping.keys()].sort((a, b) => a - b);

  const os2 = new Writer(96);
  const average = Math.round(encoded.reduce((n, e) => n + e.advance, 0) / encoded.length);
  os2.u16(4).i16(average).u16(400).u16(5).u16(0);
  os2.i16(120).i16(120).i16(0).i16(24).i16(120).i16(120).i16(0).i16(72).i16(UNIT * 2).i16(UNIT * 5);
  os2.i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(0x80000007).u32(0).u32(0).u32(0).tag("mPod");
  os2.u16(0xc0).u16(codes[0]).u16(codes.at(-1)).i16(ASCENT).i16(-DESCENT).i16(0).u16(ASCENT).u16(DESCENT);
  os2.u32(0x00000003).u32(0).i16(UNIT * 8).i16(UNIT * 11).u16(0).u16(32).u16(0);

  const post = new Writer(32);
  post.u32(0x00030000).u32(0).i16(-UNIT * 2).i16(UNIT).u32(0).u32(0).u32(0).u32(0).u32(0);

  const name = nameTable({
    0: "Copyright 2026 the mPod project. Drawn from scratch for mPod.",
    1: "PodScreen",
    2: "Regular",
    3: "mPod:PodScreen:1.000",
    4: "PodScreen",
    5: "Version 1.000",
    6: "PodScreen-Regular",
  });

  const tables = {
    "OS/2": os2.b, cmap: cmapTable(mapping), glyf, head: head.b, hhea: hhea.b, hmtx: hmtx.b,
    loca: loca.b, maxp: maxp.b, name, post: post.b,
  };
  const tags = Object.keys(tables).sort();
  const count = tags.length;
  const power = 2 ** Math.floor(Math.log2(count));
  const directorySize = 12 + count * 16;
  const size = directorySize + tags.reduce((n, t) => n + Math.ceil(tables[t].length / 4) * 4, 0);
  const out = new Writer(size);
  out.u32(0x00010000).u16(count).u16(power * 16).u16(Math.log2(power)).u16(count * 16 - power * 16);
  let offset = directorySize;
  for (const t of tags) {
    out.tag(t).u32(checksum(tables[t])).u32(offset).u32(tables[t].length);
    offset += Math.ceil(tables[t].length / 4) * 4;
  }
  let headAt = 0;
  for (const t of tags) {
    if (t === "head") headAt = out.at;
    out.bytes(tables[t]);
    out.at = Math.ceil(out.at / 4) * 4;
  }
  out.b.writeUInt32BE((0xb1b0afba - checksum(out.b)) >>> 0, headAt + 8);
  return out.b;
}

const glyphs = readGlyphs(SOURCE);
const font = build(glyphs);
writeFileSync(TARGET, font);
console.log(`${glyphs.length} glyphs, ${font.length} bytes: ${TARGET}`);
