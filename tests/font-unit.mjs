// Node checks of the glyph source and the built font. Reads only this project's own files.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { T } from "./h.mjs";

const t = new T();
const text = readFileSync("fonts/pod-screen.glyphs.txt", "utf8");
const font = readFileSync("fonts/pod-screen-a2.ttf");

const blocks = text.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => l && !l.startsWith("#"))).filter((l) => l.length);
const art = new Map();
for (const [head, ...rows] of blocks) {
  const m = /^U\+([0-9A-F]+)/.exec(head);
  if (m) art.set(Number.parseInt(m[1], 16), rows.map((r) => r.slice(2)));
}
const ink = (cp) => {
  const rows = art.get(typeof cp === "string" ? cp.codePointAt(0) : cp);
  const used = rows.map((r, i) => (r.includes("#") ? 14 - i : null)).filter((v) => v !== null);
  return { top: Math.max(...used), bottom: Math.min(...used), width: rows[0].length };
};

const wanted = [];
for (let c = 0x20; c <= 0x7e; c++) wanted.push(c);
for (let c = 0xa0; c <= 0x17f; c++) wanted.push(c);
for (let c = 0x2010; c <= 0x2015; c++) wanted.push(c);
for (let c = 0x2018; c <= 0x201f; c++) wanted.push(c);
wanted.push(0x2022, 0x2026);
t.eq("one block per character", wanted.filter((c) => !art.has(c)), []);

t.eq("cap height 11", [...new Set([..."HEFILTZ"].map((c) => ink(c).top))], [11]);
t.eq("x-height 8", [...new Set([..."xzvwnmur"].map((c) => ink(c).top))], [8]);
t.eq("descenders 3", [...new Set([..."gpqy"].map((c) => 1 - ink(c).bottom))], [3]);
t.eq("space about 5 with its gap", ink2(" "), 5);
function ink2(c) { return art.get(c.codePointAt(0))[0].length + 2; }
t.ok("proportional", ink("i").width < ink("m").width);
t.eq("stems 2 thick: H, n and l", [art.get(72)[7].slice(0, 3), art.get(110)[9].slice(0, 3), art.get(108)[8]], ["##.", "##.", ".##."]);
t.ok("counters open: n is 5 across", /^##\.{5}##$/.test(art.get(110)[9]), art.get(110)[9]);
t.ok("narrow letters carry side space", [..."il"].every((c) => art.get(c.codePointAt(0))[6].startsWith(".")));
t.eq("digits share a width, so time labels stay still", [...new Set([..."0123456789"].map((c) => ink(c).width))], [10]);
t.eq("accented capitals stay inside the accent rows", [..."ÀÅÉÎÕÜŠŽĈĞŴ"].filter((c) => ink(c).top > 14), []);
t.ok("accents really sit above cap height", ink("É").top === 14 && ink("Å").top === 14);

const tag = (name) => {
  const count = font.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    if (font.toString("latin1", at, at + 4) === name) return { at: font.readUInt32BE(at + 8), length: font.readUInt32BE(at + 12) };
  }
  throw new Error(`no table ${name}`);
};
t.ok(`under 40 KB (${font.length} bytes)`, font.length < 40000, font.length);
t.eq("sfnt version", font.readUInt32BE(0), 0x00010000);

let sum = 0;
const whole = Buffer.concat([font, Buffer.alloc((4 - (font.length % 4)) % 4)]);
for (let i = 0; i < whole.length; i += 4) sum = (sum + whole.readUInt32BE(i)) >>> 0;
t.eq("file checksum", sum, 0xb1b0afba);

const head = tag("head").at;
t.eq("units per em", font.readUInt16BE(head + 18), 208);
const hhea = tag("hhea").at;
t.eq("ascent and descent fill the em", [font.readInt16BE(hhea + 4), font.readInt16BE(hhea + 6)], [168, -40]);

const cmap = tag("cmap").at;
const sub = cmap + font.readUInt32BE(cmap + 8);
t.eq("cmap format 4", font.readUInt16BE(sub), 4);
const segments = font.readUInt16BE(sub + 6) / 2;
const has = new Set();
for (let i = 0; i < segments; i++) {
  const end = font.readUInt16BE(sub + 14 + i * 2);
  const start = font.readUInt16BE(sub + 16 + segments * 2 + i * 2);
  for (let c = start; c <= end && c < 0xffff; c++) has.add(c);
}
t.eq("cmap covers every character", wanted.filter((c) => !has.has(c)), []);
t.eq("nothing beyond the coverage", [...has].filter((c) => !wanted.includes(c)), []);

const name = tag("name");
const nameBytes = font.subarray(name.at, name.at + name.length);
const records = nameBytes.readUInt16BE(2);
const storage = nameBytes.readUInt16BE(4);
const strings = {};
for (let i = 0; i < records; i++) {
  const r = 6 + i * 12;
  if (nameBytes.readUInt16BE(r) !== 3) continue;
  const bytes = Buffer.from(nameBytes.subarray(storage + nameBytes.readUInt16BE(r + 10), storage + nameBytes.readUInt16BE(r + 10) + nameBytes.readUInt16BE(r + 8)));
  strings[nameBytes.readUInt16BE(r + 6)] = bytes.swap16().toString("utf16le");
}
t.eq("family", strings[1], "PodScreen");
t.ok("our own copyright", /mPod/.test(strings[0]), strings[0]);
t.eq("no third-party names", Object.values(strings).filter((s) => !/mPod|PodScreen|Regular|Version/.test(s)), []);

const before = font.toString("hex");
execFileSync(process.execPath, ["fonts/build-font.mjs"], { stdio: "ignore" });
t.eq("the checked-in font matches its source", readFileSync("fonts/pod-screen-a2.ttf").toString("hex") === before, true);

t.done();
process.exit(t.exitCode);
