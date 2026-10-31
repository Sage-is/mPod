// Generates small tagged samples under work/samples. Everything is synthesised here.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(join(dirname(fileURLToPath(import.meta.url)), ".."));
const ROOT = "work/samples";
rmSync(ROOT, { recursive: true, force: true });
const put = (path, data) => {
  const full = join(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
};

const syncsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const be32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const be16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };

const ENC = {
  latin1: (s) => Buffer.concat([Buffer.from([0]), Buffer.from(s, "latin1")]),
  utf16: (s) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, "utf16le")]),
  utf16be: (s) => Buffer.concat([Buffer.from([2]), Buffer.from(s, "utf16le").swap16()]),
  utf8: (s) => Buffer.concat([Buffer.from([3]), Buffer.from(s, "utf8")]),
};

const frame23 = (id, body, flags = 0) => Buffer.concat([Buffer.from(id, "latin1"), be32(body.length), be16(flags), body]);
const frame24 = (id, body, flags = 0) => Buffer.concat([Buffer.from(id, "latin1"), syncsafe(body.length), be16(flags), body]);
const frame22 = (id, body) => Buffer.concat([Buffer.from(id, "latin1"), Buffer.from([0, 0, body.length]), body]);
const tag = (major, frames, { flags = 0, padding = 32, prefix = Buffer.alloc(0) } = {}) => {
  const body = Buffer.concat([prefix, ...frames, Buffer.alloc(padding)]);
  return Buffer.concat([Buffer.from("ID3"), Buffer.from([major, 0, flags]), syncsafe(body.length), body]);
};

// Silent MPEG-1 Layer III frames, 128 kbit/s at 44.1 kHz, so an audio element can load them.
const silence = (n) => {
  const f = Buffer.alloc(417);
  f.set([0xff, 0xfb, 0x90, 0x00]);
  return Buffer.concat(Array.from({ length: n }, () => f));
};

const texts = (enc, t, a, l, n) => [
  frame23("TIT2", ENC[enc](t)), frame23("TPE1", ENC[enc](a)), frame23("TALB", ENC[enc](l)), frame23("TRCK", ENC[enc](n)),
];

put("Mix/Alpha/First Album/01 Opening.mp3", Buffer.concat([tag(3, texts("utf16", "Tagged Opening", "Alpha Tag", "First Tag Album", "1/9")), silence(40)]));
put("Mix/Alpha/First Album/02 Second.mp3", Buffer.concat([tag(4, [
  frame24("TIT2", ENC.utf8("Sëcond Ütf8")), frame24("TPE1", ENC.utf8("Alpha Tag")), frame24("TALB", ENC.utf8("First Tag Album")), frame24("TRCK", ENC.utf8("2")),
]), silence(40)]));
put("Mix/Alpha/First Album/03 Third.mp3", Buffer.concat([tag(2, [
  frame22("TT2", ENC.latin1("Third Lätin")), frame22("TP1", ENC.latin1("Alpha Tag")), frame22("TAL", ENC.latin1("First Tag Album")), frame22("TRK", ENC.latin1("3")),
]), silence(40)]));
put("Mix/Alpha/First Album/04 Fourth.mp3", Buffer.concat([tag(4, [
  frame24("TIT2", ENC.utf16be("Fourth Be")),
  frame24("TALB", ENC.utf8("First Tag Album")),
]), silence(10)]));

// Cover art before the text frames, beyond the first read window.
const cover = frame23("APIC", Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0]), Buffer.alloc(200000, 0x41)]));
put("Mix/Beta/Big Art/05 Late Text.mp3", Buffer.concat([tag(3, [cover, ...texts("latin1", "After Cover", "Beta Tag", "Art Album", "5")]), silence(10)]));

// Whole-tag unsynchronisation, version 2.3.
const raw = Buffer.concat(texts("latin1", "Unsync Title", "Beta Tag", "Art Album", "6"));
const withFf = Buffer.concat([frame23("TIT2", Buffer.concat([ENC.latin1("Unsync Title")])), frame23("TPE1", ENC.latin1("Beta Tag")), frame23("TXXX", Buffer.from([0xff, 0x00, 0xe0, 0xff, 0x00])), frame23("TALB", ENC.latin1("Art Album")), frame23("TRCK", ENC.latin1("6"))]);
const unsynced = [];
for (let i = 0; i < withFf.length; i++) {
  unsynced.push(withFf[i]);
  if (withFf[i] === 0xff && (withFf[i + 1] === 0 || (withFf[i + 1] & 0xe0) === 0xe0)) unsynced.push(0);
}
put("Mix/Beta/Big Art/06 Unsync.mp3", Buffer.concat([tag(3, [Buffer.from(unsynced)], { flags: 0x80, padding: 8 }), silence(10)]));
void raw;

// v2.4 data length indicator plus grouping on the title frame.
put("Mix/Beta/Big Art/07 Flags.mp3", Buffer.concat([tag(4, [
  frame24("TIT2", Buffer.concat([Buffer.from([7]), syncsafe(11), ENC.utf8("Flag Title")]), 0x0041),
  frame24("TPE1", ENC.utf8("Beta Tag")),
]), silence(10)]));

// Extended header in 2.3.
put("Mix/Beta/Big Art/08 Extended.mp3", Buffer.concat([tag(3, texts("utf8", "Extended Hdr", "Beta Tag", "Art Album", "8"), { flags: 0x40, prefix: Buffer.concat([be32(6), Buffer.alloc(6)]) }), silence(10)]));

// Garbage tag: must fall back to the path, not fail.
put("Mix/Gamma/Broken/01 Broken Tag.mp3", Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f]), Buffer.alloc(40, 0xee)]));

const atom = (type, ...body) => {
  const data = Buffer.concat(body);
  return Buffer.concat([be32(data.length + 8), Buffer.from(type, "latin1"), data]);
};
const item = (type, value, kind = 1) => atom(type, atom("data", be32(kind), be32(0), value));
const ilst = (t, a, l, n, extra = []) => atom("ilst",
  item("\u00a9nam", Buffer.from(t, "utf8")),
  ...(a ? [item("\u00a9ART", Buffer.from(a, "utf8"))] : []),
  item("\u00a9alb", Buffer.from(l, "utf8")),
  item("trkn", Buffer.from([0, 0, 0, n, 0, 12, 0, 0]), 0),
  ...extra);
const meta = (list, qt = false) => atom("meta", ...(qt ? [] : [Buffer.alloc(4)]), atom("hdlr", Buffer.alloc(8), Buffer.from("mdirappl", "latin1"), Buffer.alloc(13)), list);
const trak = atom("trak", Buffer.alloc(6000, 0x11));
const ftyp = atom("ftyp", Buffer.from("M4A ", "latin1"), Buffer.from([0, 0, 2, 0]), Buffer.from("isomiso2", "latin1"));
const moov = (list, qt) => atom("moov", atom("mvhd", Buffer.alloc(100)), trak, atom("udta", meta(list, qt)));

put("Mix/Delta/Atoms/01 Front.m4a", Buffer.concat([ftyp, moov(ilst("Front Moov", "Delta Tag", "Atom Album", 1)), atom("mdat", Buffer.alloc(5000, 0x22))]));
put("Mix/Delta/Atoms/02 End.m4a", Buffer.concat([ftyp, atom("free", Buffer.alloc(16)), atom("mdat", Buffer.alloc(300000, 0x22)), moov(ilst("End Moov", "Delta Tag", "Atom Album", 2))]));
// 64-bit mdat, then moov, in an .mp4 with QuickTime-style meta without a version field.
const big = Buffer.concat([be32(1), Buffer.from("mdat"), be32(0), be32(100016), Buffer.alloc(100000, 0x33)]);
put("Mix/Delta/Atoms/03 Wide.mp4", Buffer.concat([ftyp, big, moov(ilst("Wide Mdat", "Delta Tag", "Atom Album", 3), true)]));
// aART only; UTF-16 name.
put("Mix/Delta/Atoms/04 Album Artist.M4A", Buffer.concat([ftyp, atom("mdat", Buffer.alloc(100)), moov(atom("ilst",
  item("\u00a9nam", Buffer.from("Utf Sixteen", "utf16le").swap16(), 2),
  item("aART", Buffer.from("Delta Album Artist", "utf8")),
  item("\u00a9alb", Buffer.from("Atom Album", "utf8")),
  item("covr", Buffer.alloc(40000, 0x44), 14),
  item("trkn", Buffer.from([0, 0, 0, 4, 0, 12, 0, 0]), 0),
))]));
// No moov at all: fallback.
put("Mix/Delta/Atoms/05 No Moov.m4a", Buffer.concat([ftyp, atom("mdat", Buffer.alloc(100))]));

// Fallback formats and case variants.
put("Mix/Echo/Plain/01 - Dash Title.flac", Buffer.from("fLaC-not-really"));
put("Mix/Echo/Plain/2_Under Title.OGG", Buffer.from("OggS-not-really"));
put("Mix/Echo/Plain/3. Dotted.opus", Buffer.from("x"));
put("Mix/Echo/Plain/1-04 Disc Track.oga", Buffer.from("x"));
put("Mix/Echo/Plain/07.aac", Buffer.from("x"));
put("Mix/Echo/Plain/1979 Year Title.wav", Buffer.from("x"));
put("Mix/Solo/Loose.MP3", Buffer.from("x"));
copyFileSync("fixtures/audio/tone-0.wav", join(ROOT, "tone-copy.tmp"));
mkdirSync(join(ROOT, "Mix/Foxtrot/Tones"), { recursive: true });
copyFileSync(join(ROOT, "tone-copy.tmp"), join(ROOT, "Mix/Foxtrot/Tones/01 Real Tone.wav"));
rmSync(join(ROOT, "tone-copy.tmp"));

// Ignored and dotted.
put("Mix/Echo/Plain/cover.jpg", Buffer.from("x"));
put("Mix/Echo/Plain/notes.txt", Buffer.from("x"));
put("Mix/.DS_Store", Buffer.from("x"));
put("Mix/Echo/Plain/._01 - Dash Title.flac", Buffer.from("x"));
put("Mix/Echo/Plain/.hidden.mp3", Buffer.from("x"));
put("Mix/Echo/Plain/Empty.mp3", Buffer.alloc(0));

// Playlist inside the folder, with one of each kind of entry.
const lines = [
  "#EXTM3U",
  "",
  "#EXTINF:12,Should Not Replace A Tag",
  "../Alpha/First Album/01 Opening.mp3",                     // relative to the playlist
  "Alpha\\First Album\\02 Second.mp3",                        // suffix only, backslashes
  "..\\Beta\\Big%20Art\\05%20Late%20Text.mp3",                // backslash plus percent
  "/Volumes/Old Disk/Music/Delta/Atoms/02 End.m4a",          // absolute, suffix
  "04 ALBUM ARTIST.m4a",                                     // file name only, other case
  "#EXTINF:33,Title From Extinf",
  "file:///C:/Users/me/Music/Echo/Plain/2_Under%20Title.OGG",
  "   ",
  "Gone/Missing/Nope.mp3",                                   // missing
  "http://example.invalid/stream/01 Opening.mp3",            // remote, never fetched
];
put("Mix/Lists/Road Trip.m3u", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join("\r\n"), "utf8")]));
put("Mix/Lists/All Missing.m3u8", Buffer.from("#EXTM3U\nnope/one.mp3\nnope/two.mp3\n"));
put("Mix/Lists/Comments Only.m3u", Buffer.from("#EXTM3U\n# nothing here\n\n"));

// Pending: added before its tracks.
put("Later/later.m3u8", Buffer.from("#EXTM3U\nKilo/Lima/01 Hello.mp3\nKilo/Lima/02 World.mp3\nmissing/song.mp3\n"));
put("LaterFolder/Kilo/Lima/01 Hello.mp3", Buffer.concat([tag(3, texts("utf8", "Hello", "Kilo Tag", "Lima Tag", "1")), silence(5)]));
put("LaterFolder/Kilo/Lima/02 World.mp3", Buffer.concat([tag(3, texts("utf8", "World", "Kilo Tag", "Lima Tag", "2")), silence(5)]));

// Track numbers disagree with file names, and one artist shared with the catalogue.
put("Order/Mike/Rev/a first file.mp3", Buffer.concat([tag(3, texts("utf8", "Track Three", "Mike Tag", "Rev", "3")), silence(5)]));
put("Order/Mike/Rev/b second file.mp3", Buffer.concat([tag(3, texts("utf8", "Track One", "Mike Tag", "Rev", "1")), silence(5)]));
put("Order/Mike/Rev/c third file.mp3", Buffer.concat([tag(3, texts("utf8", "Track Two", "Mike Tag", "Rev", "2")), silence(5)]));
put("Order/Alder/Same/x.mp3", Buffer.concat([tag(3, texts("utf8", "Shared Artist Song", "ALDER QUAY", "Same", "1")), silence(5)]));
put("Order/Numeric/N/9 nine.flac", Buffer.from("x"));
put("Order/Numeric/N/10 ten.flac", Buffer.from("x"));
console.log("samples written");
