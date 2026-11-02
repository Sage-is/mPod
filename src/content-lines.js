// Shared by the vCard and iCalendar readers: both are folded "NAME;PARAM=x:value" lines.

const isContinuation = (byte) => byte >= 0x80 && byte <= 0xbf;

// A writer that folds by byte can land inside a UTF-8 character. Only those folds come out
// here. Any other stays for the parser, because a 2.1 quoted-printable line can start with a space.
function joinSplitCharacters(bytes) {
  const out = new Uint8Array(bytes.length);
  let length = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if ((byte === 13 || byte === 10) && out[length - 1] >= 0x80) {
      const space = byte === 13 && bytes[i + 1] === 10 ? i + 2 : i + 1;
      if ((bytes[space] === 32 || bytes[space] === 9) && isContinuation(bytes[space + 1])) {
        i = space;
        continue;
      }
    }
    out[length++] = byte;
  }
  return out.subarray(0, length);
}

// Spec 46: a byte order mark, as UTF-8 and as Windows-1252 read it, at the start of any line.
// Files joined end to end carry one at each join.
const MARKS = /(?<![^\r\n])(?:﻿|ï»¿)/g;
const withoutMarks = (text) => text.replace(MARKS, "");

// Spec 44: bytes that are not valid UTF-8 are Windows-1252.
export function decodeBytes(bytes) {
  try {
    return withoutMarks(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return withoutMarks(new TextDecoder("windows-1252").decode(bytes));
  }
}

// A byte order mark says what the file is. Everything else is UTF-8, or else Windows-1252.
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return withoutMarks(new TextDecoder("utf-16le").decode(bytes));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return withoutMarks(new TextDecoder("utf-16be").decode(bytes));
  try {
    return withoutMarks(new TextDecoder("utf-8", { fatal: true }).decode(joinSplitCharacters(bytes)));
  } catch {
    return withoutMarks(new TextDecoder("windows-1252").decode(bytes));
  }
}

export const unfold = (text) => text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");

function splitOutsideQuotes(text, separator) {
  const parts = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (text[i] === separator && !quoted) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// Returns null for a line with no colon, such as the tail of a base64 photo.
export function contentLine(line) {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length && colon < 0; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) colon = i;
  }
  if (colon < 0) return null;
  const [head, ...rest] = splitOutsideQuotes(line.slice(0, colon), ";");
  const params = {};
  for (const param of rest) {
    const equals = param.indexOf("=");
    const name = (equals < 0 ? param : param.slice(0, equals)).toUpperCase();
    params[name] = equals < 0 ? "" : param.slice(equals + 1).replace(/^"|"$/g, "");
  }
  return { name: head.slice(head.lastIndexOf(".") + 1).toUpperCase(), params, value: line.slice(colon + 1) };
}

export const unescapeText = (text) => text.replace(/\\(.)/gs, (_, c) => (c === "n" || c === "N" ? "\n" : c));

export function splitEscaped(text, separator) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === separator) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
