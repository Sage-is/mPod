export const keyOf = (text) => text.normalize("NFC").toLowerCase();

const percentDecode = (text) => text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
  try {
    return decodeURIComponent(run);
  } catch {
    return run;
  }
});

const segmentsOf = (text) => keyOf(text).replace(/\\/g, "/").split("/").filter(Boolean);

export function parsePlaylist(text) {
  const entries = [];
  let title = "";
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (/^#EXTINF:/i.test(line)) {
        const comma = line.indexOf(",");
        title = comma < 0 ? "" : line.slice(comma + 1).trim();
      }
      continue;
    }
    entries.push({ path: line, title });
    title = "";
  }
  return entries;
}

// Each variant is a list of lower-case path segments. A literal "%" in a real file
// name survives because the undecoded form is tried too.
export function entryVariants(path) {
  const isFile = /^file:/i.test(path);
  if (!isFile && /^[a-z][a-z0-9+.-]+:\/\//i.test(path)) return [];
  const bare = isFile ? path.replace(/^file:\/*/i, "") : path;
  const decoded = segmentsOf(percentDecode(bare));
  const literal = segmentsOf(bare);
  return decoded.join("/") === literal.join("/") ? [decoded] : [decoded, literal];
}

export function collapse(segments) {
  const out = [];
  for (const part of segments) {
    if (part === ".") continue;
    if (part !== "..") out.push(part);
    else if (!out.length) return null;
    else out.pop();
  }
  return out;
}
