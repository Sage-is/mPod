// vCard 2.1, 3.0 and 4.0, any number of cards per file. Photos are passed over.
import { contentLine, decodeBytes, splitEscaped, unescapeText } from "./content-lines.js";

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const encoder = new TextEncoder();

function namedDecoder(charset) {
  try {
    return charset ? new TextDecoder(charset) : null;
  } catch {
    return null;
  }
}

// Works by code point, so a character outside the 16-bit range is not cut in two.
function quotedPrintable(text, charset) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i);
    const hex = code === 61 ? text.slice(i + 1, i + 3) : "";
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else if (code < 128) {
      bytes.push(code);
    } else {
      for (const byte of encoder.encode(String.fromCodePoint(code))) bytes.push(byte);
      if (code > 0xffff) i += 1;
    }
  }
  const decoded = Uint8Array.from(bytes);
  return namedDecoder(charset)?.decode(decoded) ?? decodeBytes(decoded);
}

const isQuoted = (line) => /quoted-printable/i.test(line.slice(0, Math.max(0, line.indexOf(":"))));

// A 2.1 quoted-printable value carries on after a trailing "=", and its next line is all
// value, so that join comes before ordinary unfolding. It joins in one pass: building the
// string line by line would copy a large value over and over.
function softBreaks(raw, first) {
  const pieces = [];
  let i = first;
  while (raw[i].endsWith("=") && i + 1 < raw.length) pieces.push(raw[i++].slice(0, -1));
  pieces.push(raw[i]);
  return { line: pieces.join(""), last: i };
}

function lines(text) {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (/^[ \t]/.test(raw[i]) && out.length) {
      out[out.length - 1] += raw[i].slice(1);
    } else if (isQuoted(raw[i])) {
      const { line, last } = softBreaks(raw, i);
      out.push(line);
      i = last;
    } else {
      out.push(raw[i]);
    }
  }
  return out;
}

const rawValue = ({ params, value }) => {
  const quoted = /quoted-printable/i.test(params.ENCODING ?? "") || "QUOTED-PRINTABLE" in params;
  return quoted ? quotedPrintable(value, params.CHARSET) : value;
};

const parts = (item) => splitEscaped(rawValue(item), ";").map((p) => unescapeText(p).trim());
const single = (item) => unescapeText(rawValue(item)).trim();
const joined = (values) => values.flatMap((v) => v.split("\n")).map((v) => v.trim()).filter(Boolean).join(", ");

function read(card, item) {
  switch (item.name) {
    case "FN":
      card.full ||= single(item);
      break;
    case "N": {
      const [family = "", given = ""] = parts(item);
      card.family ||= family;
      card.given ||= given;
      break;
    }
    case "ORG":
      card.org ||= joined(parts(item));
      break;
    case "TEL": {
      const value = single(item).replace(/^tel:/i, "");
      if (value) card.phones.push(value);
      break;
    }
    case "EMAIL": {
      const value = single(item);
      if (value) card.emails.push(value);
      break;
    }
    case "ADR": {
      const value = joined(parts(item));
      if (value) card.addresses.push(value);
      break;
    }
    default:
      break;
  }
}

const blank = () => ({ full: "", family: "", given: "", org: "", phones: [], emails: [], addresses: [] });

function finish({ full, family, given, org, phones, emails, addresses }) {
  const person = full || [given, family].filter(Boolean).join(" ");
  const name = person || org || phones[0] || emails[0];
  return name ? { name, family, given, values: [...(org ? [org] : []), ...phones, ...emails, ...addresses] } : null;
}

// skipped counts cards that could not be used. broken means the text held no card at all.
export function parseVCards(text) {
  const cards = [];
  let skipped = 0;
  let card = null;
  let seen = false;
  for (const line of lines(text)) {
    const item = contentLine(line);
    if (!item) continue;
    const word = item.value.trim().toUpperCase();
    if (item.name === "BEGIN" && word === "VCARD") {
      if (card) skipped += 1;
      card = blank();
      seen = true;
    } else if (item.name === "END" && word === "VCARD") {
      const done = card && finish(card);
      if (done) cards.push(done);
      else if (card) skipped += 1;
      card = null;
    } else if (card) {
      read(card, item);
    }
  }
  if (card) skipped += 1;
  return { cards, skipped, broken: !seen };
}

// Family name, then given name. A card with no N sorts by its shown name.
export const byFamily = (a, b) => collator.compare(a.family || a.name, b.family || b.name)
  || collator.compare(a.given, b.given) || collator.compare(a.name, b.name);
