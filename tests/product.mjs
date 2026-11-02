// Shared by the suites for specs 36 to 41, which all drive the product page.
import { readFileSync } from "node:fs";
import { BASE, CLEAR_STORED, driver, sleep, waitFor } from "./h.mjs";

export const P = "document.querySelector('pod-player')";
export const ROOT = `${P}.shadowRoot`;
export const PRODUCT = BASE + "index.html";
const TONE = readFileSync("fixtures/audio/tone-0.wav").toString("base64");

// As in t12: injected before any page script, so a stored folder finds its handle after a reload.
// `b64` gives a file real bytes, for tags, and `broken` makes reading it fail, or `failAfter` every
// read past that many. `noRead` fails only the whole-file read, `fakeSize` reports a size without
// holding it, and `pad` adds blank lines. `junk` is bytes no decoder takes, the size of the tone.
// While window.__gate is set, a folder's walk waits for it. __openGate holds a file open, or with
// __gateOnly only the files it names. __sliceGate holds a tag read once __holdAfter reads have gone
// by, and __askGate holds the answer to a permission prompt. With __strict, a folder without
// permission refuses its files, as a real handle does.
export const FAKES = `
window.__reads = 0;
window.__permission = "granted";
window.__requests = [];
window.__tone = Uint8Array.from(atob("${TONE}"), (c) => c.charCodeAt(0));
class Counted extends File {
  slice(...a) {
    window.__reads++;
    this.sliced = (this.sliced ?? 0) + 1;
    if (this.broken || this.sliced > (this.failAfter ?? Infinity)) throw new DOMException("gone", "NotReadableError");
    const part = super.slice(...a);
    if (!window.__sliceGate || window.__reads <= (window.__holdAfter ?? 0)) return part;
    return { arrayBuffer: async () => { await window.__sliceGate; return part.arrayBuffer(); } };
  }
}
window.__tree = JSON.parse(sessionStorage.getItem("tree") ?? "null") ?? {};
window.__saveTree = () => sessionStorage.setItem("tree", JSON.stringify(window.__tree));
const refused = (owner) => window.__strict && (window.__permissions?.[owner] ?? window.__permission) !== "granted";
const fileHandle = (name, spec, owner) => ({
  kind: "file", name,
  getFile: async () => {
    if (window.__openGate && (!window.__gateOnly || window.__gateOnly.includes(name))) await window.__openGate;
    if (refused(owner) || spec.refused) throw new DOMException("no", "NotAllowedError");
    if (spec.unreadable) throw new DOMException("gone", "NotFoundError");
    const body = spec.junk ? [new Uint8Array(window.__tone.length).fill(0x78)]
      : spec.b64 ? [Uint8Array.from(atob(spec.b64), (c) => c.charCodeAt(0))]
      : spec.text !== undefined ? [spec.text, "\\n".repeat(spec.pad ?? 0)] : spec.audio ? [window.__tone] : ["x".repeat(spec.size ?? 10)];
    const out = new Counted(body, name, { lastModified: spec.stamp ?? 1000 });
    out.broken = !!spec.broken;
    out.failAfter = spec.failAfter;
    if (spec.fakeSize) Object.defineProperty(out, "size", { value: spec.fakeSize });
    if (spec.noRead) out.arrayBuffer = () => Promise.reject(new DOMException("gone", "NotReadableError"));
    return out;
  },
});
const dirHandle = (name, tree, testId, owner = testId) => ({
  kind: "directory", name, testId,
  async *entries() {
    window.__walks = (window.__walks ?? 0) + 1;
    if (window.__gate) await window.__gate;
    if (refused(owner)) throw new DOMException("no", "NotAllowedError");
    if (tree === window.__tree[testId] && window.__gone?.includes(testId)) throw new DOMException("gone", "NotFoundError");
    if (window.__denied?.includes(testId)) throw new DOMException("no", "NotAllowedError");
    for (const [n, v] of Object.entries(tree)) yield [n, v.file ? fileHandle(n, v, owner) : dirHandle(n, v, undefined, owner)];
  },
  getDirectoryHandle: async (n) => {
    if (!tree[n] || tree[n].file) throw new DOMException("gone", "NotFoundError");
    return dirHandle(n, tree[n], undefined, owner);
  },
  getFileHandle: async (n) => {
    if (!tree[n]?.file) throw new DOMException("gone", "NotFoundError");
    return fileHandle(n, tree[n], owner);
  },
  isSameEntry: async (other) => !!testId && other.testId === testId,
  queryPermission: async () => window.__permissions?.[testId] ?? window.__permission,
  requestPermission: async () => {
    window.__requests.push({ testId, active: navigator.userActivation.isActive });
    if (window.__askGate) await window.__askGate;
    const out = window.__answer ?? "granted";
    if (window.__permissions) window.__permissions[testId] = out;
    if (out === "granted") window.__permission = "granted";
    return out;
  },
});
window.__fake = (id) => dirHandle(id, window.__tree[id], id);
window.__podHandles = new Proxy({}, { get: (_, id) => (window.__tree[id] ? window.__fake(id) : undefined) });
`;

export const file = (extra = {}) => ({ file: true, ...extra });
export const tone = (extra = {}) => file({ audio: true, ...extra });

// A small tagged MP3 as base64: an ID3v2.3 tag, then silent frames an audio element can load.
export function tagged({ title, artist, album, track, genre, composer, albumArtist }, frames = 100) {
  const frame = (id, text) => {
    const body = Buffer.concat([Buffer.from([0]), Buffer.from(String(text), "latin1")]);
    const head = Buffer.alloc(10);
    head.write(id, "latin1");
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const fields = { TIT2: title, TPE1: artist, TALB: album, TRCK: track, TCON: genre, TCOM: composer, TPE2: albumArtist };
  const body = Buffer.concat(Object.entries(fields).filter(([, v]) => v !== undefined).map(([id, v]) => frame(id, v)));
  const size = [21, 14, 7, 0].map((shift) => (body.length >> shift) & 127);
  const silent = Buffer.alloc(417);
  silent.set([0xff, 0xfb, 0x90, 0x00]);
  return Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0, ...size]), body, ...Array.from({ length: frames }, () => silent)]).toString("base64");
}

export function product(page) {
  const d = driver(page);
  const out = {
    d,
    open: async ({ clear = true, url = PRODUCT, wait = "list" } = {}) => {
      if (clear) await page.evaluate(`sessionStorage.clear();${CLEAR_STORED}`).catch(() => {});
      await page.send("Page.bringToFront");
      await page.send("Page.navigate", { url });
      await sleep(100);
      await waitFor(() => page.evaluate(`typeof ${P}?.debugState === "function"`).catch(() => false), 5000);
      if (wait) await waitFor(async () => (await d.state().catch(() => null))?.view === wait, 4000);
    },
    reopen: (options) => out.open({ clear: false, ...options }),
    state: () => d.state(),
    titles: async () => (await d.state()).rows.map((r) => r.text),
    value: async (text) => (await d.state()).rows.find((r) => r.text === text)?.value,
    pick: async (text) => {
      const rows = (await d.state()).rows;
      const at = rows.findIndex((r) => r.text === text);
      if (at < 0) throw new Error(`no row ${text} in ${rows.map((r) => r.text)}`);
      let sel = rows.findIndex((r) => r.selected);
      while (sel < at) { await d.key("ArrowDown"); sel++; }
      while (sel > at) { await d.key("ArrowUp"); sel--; }
      await d.key("ArrowRight");
      await sleep(280);
    },
    highlight: async (text) => {
      const rows = (await d.state()).rows;
      const at = rows.findIndex((r) => r.text === text);
      if (at < 0) throw new Error(`no row ${text} in ${rows.map((r) => r.text)}`);
      let sel = rows.findIndex((r) => r.selected);
      while (sel < at) { await d.key("ArrowDown"); sel++; }
      while (sel > at) { await d.key("ArrowUp"); sel--; }
    },
    back: async (n = 1) => { for (let i = 0; i < n; i++) { await d.key("ArrowLeft"); await sleep(280); } },
    focusRing: async () => { await d.press("menu"); await sleep(280); },
    setTree: (id, tree) => page.evaluate(`window.__tree[${JSON.stringify(id)}]=${JSON.stringify(tree)};__saveTree();0`),
    link: (id) => page.evaluate(`${P}.linkFolder(__fake(${JSON.stringify(id)})).then(()=>1)`),
    idle: () => page.evaluate(`${P}.importer.running.then(()=>1)`),
    meta: () => page.evaluate(`new Promise((res,rej)=>{const o=indexedDB.open("mpod");o.onerror=()=>rej(o.error);o.onsuccess=()=>{const db=o.result;const q=db.transaction("meta").objectStore("meta").getAll();q.onsuccess=()=>{db.close();res(Object.fromEntries(q.result.map((r)=>[r.key,r.value])))}}})`),
    tracks: () => page.evaluate(`new Promise((res,rej)=>{const o=indexedDB.open("mpod");o.onerror=()=>rej(o.error);o.onsuccess=()=>{const db=o.result;const q=db.transaction("tracks").objectStore("tracks").getAll();q.onsuccess=()=>{db.close();res(q.result)}}})`),
    stored: () => page.evaluate("JSON.parse(localStorage.getItem('pod-player:settings'))"),
    np: async () => (await d.state()).nowPlaying,
  };
  return out;
}
