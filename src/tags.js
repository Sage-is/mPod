import { ID3V1_GENRES } from "./id3-genres.js";

const WINDOW = 65536;
const MAX_TEXT = 1 << 20;
const MAX_UNSYNC_TAG = 1 << 24;

export const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));
const be16 = (b, at) => (b[at] << 8) | b[at + 1];
export const be32 = (b, at) => b[at] * 16777216 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
export const syncsafe = (b, at) => (b[at] << 21) | (b[at + 1] << 14) | (b[at + 2] << 7) | b[at + 3];

export class FileWindow {
  constructor(file) { this.file = file; this.start = 0; this.data = null; }

  async bytes(offset, length) {
    const hit = this.data && offset >= this.start && offset + length <= this.start + this.data.length;
    if (!hit) {
      const size = Math.max(length, WINDOW);
      try {
        this.data = new Uint8Array(await this.file.slice(offset, offset + size).arrayBuffer());
      } catch (err) {
        this.failed = true;
        throw err;
      }
      this.start = offset;
    }
    const at = offset - this.start;
    return this.data.subarray(at, at + length);
  }
}

const memory = (data) => ({ bytes: async (offset, length) => data.subarray(offset, offset + length) });

export function removeUnsync(b) {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0) i++;
  }
  return out.subarray(0, n);
}

// Spec 43: many taggers write UTF-8 and call it Latin-1. Bytes above 0x7F that also make valid
// UTF-8 are almost never real Latin-1. `repair` is set on the product page only.
function latin1(bytes, repair) {
  if (repair && bytes.some((byte) => byte > 0x7f)) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch { /* it really is Latin-1 */ }
  }
  return String.fromCharCode(...bytes);
}

function decodeId3Text(b, repair) {
  if (!b.length) return "";
  const body = b.subarray(1);
  let text;
  switch (b[0]) {
    case 0: text = latin1(body.subarray(0, 32768), repair); break;
    case 1: text = new TextDecoder(body[0] === 0xfe ? "utf-16be" : "utf-16le").decode(body); break;
    case 2: text = new TextDecoder("utf-16be").decode(body); break;
    default: text = new TextDecoder("utf-8").decode(body);
  }
  return text.split("\0")[0].trim();
}

const FRAMES = {
  2: { TT2: "title", TP1: "artist", TAL: "album", TRK: "track", TCO: "genre", TCM: "composer", TP2: "albumArtist" },
  3: { TIT2: "title", TPE1: "artist", TALB: "album", TRCK: "track", TCON: "genre", TCOM: "composer", TPE2: "albumArtist" },
};
FRAMES[4] = FRAMES[3];
const PICTURE_FRAME = { 2: "PIC", 3: "APIC", 4: "APIC" };

async function readId3(win, repair) {
  const h = await win.bytes(0, 10);
  const major = h[3];
  if (!FRAMES[major]) return {};
  const flags = h[5];
  const tagUnsync = !!(flags & 0x80);
  if (major === 2 && flags & 0x40) return {};
  const end = 10 + syncsafe(h, 6);

  let src = win;
  if (tagUnsync && major < 4) {
    const whole = await win.bytes(10, Math.min(end - 10, MAX_UNSYNC_TAG));
    src = memory(removeUnsync(whole));
  }
  const limit = src === win ? end : (await src.bytes(0, end)).length;
  let pos = src === win ? 10 : 0;

  if (flags & 0x40 && major >= 3) {
    const x = await src.bytes(pos, 4);
    pos += major === 4 ? syncsafe(x, 0) : be32(x, 0) + 4;
  }

  const wanted = FRAMES[major];
  const headerSize = major === 2 ? 6 : 10;
  const idSize = major === 2 ? 3 : 4;
  const tags = {};
  let left = Object.keys(wanted).length;
  while ((left > 0 || !tags.art) && pos + headerSize <= limit) {
    const f = await src.bytes(pos, headerSize);
    if (f.length < headerSize || f[0] === 0) break;
    const id = ascii(f, 0, idSize);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let size;
    if (major === 2) size = (f[3] << 16) | (f[4] << 8) | f[5];
    else if (major === 3 || f[4] & 0x80 || f[5] & 0x80 || f[6] & 0x80 || f[7] & 0x80) size = be32(f, 4);
    else size = syncsafe(f, 4);
    const field = wanted[id];
    if (id === PICTURE_FRAME[major] && size > 0) tags.art = true;
    if (field && !tags[field] && size > 0 && size <= MAX_TEXT) {
      const value = await frameText(src, pos + headerSize, size, major, major === 2 ? 0 : be16(f, 8), tagUnsync, repair);
      if (value) { tags[field] = value; left -= 1; }
    }
    pos += headerSize + size;
  }
  return tags;
}

async function frameText(src, at, size, major, flags, tagUnsync, repair) {
  let skip = 0;
  let unsync = false;
  if (major === 3) {
    if (flags & 0x00c0) return "";
    if (flags & 0x0020) skip += 1;
  } else if (major === 4) {
    if (flags & 0x000c) return "";
    if (flags & 0x0040) skip += 1;
    if (flags & 0x0001) skip += 4;
    unsync = tagUnsync || !!(flags & 0x0002);
  }
  const raw = (await src.bytes(at, size)).subarray(skip);
  return decodeId3Text(unsync ? removeUnsync(raw) : raw, repair);
}

export async function* atoms(win, start, end) {
  let pos = start;
  while (pos + 8 <= end) {
    const h = await win.bytes(pos, 16);
    if (h.length < 8) return;
    let size = be32(h, 0);
    let header = 8;
    if (size === 1) {
      if (h.length < 16) return;
      size = be32(h, 8) * 4294967296 + be32(h, 12);
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header) return;
    yield { type: ascii(h, 4, 4), start: pos + header, end: Math.min(pos + size, end) };
    pos += size;
  }
}

export async function child(win, parent, type) {
  for await (const a of atoms(win, parent.start, parent.end)) if (a.type === type) return a;
  return null;
}

const ITEMS = {
  "©nam": "title", "©ART": "artist", aART: "albumArtist", "©alb": "album", trkn: "track", "©gen": "genre", "©wrt": "composer",
};

async function readIlst(win, ilst) {
  const tags = {};
  for await (const item of atoms(win, ilst.start, ilst.end)) {
    if (item.type === "covr") tags.art = true;
    const field = ITEMS[item.type];
    if (!field) continue;
    const data = await child(win, item, "data");
    if (!data || data.end - data.start < 8 || data.end - data.start > MAX_TEXT) continue;
    const b = await win.bytes(data.start, data.end - data.start);
    const value = b.subarray(8);
    if (field === "track") {
      if (value.length >= 4) tags.track = be16(value, 2) || undefined;
    } else {
      const kind = be32(b, 0) & 0xffffff;
      tags[field] = new TextDecoder(kind === 2 ? "utf-16be" : "utf-8").decode(value).split("\0")[0].trim();
    }
  }
  tags.artist ||= tags.albumArtist;
  return tags;
}

export async function findIlst(win, fileSize) {
  const moov = await child(win, { start: 0, end: fileSize }, "moov");
  if (!moov) return null;
  const udta = await child(win, moov, "udta");
  const meta = (udta && await child(win, udta, "meta")) ?? await child(win, moov, "meta");
  if (!meta) return null;
  const probe = await win.bytes(meta.start + 4, 4);
  return child(win, { start: meta.start + (ascii(probe, 0, 4) === "hdlr" ? 0 : 4), end: meta.end }, "ilst");
}

async function readMp4(win, fileSize) {
  const ilst = await findIlst(win, fileSize);
  return ilst ? readIlst(win, ilst) : {};
}

const GENRE_NUMBER = /^(?:\((\d+)\)|(\d+))$/;
const FLAC_COMMENT = 4;
const FLAC_PICTURE = 6;
const VORBIS = { COMPOSER: "composer", ALBUMARTIST: "albumArtist", "ALBUM ARTIST": "albumArtist" };
const le32 = (b, at) => b[at] + b[at + 1] * 256 + b[at + 2] * 65536 + b[at + 3] * 16777216;

export async function* flacBlocks(win, fileSize) {
  let pos = 4;
  while (pos + 4 <= fileSize) {
    const h = await win.bytes(pos, 4);
    if (h.length < 4) return;
    const length = (h[1] << 16) | (h[2] << 8) | h[3];
    yield { type: h[0] & 0x7f, start: pos + 4, length };
    if (h[0] & 0x80) return;
    pos += 4 + length;
  }
}

// Spec 37 wants only these two from Vorbis comments. Title and the rest stay with the path.
function vorbisComments(b) {
  const tags = {};
  let pos = 4 + le32(b, 0);
  const count = le32(b, pos);
  pos += 4;
  for (let i = 0; i < count && pos + 4 <= b.length; i++) {
    const length = le32(b, pos);
    const text = new TextDecoder("utf-8").decode(b.subarray(pos + 4, pos + 4 + length));
    pos += 4 + length;
    const equals = text.indexOf("=");
    const field = VORBIS[text.slice(0, equals).toUpperCase()];
    if (field) tags[field] ??= text.slice(equals + 1).trim();
  }
  return tags;
}

async function readFlac(win, fileSize) {
  const tags = {};
  for await (const block of flacBlocks(win, fileSize)) {
    if (block.type === FLAC_PICTURE) tags.art = true;
    if (block.type === FLAC_COMMENT && block.length <= MAX_TEXT) Object.assign(tags, vorbisComments(await win.bytes(block.start, block.length)));
  }
  return tags;
}

// The comments are the stream's second packet, which can run across pages.
async function oggCommentPacket(win) {
  const spans = [];
  let pos = 0;
  let packet = 0;
  let size = 0;
  const keep = (at, length) => {
    if (packet !== 1 || !length) return;
    spans.push([at, length]);
    size += length;
  };
  while (packet < 2 && size <= MAX_TEXT) {
    const h = await win.bytes(pos, 27);
    if (h.length < 27 || ascii(h, 0, 4) !== "OggS") return null;
    const lacing = await win.bytes(pos + 27, h[26]);
    let at = pos + 27 + h[26];
    let run = 0;
    for (const segment of lacing) {
      run += segment;
      if (segment === 255) continue;
      keep(at, run);
      at += run;
      run = 0;
      packet += 1;
    }
    keep(at, run);
    pos = at + run;
  }
  const out = new Uint8Array(size);
  let filled = 0;
  for (const [at, length] of spans) {
    const part = await win.bytes(at, length);
    out.set(part.subarray(0, out.length - filled), filled);
    filled += part.length;
  }
  return out.subarray(0, Math.min(filled, size));
}

async function readOgg(win) {
  const packet = await oggCommentPacket(win);
  if (!packet) return {};
  if (ascii(packet, 0, 8) === "OpusTags") return vorbisComments(packet.subarray(8));
  return packet[0] === 3 && ascii(packet, 1, 6) === "vorbis" ? vorbisComments(packet.subarray(7)) : {};
}

// Spec 43, with `repair`: a genre that is only a number names an ID3v1 genre, or none.
function cleanGenre(genre, repair) {
  const number = repair ? GENRE_NUMBER.exec(genre.trim()) : null;
  if (number) return ID3V1_GENRES[Number(number[1] ?? number[2])];
  return genre.replace(/^(\(\d+\))+/, "").trim() || undefined;
}

function normalise(tags, repair) {
  const track = typeof tags.track === "string" ? Number.parseInt(tags.track, 10) : tags.track;
  const out = { ...tags, track: track > 0 ? track : undefined };
  if (!out.art) delete out.art;
  if (out.genre) out.genre = cleanGenre(out.genre, repair);
  return out;
}

// Rejects when the file itself cannot be read, on any read. A damaged tag yields no tags.
export async function readTags(file, extension, repair = false) {
  const win = new FileWindow(file);
  const head = await win.bytes(0, 12);
  try {
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return normalise(await readId3(win, repair), repair);
    if (extension === "m4a" || extension === "mp4" || ascii(head, 4, 4) === "ftyp") {
      return normalise(await readMp4(win, file.size), repair);
    }
    if (ascii(head, 0, 4) === "fLaC") return normalise(await readFlac(win, file.size), repair);
    if (ascii(head, 0, 4) === "OggS") return normalise(await readOgg(win), repair);
  } catch (err) {
    if (win.failed) throw err;
    return {};
  }
  return {};
}
