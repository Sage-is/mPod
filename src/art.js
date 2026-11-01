import { ascii, atoms, be32, child, FileWindow, findIlst, flacBlocks, removeUnsync, syncsafe } from "./tags.js";

const SIZE = 512;
const FLAC_PICTURE = 6;
const blob = (bytes, type) => new Blob([bytes], { type });

function textEnd(b, at, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let i = at; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2;
    return b.length;
  }
  const i = b.indexOf(0, at);
  return i < 0 ? b.length : i + 1;
}

function apic(body) {
  const encoding = body[0];
  const mimeEnd = body.indexOf(0, 1);
  if (mimeEnd < 0) return null;
  const mime = ascii(body, 1, mimeEnd - 1) || "image/jpeg";
  const start = textEnd(body, mimeEnd + 2, encoding);
  return blob(body.subarray(start), mime.includes("/") ? mime : `image/${mime}`);
}

function pic(body) {
  const encoding = body[0];
  const format = ascii(body, 1, 3).toLowerCase();
  const start = textEnd(body, 5, encoding);
  return blob(body.subarray(start), format === "png" ? "image/png" : "image/jpeg");
}

// The whole tag is read, however large, since a cover can sit after other big frames.
async function id3Picture(file) {
  const h = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (ascii(h, 0, 3) !== "ID3") return null;
  const major = h[3];
  if (major < 2 || major > 4) return null;
  const size = syncsafe(h, 6);
  let b = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
  if (h[5] & 0x80 && major < 4) b = removeUnsync(b);
  let at = 0;
  if (h[5] & 0x40 && major >= 3) at = major === 4 ? syncsafe(b, 0) : be32(b, 0) + 4;
  const headerSize = major === 2 ? 6 : 10;
  while (at + headerSize <= b.length) {
    const id = ascii(b, at, major === 2 ? 3 : 4);
    if (!/^[A-Z0-9]+$/.test(id)) return null;
    let length;
    if (major === 2) length = (b[at + 3] << 16) | (b[at + 4] << 8) | b[at + 5];
    else if (major === 3) length = be32(b, at + 4);
    else length = syncsafe(b, at + 4);
    const body = b.subarray(at + headerSize, at + headerSize + length);
    if (id === "APIC") return apic(body);
    if (id === "PIC") return pic(body);
    at += headerSize + length;
  }
  return null;
}

async function mp4Picture(file) {
  const win = new FileWindow(file);
  const ilst = await findIlst(win, file.size);
  if (!ilst) return null;
  const covr = await child(win, ilst, "covr");
  if (!covr) return null;
  for await (const atom of atoms(win, covr.start, covr.end)) {
    if (atom.type !== "data") continue;
    const head = await win.bytes(atom.start, 8);
    const image = await file.slice(atom.start + 8, atom.end).arrayBuffer();
    return blob(image, (be32(head, 0) & 0xffffff) === 14 ? "image/png" : "image/jpeg");
  }
  return null;
}

async function flacPicture(file) {
  const win = new FileWindow(file);
  for await (const block of flacBlocks(win, file.size)) {
    if (block.type !== FLAC_PICTURE) continue;
    const b = new Uint8Array(await file.slice(block.start, block.start + block.length).arrayBuffer());
    const mimeLength = be32(b, 4);
    const mime = ascii(b, 8, mimeLength) || "image/jpeg";
    const descriptionLength = be32(b, 8 + mimeLength);
    const lengthAt = 8 + mimeLength + 4 + descriptionLength + 16;
    return blob(b.subarray(lengthAt + 4, lengthAt + 4 + be32(b, lengthAt)), mime);
  }
  return null;
}

export async function embeddedArt(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (ascii(head, 0, 3) === "ID3") return id3Picture(file);
  if (ascii(head, 0, 4) === "fLaC") return flacPicture(file);
  if (ascii(head, 4, 4) === "ftyp") return mp4Picture(file);
  return null;
}

// Publishing a fixed size and format means neither can block the system's media UI.
export async function scaleArt(source) {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("art did not encode"))), "image/jpeg", 0.85);
  });
}
