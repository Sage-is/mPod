// Finds a cover image inside an audio file. Returns a Blob, or null.
const HEAD = 4 * 1024 * 1024;
const TAIL = 2 * 1024 * 1024;
const ascii = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
const big = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const syncsafe = (b, at) => (b[at] << 21) | (b[at + 1] << 14) | (b[at + 2] << 7) | b[at + 3];

function textEnd(b, at, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let i = at; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2;
    return b.length;
  }
  const i = b.indexOf(0, at);
  return i < 0 ? b.length : i + 1;
}

function id3Picture(b) {
  if (ascii(b, 0, 3) !== "ID3") return null;
  const version = b[3];
  const end = Math.min(10 + syncsafe(b, 6), b.length);
  let at = 10;
  while (at + 10 < end) {
    const id = ascii(b, at, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) return null;
    const size = version >= 4 ? syncsafe(b, at + 4) : big(b, at + 4);
    if (id === "APIC") {
      const body = b.subarray(at + 10, Math.min(at + 10 + size, b.length));
      const encoding = body[0];
      const mimeEnd = body.indexOf(0, 1);
      const mime = ascii(body, 1, mimeEnd - 1) || "image/jpeg";
      const start = textEnd(body, mimeEnd + 2, encoding);
      return new Blob([body.subarray(start)], { type: mime.includes("/") ? mime : `image/${mime}` });
    }
    at += 10 + size;
  }
  return null;
}

function mp4Picture(b) {
  for (let i = 4; i + 24 < b.length; i++) {
    if (b[i] !== 0x63 || ascii(b, i, 4) !== "covr" || ascii(b, i + 8, 4) !== "data") continue;
    const size = big(b, i + 4);
    const kind = big(b, i + 12) & 0xffffff;
    const image = b.subarray(i + 20, i + 4 + size);
    return new Blob([image], { type: kind === 14 ? "image/png" : "image/jpeg" });
  }
  return null;
}

export async function embeddedArt(file) {
  const head = new Uint8Array(await file.slice(0, HEAD).arrayBuffer());
  const picture = id3Picture(head) ?? mp4Picture(head);
  if (picture || file.size <= HEAD) return picture;
  return mp4Picture(new Uint8Array(await file.slice(-TAIL).arrayBuffer()));
}
