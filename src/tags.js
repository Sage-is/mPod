const WINDOW = 65536;
const MAX_TEXT = 1 << 20;
const MAX_UNSYNC_TAG = 1 << 24;

const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));
const be16 = (b, at) => (b[at] << 8) | b[at + 1];
const be32 = (b, at) => b[at] * 16777216 + ((b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]);
const syncsafe = (b, at) => (b[at] << 21) | (b[at + 1] << 14) | (b[at + 2] << 7) | b[at + 3];

class FileWindow {
  constructor(file) { this.file = file; this.start = 0; this.data = null; }

  async bytes(offset, length) {
    const hit = this.data && offset >= this.start && offset + length <= this.start + this.data.length;
    if (!hit) {
      const size = Math.max(length, WINDOW);
      this.data = new Uint8Array(await this.file.slice(offset, offset + size).arrayBuffer());
      this.start = offset;
    }
    const at = offset - this.start;
    return this.data.subarray(at, at + length);
  }
}

const memory = (data) => ({ bytes: async (offset, length) => data.subarray(offset, offset + length) });

function removeUnsync(b) {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0) i++;
  }
  return out.subarray(0, n);
}

function decodeId3Text(b) {
  if (!b.length) return "";
  const body = b.subarray(1);
  let text;
  switch (b[0]) {
    case 0: text = String.fromCharCode(...body.subarray(0, 32768)); break;
    case 1: text = new TextDecoder(body[0] === 0xfe ? "utf-16be" : "utf-16le").decode(body); break;
    case 2: text = new TextDecoder("utf-16be").decode(body); break;
    default: text = new TextDecoder("utf-8").decode(body);
  }
  return text.split("\0")[0].trim();
}

const FRAMES = {
  2: { TT2: "title", TP1: "artist", TAL: "album", TRK: "track" },
  3: { TIT2: "title", TPE1: "artist", TALB: "album", TRCK: "track" },
};
FRAMES[4] = FRAMES[3];

async function readId3(win) {
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
  let left = 4;
  while (left > 0 && pos + headerSize <= limit) {
    const f = await src.bytes(pos, headerSize);
    if (f.length < headerSize || f[0] === 0) break;
    const id = ascii(f, 0, idSize);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let size;
    if (major === 2) size = (f[3] << 16) | (f[4] << 8) | f[5];
    else if (major === 3 || f[4] & 0x80 || f[5] & 0x80 || f[6] & 0x80 || f[7] & 0x80) size = be32(f, 4);
    else size = syncsafe(f, 4);
    const field = wanted[id];
    if (field && !tags[field] && size > 0 && size <= MAX_TEXT) {
      const value = await frameText(src, pos + headerSize, size, major, major === 2 ? 0 : be16(f, 8), tagUnsync);
      if (value) { tags[field] = value; left -= 1; }
    }
    pos += headerSize + size;
  }
  return tags;
}

async function frameText(src, at, size, major, flags, tagUnsync) {
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
  return decodeId3Text(unsync ? removeUnsync(raw) : raw);
}

async function* atoms(win, start, end) {
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

async function child(win, parent, type) {
  for await (const a of atoms(win, parent.start, parent.end)) if (a.type === type) return a;
  return null;
}

const ITEMS = { "©nam": "title", "©ART": "artist", aART: "albumArtist", "©alb": "album", trkn: "track" };

async function readIlst(win, ilst) {
  const tags = {};
  for await (const item of atoms(win, ilst.start, ilst.end)) {
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
  delete tags.albumArtist;
  return tags;
}

async function readMp4(win, fileSize) {
  const moov = await child(win, { start: 0, end: fileSize }, "moov");
  if (!moov) return {};
  const udta = await child(win, moov, "udta");
  const meta = (udta && await child(win, udta, "meta")) ?? await child(win, moov, "meta");
  if (!meta) return {};
  const probe = await win.bytes(meta.start + 4, 4);
  const box = { start: meta.start + (ascii(probe, 0, 4) === "hdlr" ? 0 : 4), end: meta.end };
  const ilst = await child(win, box, "ilst");
  return ilst ? readIlst(win, ilst) : {};
}

function normalise(tags) {
  const track = typeof tags.track === "string" ? Number.parseInt(tags.track, 10) : tags.track;
  return { ...tags, track: track > 0 ? track : undefined };
}

// Rejects only when the file itself cannot be read. A damaged tag yields no tags.
export async function readTags(file, extension) {
  const win = new FileWindow(file);
  const head = await win.bytes(0, 12);
  try {
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return normalise(await readId3(win));
    if (extension === "m4a" || extension === "mp4" || ascii(head, 4, 4) === "ftyp") {
      return normalise(await readMp4(win, file.size));
    }
  } catch {
    return {};
  }
  return {};
}
