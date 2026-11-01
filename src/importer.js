import { Catalogue } from "./catalogue.js";
import { openStore } from "./library-store.js";
import { collapse, entryVariants, keyOf, parsePlaylist } from "./m3u.js";
import { readTags } from "./tags.js";
import { el } from "./util.js";

const AUDIO = new Set(["mp3", "m4a", "aac", "mp4", "wav", "ogg", "oga", "opus", "flac"]);
const LISTS = new Set(["m3u", "m3u8"]);
const IMAGE = /^(cover|folder|front|album|artwork)\.(jpg|jpeg|png|webp)$/i;
const IMAGE_ORDER = ["cover", "folder", "front", "album", "artwork"];
const FILE_LIMIT = 20000;
const BATCH = 100;

const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });
const extensionOf = (name) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
const directoryOf = (path) => path.slice(0, path.lastIndexOf("/") + 1);
const stem = (name) => (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name);
const pathOf = (file) => file.webkitRelativePath || file.name;
const keyFor = (folderId, path, size, modified) => `${folderId ?? ""}\0${path}\0${size}\0${modified}`;
const refOf = (folderId, path) => `${folderId ?? ""}\0${path}`;
const collator = new Intl.Collator("en", { numeric: true });
const byPath = (a, b) => collator.compare(a.path, b.path);
const idNumber = (id) => Number(id.slice(id.lastIndexOf("-") + 1));
const LEADING_NUMBER = /^\s*(?:\d{1,2}-)?(\d{1,3})(?:\s*[-._)]\s*|\s+)(?=\S)/;

function fromPath(path, strings) {
  const parts = path.split("/").filter(Boolean);
  const name = stem(parts.at(-1));
  const number = LEADING_NUMBER.exec(name);
  return {
    title: number ? name.slice(number[0].length) : name,
    track: number ? Number(number[1]) : undefined,
    album: parts.at(-2) ?? strings.t("unknownAlbum"),
    artist: parts.at(-3) ?? strings.t("unknownArtist"),
  };
}

const segmentsOf = (path) => path.split("/").filter(Boolean).map(keyOf);

const trackRecord = (s) => ({
  id: s.id, folderId: s.folderId ?? null, path: s.path, size: s.size, modified: s.modified,
  title: s.name, artist: s.artistName, album: s.albumName, track: s.track, genre: s.genre,
  duration: s.duration, art: s.hasArt, taggedTitle: s.taggedTitle,
});

const trackFromRecord = (r) => ({
  id: r.id, folderId: r.folderId ?? undefined, path: r.path, size: r.size, modified: r.modified,
  name: r.title, artistName: r.artist, albumName: r.album, track: r.track, genre: r.genre,
  duration: r.duration, hasArt: r.art, taggedTitle: r.taggedTitle,
  imported: true, linked: true, stored: true, segments: segmentsOf(r.path),
});

export class Importer {
  mode = "all";
  version = 0;
  generation = 0;
  running = Promise.resolve();
  cache = null;
  store = null;
  started = null;
  scanSeen = null;
  scansQueued = 0;
  folders = new Map();
  waiting = new Set();
  openFiles = new Map();
  images = new Map();
  dirtyTracks = new Set();
  dirtyLists = new Set();
  goneTracks = new Set();
  goneLists = new Set();
  flushing = Promise.resolve();
  persistAsked = false;

  constructor(device) {
    this.device = device;
    this.nextId = 0;
    this.artistIds = new Map();
    this.#empty();
    const inputs = (attrs, onPick) => {
      const input = el("input", "", { type: "file", hidden: "", tabindex: "-1", "aria-hidden": "true", ...attrs });
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", () => {
        const files = Array.from(input.files);
        input.value = "";
        onPick(files);
      });
      device.shadowRoot.append(input);
      return input;
    };
    this.folderInput = inputs({ webkitdirectory: "", multiple: "" }, (files) => this.add(files, { keep: !this.sessionOnly }));
    this.listInput = inputs({ accept: ".m3u,.m3u8", multiple: "" }, (files) => {
      this.add(files.filter((f) => LISTS.has(extensionOf(f.name))), { keep: !this.sessionOnly });
    });
  }

  #empty() {
    this.songs = [];
    this.lists = [];
    this.known = new Map();
    this.listKeys = new Set();
    this.paths = new Map();
    this.names = new Map();
    this.failed = new Set();
    this.capped = new Set();
    this.activated = false;
  }

  get skipped() {
    return this.lists.reduce((sum, list) => sum + (list.unmatched ?? 0), this.failed.size + this.capped.size);
  }

  get librarySize() { return this.songs.reduce((sum, song) => sum + song.size, 0); }

  get sessionOnly() { return !this.store || typeof window.showDirectoryPicker !== "function"; }
  get nothing() { return !this.songs.length; }

  // Startup. The promise settles once the stored library is on show; permission and
  // rescans carry on behind it.

  start() {
    if (!this.started) {
      this.started = this.#start();
      this.running = this.started.catch((err) => console.warn("pod-player: library start failed", err));
    }
    return this.started;
  }

  async #start() {
    this.store = await openStore();
    if (!this.store) return;
    try {
      this.#restore(await this.store.load());
    } catch (err) {
      console.warn("pod-player: library read failed", err);
    }
    this.#touch();
    this.#checkPermissions();
  }

  #restore({ folders, tracks, playlists, meta }) {
    for (const record of folders) {
      const handle = record.handle ?? window.__podHandles?.[record.testId] ?? null;
      this.folders.set(record.id, { ...record, handle });
    }
    tracks.sort((a, b) => idNumber(a.id) - idNumber(b.id));
    for (const record of tracks) this.#register(trackFromRecord(record));
    for (const folder of this.folders.values()) this.#orderFolder(folder);
    const byRef = new Map(this.songs.map((s) => [refOf(s.folderId, s.path), s]));
    playlists.sort((a, b) => idNumber(a.id) - idNumber(b.id));
    for (const record of playlists) {
      const list = { ...record, songs: (record.matched ?? []).map((ref) => byRef.get(ref)).filter(Boolean) };
      delete list.matched;
      this.lists.push(list);
      if (list.key) this.listKeys.add(list.key);
    }
    this.failed = new Set(meta.failed ?? []);
    this.capped = new Set(meta.capped ?? []);
    this.nextId = meta.nextId ?? 0;
    if (meta.library === "imported" || meta.library === "all") this.mode = meta.library;
    this.activated = this.songs.length > 0;
    this.#resolve();
    this.dirtyTracks.clear();
    this.dirtyLists.clear();
  }

  async #checkPermissions() {
    const ready = [];
    for (const folder of this.folders.values()) {
      const state = await this.#permission(folder);
      if (state === "granted") ready.push(folder);
      else if (folder.handle) this.#setWaiting(folder, true);
    }
    if (ready.length) this.#schedule(ready);
  }

  async #permission(folder) {
    if (!folder.handle) return "none";
    try {
      return await folder.handle.queryPermission({ mode: "read" });
    } catch {
      return "prompt";
    }
  }

  #setWaiting(folder, on) {
    const before = this.waiting.size;
    if (on) this.waiting.add(folder.id);
    else this.waiting.delete(folder.id);
    if (!!before !== !!this.waiting.size) this.device.nav.reconnectChanged(!before);
    this.device.invalidate();
  }

  // Must be called inside a press. Every request starts in that same turn.
  #request(folders) {
    return Promise.all(folders.map(async (folder) => {
      let state = "denied";
      try {
        state = await folder.handle.requestPermission({ mode: "read" });
      } catch (err) {
        console.warn("pod-player: permission request failed", err?.name ?? err);
      }
      if (state === "granted") this.#setWaiting(folder, false);
      return state === "granted" ? folder : null;
    })).then((granted) => granted.filter(Boolean));
  }

  get waitingFolders() { return [...this.waiting].map((id) => this.folders.get(id)).filter(Boolean); }

  reconnect() {
    return this.#request(this.waitingFolders).then((granted) => {
      if (granted.length) this.#schedule(granted);
    });
  }

  // Returns null when nothing is waiting, so the press can go on at once. Otherwise a
  // promise for whether `chosen`, or any of `songs` without one, can now be played.
  permissionFor(songs, chosen) {
    const ids = new Set(songs.map((s) => s.folderId).filter((id) => this.waiting.has(id)));
    if (!ids.size) return null;
    const folders = [...ids].map((id) => this.folders.get(id));
    return this.#request(folders).then((granted) => {
      if (granted.length) this.#schedule(granted);
      return chosen ? !this.waiting.has(chosen.folderId) : songs.some((s) => !this.waiting.has(s.folderId));
    });
  }

  // Files of linked songs

  async fileOf(song) {
    if (song.file) return song.file;
    const folder = this.folders.get(song.folderId);
    if (!folder?.handle) throw new Error("this track has no linked folder");
    const parts = song.path.split("/").slice(1);
    let dir = folder.handle;
    for (const name of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
    return (await dir.getFileHandle(parts.at(-1))).getFile();
  }

  acquire(song) {
    let slot = this.openFiles.get(song.id);
    if (!slot) {
      slot = { refs: 0, url: this.fileOf(song).then((file) => URL.createObjectURL(file)) };
      slot.url.catch(() => {});
      this.openFiles.set(song.id, slot);
    }
    slot.refs += 1;
    return slot.url;
  }

  release(song) {
    const slot = this.openFiles.get(song.id);
    if (!slot || --slot.refs > 0) return;
    this.openFiles.delete(song.id);
    slot.url.then((url) => URL.revokeObjectURL(url), () => {});
  }

  openFailed(song) {
    this.failed.add(`play\0${song.id}`);
    this.#saveMeta();
    this.device.invalidate();
  }

  noteDuration(song, seconds) {
    if (!song.imported || song.duration === seconds) return;
    song.duration = seconds;
    if (song.stored) {
      this.dirtyTracks.add(song);
      this.#flushSoon();
    }
  }

  async folderImage(song) {
    const dirPath = directoryOf(song.path);
    let candidates = [];
    if (song.folderId) {
      const folder = this.folders.get(song.folderId);
      let dir = folder.handle;
      for (const name of dirPath.split("/").slice(1).filter(Boolean)) dir = await dir.getDirectoryHandle(name);
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === "file" && IMAGE.test(name)) candidates.push({ name, entry });
      }
    } else {
      candidates = (this.images.get(dirPath) ?? []).map((file) => ({ name: file.name, file }));
    }
    const rank = ({ name }) => IMAGE_ORDER.indexOf(stem(name).toLowerCase());
    const best = candidates.sort((a, b) => rank(a) - rank(b))[0];
    if (!best) return null;
    return best.file ?? best.entry.getFile();
  }

  // Rows

  rows() {
    const s = this.device.strings;
    const session = this.sessionOnly;
    const rows = [
      { id: "add-folder", kind: "action", action: "pickFolder", text: s.t("addFolder"), value: null },
      { id: "add-playlists", kind: "action", action: "pickPlaylists", text: s.t("addPlaylists"), value: null },
    ];
    if (!session) {
      rows.push(
        { id: "rescan", kind: "action", action: "rescan", text: s.t("rescan"),
          value: this.scanSeen === null ? null : s.number(this.scanSeen) },
        { id: "folders", kind: "navigate", text: s.t("folders"), value: null, target: { key: "folders" } },
      );
    }
    rows.push(
      { id: "library", kind: "toggle", field: "library", text: s.t("library"),
        value: s.t(this.mode === "imported" ? "libraryImported" : "libraryAll") },
      { id: "songs", kind: "info", text: s.t("importedSongs"), value: s.number(this.songs.length) },
      { id: "skipped", kind: "info", text: s.t("skipped"), value: s.number(this.skipped) },
      { id: "clear", kind: "action", action: "clear", text: s.t("clearImported"), value: null },
    );
    if (session) rows.push({ id: "session", kind: "info", text: s.t("lastsUntilReload"), value: null });
    return rows;
  }

  folderRows() {
    const s = this.device.strings;
    const rows = [...this.folders.values()].map((folder) => ({
      id: folder.id, kind: "navigate", text: folder.name, shrink: true, target: { key: "folder", ctx: folder.id },
      value: folder.missing ? s.t("missing") : s.number(this.songs.filter((song) => song.folderId === folder.id).length),
    }));
    return rows.length ? rows : [{ id: "no-folders", kind: "info", text: s.t("noFolders"), value: null, center: true }];
  }

  folderActions(id) {
    const s = this.device.strings;
    return [
      { id: "rescan", kind: "action", action: "rescanFolder", arg: id, pop: true, text: s.t("rescan"), value: null },
      { id: "remove", kind: "action", action: "removeFolder", arg: id, pop: true, text: s.t("remove"), value: null },
      { id: "cancel", kind: "cancel", text: s.t("cancel"), value: null },
    ];
  }

  folderName(id) { return this.folders.get(id)?.name; }

  // Picking

  pickFolder() {
    if (this.sessionOnly) {
      this.folderInput.click();
      return;
    }
    window.showDirectoryPicker({ mode: "read" }).then((handle) => this.link(handle), (err) => {
      if (err?.name !== "AbortError") console.warn("pod-player: folder picker failed", err);
    });
  }

  pickPlaylists() { this.listInput.click(); }

  toggleLibrary() {
    this.mode = this.mode === "all" ? "imported" : "all";
    this.#saveMeta();
    this.device.invalidate();
  }

  add(files, { keep = true } = {}) {
    const generation = this.generation;
    const run = this.running.then(() => this.#read(files, generation, keep && !!this.store));
    this.running = run.catch((err) => console.warn("pod-player: import failed", err));
    return this.running;
  }

  link(handle) {
    const generation = this.generation;
    this.scansQueued += 1;
    const run = this.running.then(async () => {
      for (const folder of this.folders.values()) {
        if (await folder.handle?.isSameEntry?.(handle)) {
          await this.#scanQueued(folder, generation);
          return;
        }
      }
      const folder = {
        id: `folder-${++this.nextId}`, name: handle.name, handle, scannedAt: 0, missing: false,
        testId: handle.testId, listId: `import-list-${++this.nextId}`,
      };
      this.folders.set(folder.id, folder);
      await this.#saveFolder(folder);
      await this.#scanQueued(folder, generation);
    });
    this.running = run.catch((err) => console.warn("pod-player: link failed", err));
    return this.running;
  }

  rescan() {
    if (this.scansQueued) return Promise.resolve();
    const ready = [...this.folders.values()].filter((f) => f.handle && !this.waiting.has(f.id));
    const asked = this.reconnect();
    if (ready.length) this.#schedule(ready);
    return Promise.all([asked, this.running]);
  }

  rescanFolder(id) {
    const folder = this.folders.get(id);
    if (!folder?.handle) return Promise.resolve();
    if (this.waiting.has(id)) {
      return this.#request([folder]).then((granted) => { if (granted.length) this.#schedule(granted); });
    }
    this.#schedule([folder]);
    return this.running;
  }

  #schedule(folders) {
    const generation = this.generation;
    this.scansQueued += folders.length;
    const run = this.running.then(async () => {
      for (const folder of folders) await this.#scanQueued(folder, generation);
    });
    this.running = run.catch((err) => console.warn("pod-player: rescan failed", err));
    return this.running;
  }

  async #scanQueued(folder, generation) {
    if (generation !== this.generation) return;
    this.scanSeen ??= 0;
    this.device.invalidate();
    try {
      await this.#scan(folder, generation);
    } finally {
      if (generation === this.generation && --this.scansQueued === 0) this.scanSeen = null;
      this.device.invalidate();
    }
  }

  #touch() {
    this.version += 1;
    this.device.invalidate();
  }

  // Stored data

  #saveMeta() {
    if (!this.store) return;
    this.metaDirty = true;
    this.#flushSoon();
  }

  #saveFolder(folder) {
    if (!this.store) return Promise.resolve();
    const { handle, testId, ...rest } = folder;
    const record = testId ? { ...rest, testId, handle: null } : { ...rest, handle };
    return this.store.write({ put: { folders: [record] } }).catch((err) => console.warn("pod-player: folder save failed", err));
  }

  #flushSoon() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      this.#flush();
    });
  }

  #listRecord(list) {
    const { songs, ...rest } = list;
    return { ...rest, matched: songs.map((s) => refOf(s.folderId, s.path)) };
  }

  #flush() {
    if (!this.store) return Promise.resolve();
    const put = {};
    const remove = {};
    if (this.dirtyTracks.size) {
      put.tracks = [...this.dirtyTracks].filter((s) => s.stored).map(trackRecord);
      this.dirtyTracks = new Set();
    }
    if (this.dirtyLists.size) {
      put.playlists = [...this.dirtyLists].filter((l) => l.stored).map((l) => this.#listRecord(l));
      this.dirtyLists = new Set();
    }
    if (this.goneTracks.size) { remove.tracks = [...this.goneTracks]; this.goneTracks = new Set(); }
    if (this.goneLists.size) { remove.playlists = [...this.goneLists]; this.goneLists = new Set(); }
    if (this.metaDirty) {
      this.metaDirty = false;
      put.meta = [
        { key: "library", value: this.mode },
        { key: "nextId", value: this.nextId },
        { key: "failed", value: [...this.failed] },
        { key: "capped", value: [...this.capped] },
      ];
    }
    this.flushing = this.store.write({ put, remove }).catch((err) => console.warn("pod-player: library save failed", err));
    return this.flushing;
  }

  #askToPersist() {
    if (this.persistAsked || !this.store) return;
    this.persistAsked = true;
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch { /* the result is not depended on */ }
  }

  // Reading file lists: the session input and importFiles

  async #read(files, generation, keep) {
    if (generation !== this.generation) return;
    const tracks = [];
    const lists = [];
    for (const file of files) {
      const path = pathOf(file);
      const name = baseName(path);
      if (name.startsWith(".")) continue;
      const extension = extensionOf(name);
      if (AUDIO.has(extension)) tracks.push({ file, path, extension });
      else if (LISTS.has(extension)) lists.push({ file, path });
      else if (IMAGE.test(name)) {
        const dir = directoryOf(path);
        this.images.set(dir, [...(this.images.get(dir) ?? []), file]);
      }
    }
    tracks.sort(byPath);
    lists.sort(byPath);

    const folders = new Map();
    for (let i = 0; i < tracks.length; i++) {
      const song = await this.#track(tracks[i], generation, keep);
      if (generation !== this.generation) return;
      if (song && tracks[i].path.includes("/")) {
        const folder = tracks[i].path.slice(0, tracks[i].path.indexOf("/"));
        if (!folders.has(folder)) folders.set(folder, []);
        folders.get(folder).push(song);
      }
      if ((i + 1) % BATCH === 0) {
        this.#touch();
        this.#saveMeta();
        await nextTask();
        if (generation !== this.generation) return;
      }
    }
    for (const [name, songs] of folders) this.#addFolderList(name, songs, keep);
    for (const list of lists) {
      await this.#addPlaylist(list, keep);
      if (generation !== this.generation) return;
    }
    this.#resolve();
    this.#touch();
    this.#saveMeta();
    this.#flush();
    await this.flushing;
    if (this.songs.length) this.#askToPersist();
  }

  #register(song) {
    this.songs.push(song);
    this.known.set(keyFor(song.folderId, song.path, song.size, song.modified), song);
    this.paths.set(song.segments.join("/"), song);
    const name = song.segments.at(-1);
    if (!this.names.has(name)) this.names.set(name, []);
    this.names.get(name).push(song);
  }

  #activate() {
    if (this.activated) return;
    this.activated = true;
    this.mode = "imported";
    this.#saveMeta();
  }

  async #track({ file, path, extension }, generation, keep) {
    const key = keyFor(undefined, path, file.size, file.lastModified);
    const known = this.known.get(key);
    if (known) {
      if (known.linked && !known.folderId) {
        known.linked = false;
        known.file = file;
        known.previewUrl = URL.createObjectURL(file);
      }
      return known;
    }
    if (this.songs.length + this.failed.size >= FILE_LIMIT) {
      this.capped.add(key);
      return null;
    }
    let tags;
    try {
      if (!file.size) throw new Error("empty file");
      tags = await readTags(file, extension);
    } catch {
      this.failed.add(key);
      return null;
    }
    if (generation !== this.generation) return null;
    this.failed.delete(key);
    const song = {
      ...this.#details(tags, path, file.size, file.lastModified),
      id: `import-${++this.nextId}`, file, previewUrl: URL.createObjectURL(file), stored: keep,
    };
    this.#register(song);
    if (keep) this.dirtyTracks.add(song);
    this.#activate();
    return song;
  }

  #details(tags, path, size, modified) {
    const details = fromPath(path, this.device.strings);
    return {
      name: tags.title || details.title,
      artistName: tags.artist || details.artist,
      albumName: tags.album || details.album,
      imported: true,
      taggedTitle: !!tags.title,
      track: tags.track ?? details.track,
      genre: tags.genre,
      hasArt: !!tags.art,
      segments: segmentsOf(path),
      path, size, modified,
    };
  }

  #addFolderList(name, songs, keep) {
    const fresh = new Set(songs);
    const rescan = this.lists.find((l) => l.folder && !l.folderId && l.name === name && l.songs.every((s) => fresh.has(s)));
    if (rescan) {
      rescan.songs = songs;
      this.dirtyLists.add(rescan);
    } else {
      const list = { id: `import-list-${++this.nextId}`, name, songs, folder: true, stored: keep };
      this.lists.push(list);
      this.dirtyLists.add(list);
    }
  }

  async #addPlaylist({ file, path }, keep) {
    const key = keyFor(undefined, path, file.size, file.lastModified);
    if (this.listKeys.has(key)) return;
    let entries;
    try {
      entries = parsePlaylist(new TextDecoder("utf-8").decode(await file.arrayBuffer()));
    } catch {
      this.failed.add(key);
      return;
    }
    this.failed.delete(key);
    this.listKeys.add(key);
    const list = {
      id: `import-list-${++this.nextId}`,
      name: stem(baseName(path)),
      source: "file",
      key,
      stored: keep,
      entries,
      songs: [],
      unmatched: 0,
      directory: segmentsOf(path).slice(0, -1),
    };
    this.lists.push(list);
    this.dirtyLists.add(list);
  }

  // Linked folders

  async #walk(folder, generation) {
    const audio = [];
    const lists = [];
    const visit = async (dir, prefix, top) => {
      try {
        for await (const [name, entry] of dir.entries()) {
          if (generation !== this.generation) return;
          const path = `${prefix}/${name}`;
          if (entry.kind === "directory") {
            await visit(entry, path, false);
          } else if (!name.startsWith(".")) {
            const extension = extensionOf(name);
            if (AUDIO.has(extension)) audio.push({ path, entry, extension });
            else if (LISTS.has(extension)) lists.push({ path, entry });
          }
          if (++this.scanSeen % BATCH === 0) {
            this.device.invalidate();
            await nextTask();
          }
        }
      } catch (err) {
        err.atRoot ??= top;
        throw err;
      }
    };
    await visit(folder.handle, folder.name, true);
    audio.sort(byPath);
    lists.sort(byPath);
    return { audio, lists };
  }

  async #scan(folder, generation) {
    const live = () => generation === this.generation && this.folders.get(folder.id) === folder;
    if (!live() || !folder.handle) return;
    let found;
    try {
      found = await this.#walk(folder, generation);
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        this.#setWaiting(folder, true);
      } else if (err.atRoot && !folder.missing) {
        folder.missing = true;
        await this.#saveFolder(folder);
        this.#touch();
      } else if (!err.atRoot) {
        console.warn("pod-player: rescan stopped", err);
      }
      return;
    }
    if (!live()) return;
    const wasMissing = folder.missing;
    folder.missing = false;

    const existing = new Map(this.songs.filter((s) => s.folderId === folder.id).map((s) => [s.path, s]));
    const seen = new Set();
    const toRead = [];
    for (let i = 0; i < found.audio.length; i++) {
      const item = found.audio[i];
      let file;
      try {
        file = await item.entry.getFile();
      } catch {
        // An unreadable file stays listed. It only drops when it stops resolving.
        seen.add(item.path);
        this.failed.add(refOf(folder.id, item.path));
        continue;
      }
      if (!live()) return;
      this.failed.delete(refOf(folder.id, item.path));
      const known = existing.get(item.path);
      if (known) {
        seen.add(item.path);
        if (known.size !== file.size || known.modified !== file.lastModified) toRead.push({ ...item, file, known });
      } else {
        toRead.push({ ...item, file });
      }
      if ((i + 1) % BATCH === 0) {
        this.device.invalidate();
        await nextTask();
      }
    }

    const deleted = new Map([...existing].filter(([path]) => !seen.has(path)));
    let changed = false;
    for (let i = 0; i < toRead.length; i++) {
      if (await this.#readLinked(folder, toRead[i], deleted)) changed = true;
      if (!live()) return;
      if ((i + 1) % BATCH === 0) {
        this.#touch();
        await nextTask();
        if (!live()) return;
      }
    }
    if (deleted.size) {
      changed = true;
      this.#drop(new Set(deleted.values()));
    }
    if (changed || wasMissing) this.#orderFolder(folder);
    this.#folderList(folder);
    await this.#refreshLists(folder, found.lists, live);
    if (!live()) return;
    this.#resolve();
    folder.scannedAt = Date.now();
    await this.#saveFolder(folder);
    this.#touch();
    this.#saveMeta();
    this.#flush();
    await this.flushing;
    if (this.songs.length) this.#askToPersist();
  }

  async #readLinked(folder, { path, extension, file, known }, deleted) {
    const key = keyFor(folder.id, path, file.size, file.lastModified);
    if (!known && this.songs.length + this.failed.size >= FILE_LIMIT) {
      this.capped.add(key);
      return false;
    }
    let tags;
    try {
      if (!file.size) throw new Error("empty file");
      tags = await readTags(file, extension);
    } catch {
      this.failed.add(key);
      return false;
    }
    this.failed.delete(key);
    const details = this.#details(tags, path, file.size, file.lastModified);
    const moved = known ? null : [...deleted.values()].find((s) => s.size === file.size
      && s.name === details.name && s.artistName === details.artistName
      && s.albumName === details.albumName && s.track === details.track);
    const target = known ?? moved;
    if (target) {
      if (moved) deleted.delete(moved.path);
      this.known.delete(keyFor(folder.id, target.path, target.size, target.modified));
      Object.assign(target, details, moved ? {} : { duration: undefined });
      this.known.set(key, target);
      this.paths.set(target.segments.join("/"), target);
      this.dirtyTracks.add(target);
    } else {
      const song = { ...details, id: `import-${++this.nextId}`, linked: true, stored: true, folderId: folder.id };
      this.#register(song);
      this.dirtyTracks.add(song);
    }
    this.#activate();
    return true;
  }

  #drop(gone) {
    this.songs = this.songs.filter((s) => !gone.has(s));
    for (const song of gone) {
      this.known.delete(keyFor(song.folderId, song.path, song.size, song.modified));
      if (this.paths.get(song.segments.join("/")) === song) this.paths.delete(song.segments.join("/"));
      const name = song.segments.at(-1);
      const same = this.names.get(name)?.filter((s) => s !== song);
      if (same?.length) this.names.set(name, same);
      else this.names.delete(name);
      this.failed.delete(`play\0${song.id}`);
      this.dirtyTracks.delete(song);
      if (song.stored) this.goneTracks.add(song.id);
    }
    for (const list of this.lists) {
      if (list.entries || !list.songs.some((s) => gone.has(s))) continue;
      list.songs = list.songs.filter((s) => !gone.has(s));
      this.dirtyLists.add(list);
    }
  }

  #orderFolder(folder) {
    const mine = this.songs.filter((s) => s.folderId === folder.id).sort(byPath);
    if (!mine.length) return;
    const at = this.songs.findIndex((s) => s.folderId === folder.id);
    const rest = this.songs.filter((s) => s.folderId !== folder.id);
    rest.splice(at, 0, ...mine);
    this.songs = rest;
  }

  #folderList(folder) {
    const songs = this.songs.filter((s) => s.folderId === folder.id);
    let list = this.lists.find((l) => l.id === folder.listId);
    if (!list) {
      list = { id: folder.listId, name: folder.name, folder: true, folderId: folder.id, stored: true, songs: [] };
      this.lists.push(list);
    }
    list.songs = songs;
    this.dirtyLists.add(list);
  }

  // A folder's playlist files are read again when they change, and leave with their file.
  async #refreshLists(folder, found, live) {
    const paths = new Set(found.map((item) => item.path));
    const current = this.lists.filter((l) => l.folderId === folder.id && l.source === "folder-file");
    for (const list of current) {
      if (paths.has(list.path)) continue;
      this.lists.splice(this.lists.indexOf(list), 1);
      this.goneLists.add(list.id);
    }
    for (const { path, entry } of found) {
      let file;
      let entries;
      const list = current.find((l) => l.path === path);
      try {
        file = await entry.getFile();
        if (list && list.size === file.size && list.modified === file.lastModified) continue;
        entries = parsePlaylist(new TextDecoder("utf-8").decode(await file.arrayBuffer()));
      } catch {
        this.failed.add(refOf(folder.id, path));
        continue;
      }
      if (!live()) return;
      const fields = { entries, size: file.size, modified: file.lastModified, name: stem(baseName(path)) };
      if (list) {
        Object.assign(list, fields);
        this.dirtyLists.add(list);
      } else {
        const added = {
          ...fields, id: `import-list-${++this.nextId}`, source: "folder-file", folderId: folder.id, path,
          stored: true, songs: [], unmatched: 0, directory: segmentsOf(path).slice(0, -1),
        };
        this.lists.push(added);
        this.dirtyLists.add(added);
      }
    }
  }

  // Every playlist is resolved again after each import, so one added before its tracks
  // fills in later. Nothing counts as unmatched until there is music to match against.
  #resolve() {
    const anyMusic = this.songs.length > 0;
    for (const list of this.lists) {
      if (!list.entries) continue;
      const before = list.songs.map((s) => s.id).join();
      const unmatched = list.unmatched;
      list.songs = [];
      list.unmatched = 0;
      for (const entry of list.entries) {
        const song = this.#match(entry, list);
        if (song) {
          list.songs.push(song);
          if (entry.title && !song.taggedTitle) {
            song.name = entry.title;
            song.taggedTitle = true;
            this.dirtyTracks.add(song);
          }
        } else if (anyMusic) {
          list.unmatched += 1;
        }
      }
      if (list.unmatched !== unmatched || list.songs.map((s) => s.id).join() !== before) this.dirtyLists.add(list);
    }
  }

  #match(entry, list) {
    const variants = entryVariants(entry.path);
    for (const segments of variants) {
      const relative = collapse([...list.directory, ...segments]);
      const hit = relative && this.paths.get(relative.join("/"));
      if (hit) return hit;
    }
    for (const segments of variants) {
      const plain = segments.filter((s) => s !== "." && s !== "..");
      let best = null;
      let bestLength = 0;
      for (const song of this.names.get(plain.at(-1)) ?? []) {
        let length = 0;
        while (length < plain.length && length < song.segments.length
          && plain[plain.length - 1 - length] === song.segments[song.segments.length - 1 - length]) length++;
        if (length > bestLength) { best = song; bestLength = length; }
      }
      if (best) return best;
    }
    return null;
  }

  // Artist lists run album by album in first-seen order, then by track number.
  #artists() {
    const groups = new Map();
    this.songs.forEach((song, order) => {
      const key = keyOf(song.artistName);
      if (!groups.has(key)) groups.set(key, { name: song.artistName, albums: new Map(), rows: [] });
      const group = groups.get(key);
      if (!group.albums.has(song.albumName)) group.albums.set(song.albumName, group.albums.size);
      group.rows.push({ song, order, album: group.albums.get(song.albumName) });
      if (!this.artistIds.has(key)) this.artistIds.set(key, `import-artist-${++this.nextId}`);
    });
    return [...groups].map(([key, group]) => {
      group.rows.sort((a, b) => a.album - b.album
        || (a.song.track ?? Infinity) - (b.song.track ?? Infinity) || a.order - b.order);
      return { id: this.artistIds.get(key), key, name: group.name, songIds: group.rows.map((r) => r.song.id) };
    });
  }

  #playlists() {
    return this.lists.filter((l) => l.songs.length).map((l) => ({ id: l.id, name: l.name, songIds: l.songs.map((s) => s.id) }));
  }

  #merged(base) {
    const artists = base.artists.map((artist) => ({ ...artist }));
    const byName = new Map(artists.map((artist) => [keyOf(artist.name), artist]));
    for (const artist of this.#artists()) {
      const shared = byName.get(artist.key);
      if (shared) shared.songIds = [...shared.songIds, ...artist.songIds];
      else artists.push(artist);
    }
    return new Catalogue({
      songs: [...base.songs, ...this.songs],
      artists,
      playlists: [...base.playlists, ...this.#playlists()],
    });
  }

  view(base) {
    if (this.mode === "all" && !this.songs.length) return base;
    const c = this.cache;
    if (c?.base === base && c.mode === this.mode && c.version === this.version) return c.catalogue;
    const catalogue = this.mode === "imported"
      ? new Catalogue({ songs: this.songs.slice(), artists: this.#artists(), playlists: this.#playlists() })
      : this.#merged(base);
    this.cache = { base, mode: this.mode, version: this.version, catalogue };
    return catalogue;
  }

  async removeFolder(id) {
    const folder = this.folders.get(id);
    if (!folder) return;
    const gone = new Set(this.songs.filter((s) => s.folderId === id));
    const { playback } = this.device;
    const holding = playback.queue.some((song) => gone.has(song));
    this.folders.delete(id);
    if (this.waiting.has(id)) this.#setWaiting(folder, false);
    this.#drop(gone);
    for (const list of this.lists.filter((l) => l.folderId === id)) {
      this.lists.splice(this.lists.indexOf(list), 1);
      this.goneLists.add(list.id);
    }
    this.#resolve();
    if (!this.songs.length) {
      this.mode = "all";
      this.activated = false;
    }
    this.cache = null;
    this.#touch();
    this.store?.write({ remove: { folders: [id] } }).catch((err) => console.warn("pod-player: folder removal failed", err));
    this.#saveMeta();
    await this.#flush();
    if (holding) await playback.clear();
  }

  async clear() {
    this.generation += 1;
    const { playback } = this.device;
    const gone = this.songs;
    const holding = playback.queue.some((song) => song.imported);
    const wasWaiting = this.waiting.size > 0;
    this.#empty();
    this.folders.clear();
    this.waiting.clear();
    this.images.clear();
    this.dirtyTracks.clear();
    this.dirtyLists.clear();
    this.goneTracks.clear();
    this.goneLists.clear();
    this.metaDirty = false;
    this.scansQueued = 0;
    this.scanSeen = null;
    this.mode = "all";
    this.cache = null;
    if (wasWaiting) this.device.nav.reconnectChanged(false);
    this.#touch();
    if (holding) await playback.clear();
    for (const song of gone) if (song.previewUrl) URL.revokeObjectURL(song.previewUrl);
    await this.store?.clear().catch((err) => console.warn("pod-player: library clear failed", err));
  }
}
