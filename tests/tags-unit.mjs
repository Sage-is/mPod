// Node unit run of the tag readers and the playlist parser against generated samples.
import { readFileSync } from "node:fs";
import { readTags } from "../src/tags.js";
import { collapse, entryVariants, parsePlaylist } from "../src/m3u.js";
import "./gen-samples.mjs";
import { T } from "./h.mjs";

const t = new T();
const tags = async (path) => {
  const ext = path.split(".").pop().toLowerCase();
  const blob = new Blob([readFileSync(`work/samples/${path}`)]);
  const out = await readTags(blob, ext);
  return [out.title, out.artist, out.album, out.track];
};
const cases = [
  ["Mix/Alpha/First Album/01 Opening.mp3", ["Tagged Opening", "Alpha Tag", "First Tag Album", 1]],
  ["Mix/Alpha/First Album/02 Second.mp3", ["Sëcond Ütf8", "Alpha Tag", "First Tag Album", 2]],
  ["Mix/Alpha/First Album/03 Third.mp3", ["Third Lätin", "Alpha Tag", "First Tag Album", 3]],
  ["Mix/Alpha/First Album/04 Fourth.mp3", ["Fourth Be", undefined, "First Tag Album", undefined]],
  ["Mix/Beta/Big Art/05 Late Text.mp3", ["After Cover", "Beta Tag", "Art Album", 5]],
  ["Mix/Beta/Big Art/06 Unsync.mp3", ["Unsync Title", "Beta Tag", "Art Album", 6]],
  ["Mix/Beta/Big Art/07 Flags.mp3", ["Flag Title", "Beta Tag", undefined, undefined]],
  ["Mix/Beta/Big Art/08 Extended.mp3", ["Extended Hdr", "Beta Tag", "Art Album", 8]],
  ["Mix/Gamma/Broken/01 Broken Tag.mp3", [undefined, undefined, undefined, undefined]],
  ["Mix/Delta/Atoms/01 Front.m4a", ["Front Moov", "Delta Tag", "Atom Album", 1]],
  ["Mix/Delta/Atoms/02 End.m4a", ["End Moov", "Delta Tag", "Atom Album", 2]],
  ["Mix/Delta/Atoms/03 Wide.mp4", ["Wide Mdat", "Delta Tag", "Atom Album", 3]],
  ["Mix/Delta/Atoms/04 Album Artist.M4A", ["Utf Sixteen", "Delta Album Artist", "Atom Album", 4]],
  ["Mix/Delta/Atoms/05 No Moov.m4a", [undefined, undefined, undefined, undefined]],
];
for (const [path, want] of cases) t.eq(path, await tags(path), want);

const named = async (path) => {
  const out = await readTags(new Blob([readFileSync(`work/samples/Composer/${path}`)]), path.split(".").pop());
  return [out.composer, out.albumArtist];
};
const composers = [
  ["23.mp3", ["Comp Twothree", "Band Twothree"]], ["24.mp3", ["Cömp Twofour", "Band Twofour"]], ["22.mp3", ["Comp Twotwo", "Band Twotwo"]],
  ["atoms.m4a", ["Comp Atom", "Band Atom"]], ["block.flac", ["Comp Vörbis", "Band Vorbis"]], ["vorbis.ogg", ["Comp Vörbis", "Band Vorbis"]],
  ["tags.opus", ["Comp Vörbis", "Band Vorbis"]], ["pages.oga", ["Comp Vörbis", "Band Vorbis"]], ["cut.ogg", [undefined, undefined]],
];
for (const [path, want] of composers) t.eq(`composer: ${path}`, await named(path), want);
t.eq("Vorbis comments leave the title to the path", (await readTags(new Blob([readFileSync("work/samples/Composer/block.flac")]), "flac")).title, undefined);
t.eq("an album artist alone still stands in for the artist", (await readTags(new Blob([readFileSync("work/samples/Mix/Delta/Atoms/04 Album Artist.M4A")]), "m4a")).albumArtist, "Delta Album Artist");

const reads = [];
const counted = new Blob([readFileSync("work/samples/Mix/Delta/Atoms/02 End.m4a")]);
const spy = { size: counted.size, slice: (a, b) => { reads.push(b - a); return counted.slice(a, b); } };
await readTags(spy, "m4a");
const total = reads.reduce((s, n) => s + n, 0);
console.log("    End.m4a read calls", reads.length, "of a", counted.size, "byte file");
t.ok("metadata at the end does not read the whole mdat window by window", reads.length < 8, reads.length);
void total;

await readTags({ size: 10, slice: () => { throw new Error("gone"); } }, "mp3").then(
  () => t.ok("read failure rejects", false),
  () => t.ok("read failure rejects", true),
);

const entries = parsePlaylist("\ufeff#EXTM3U\r\n\r\n#EXTINF:1,One, with comma\r\na.mp3\rb.mp3\n# c\n#extinf:2,Two\n  c.mp3  \n");
t.eq("parse", entries, [{ path: "a.mp3", title: "One, with comma" }, { path: "b.mp3", title: "" }, { path: "c.mp3", title: "Two" }]);
t.eq("variants percent", entryVariants("A%20B\\C.mp3"), [["a b", "c.mp3"], ["a%20b", "c.mp3"]]);
t.eq("malformed percent kept", entryVariants("100% sure.mp3"), [["100% sure.mp3"]]);
t.eq("file url", entryVariants("file:///C:/x/y.mp3"), [["c:", "x", "y.mp3"]]);
t.eq("remote url", entryVariants("https://a.invalid/b.mp3"), []);
t.eq("collapse", collapse(["a", "b", "..", ".", "c"]), ["a", "c"]);
t.eq("collapse above root", collapse([".."]), null);
t.done();
process.exit(t.fail.length ? 1 : 0);
