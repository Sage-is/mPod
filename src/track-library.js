import { collapse, entryVariants, keyOf } from "./m3u.js";

export const AUDIO = new Set(["mp3", "m4a", "aac", "mp4", "wav", "ogg", "oga", "opus", "flac"]);
export const LISTS = new Set(["m3u", "m3u8"]);
export const IMAGE = /^(cover|folder|front|album|artwork)\.(jpg|jpeg|png|webp)$/i;
export const IMAGE_ORDER = ["cover", "folder", "front", "album", "artwork"];
const FILE_LIMIT = 20000;
export const BATCH = 100;
export const TAG_VERSION = 2;

export const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });
export const extensionOf = (name) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
export const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
export const directoryOf = (path) => path.slice(0, path.lastIndexOf("/") + 1);
export const stem = (name) => (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name);
export const pathOf = (file) => file.webkitRelativePath || file.name;
export const keyFor = (folderId, path, size, modified) => `${folderId ?? ""}\0${path}\0${size}\0${modified}`;
export const refOf = (folderId, path) => `${folderId ?? ""}\0${path}`;
const collator = new Intl.Collator("en", { numeric: true });
export const byPath = (a, b) => collator.compare(a.path, b.path);
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

export const segmentsOf = (path) => path.split("/").filter(Boolean).map(keyOf);

const trackRecord = (s, product) => ({
  id: s.id, folderId: s.folderId ?? null, path: s.path, size: s.size, modified: s.modified,
  title: s.name, artist: s.artistName, album: s.albumName, track: s.track, genre: s.genre,
  duration: s.duration, art: s.hasArt, taggedTitle: s.taggedTitle,
  ...(product ? { composer: s.composer, albumArtist: s.albumArtist, tagVersion: s.tagVersion } : {}),
});

const trackFromRecord = (r) => ({
  id: r.id, folderId: r.folderId ?? undefined, path: r.path, size: r.size, modified: r.modified,
  name: r.title, artistName: r.artist, albumName: r.album, track: r.track, genre: r.genre,
  duration: r.duration, hasArt: r.art, taggedTitle: r.taggedTitle,
  composer: r.composer, albumArtist: r.albumArtist, tagVersion: r.tagVersion,
  imported: true, linked: true, stored: true, segments: segmentsOf(r.path),
});

// The imported tracks and playlists, and writing them to the stored library.
export class TrackLibrary {
  mode = "all";
  version = 0;
  nextId = 0;
  store = null;
  storedMeta = {};
  dirtyTracks = new Set();
  dirtyLists = new Set();
  goneTracks = new Set();
  goneLists = new Set();
  goneFolders = new Set();
  flushing = Promise.resolve();
  persistAsked = false;

  constructor(device, scanning) {
    this.device = device;
    this.scanning = scanning;
    this.empty();
  }

  get isFull() { return this.songs.length + this.failed.size >= FILE_LIMIT; }

  empty() {
    for (const song of this.songs ?? []) song.left = true;
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

  songAt(ref) { return this.songs.find((song) => refOf(song.folderId, song.path) === ref) ?? null; }

  restore({ folders, tracks, playlists, meta }, links) {
    this.device.extras?.restore(meta);
    for (const record of folders) {
      const handle = record.handle ?? window.__podHandles?.[record.testId] ?? null;
      links.folders.set(record.id, { ...record, handle });
    }
    tracks.sort((a, b) => idNumber(a.id) - idNumber(b.id));
    for (const record of tracks) this.register(trackFromRecord(record));
    for (const folder of links.folders.values()) this.orderFolder(folder);
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
    // A kill during a scan can store ids the counter never heard of (44).
    const ids = [...folders.flatMap((f) => [f.id, f.listId]), ...tracks.map((r) => r.id), ...playlists.map((l) => l.id)];
    this.nextId = ids.reduce((top, id) => (idNumber(id ?? "") > top ? idNumber(id) : top), meta.nextId ?? 0);
    if (meta.library === "imported" || meta.library === "all") this.mode = meta.library;
    this.activated = this.songs.length > 0;
    this.resolve();
    this.dirtyTracks.clear();
    this.dirtyLists.clear();
  }

  // A mark is one skipped file, and it lasts as long as its cause (46): `play` for a file that would
  // not open, or `decode` for one the element refused, which holds for that exact file. The rest are
  // a scan's: a file's key, or its ref if it would not open at all.
  clearMarks(wanted) {
    let cleared = false;
    for (const marks of [this.failed, this.capped]) {
      for (const mark of marks) if (wanted(mark) && marks.delete(mark)) cleared = true;
    }
    return cleared;
  }

  // Every mark of one file, by any size or date.
  clearOwnMarks({ id, folderId, path }) {
    const ref = refOf(folderId, path);
    return this.clearMarks((mark) => mark === `play\0${id}` || mark === ref || mark.startsWith(`${ref}\0`) || mark.startsWith(`decode\0${ref}\0`));
  }

  clearFolderMarks(folderId) {
    const prefix = refOf(folderId, "");
    this.clearMarks((mark) => mark.startsWith(prefix) || mark.startsWith(`decode\0${prefix}`));
  }

  // Spec 46: a scan that finishes replaces what it can judge. It cannot see a file that will not
  // decode, so that mark stays while the scan found the same file.
  replaceMarks(folder, songs, found) {
    const prefix = refOf(folder.id, "");
    const plays = new Set(songs.map((song) => `play\0${song.id}`));
    this.clearMarks((mark) => mark.startsWith(prefix) || plays.has(mark)
      || (mark.startsWith(`decode\0${prefix}`) && !this.known.has(mark.slice("decode\0".length))));
    for (const mark of found.failed) this.failed.add(mark);
    for (const mark of found.capped) this.capped.add(mark);
  }

  // A track that has left the library writes nothing more (46). On the product page, a failure
  // takes the place of any mark the file had, so that it counts once.
  openFailed(song, undecodable) {
    if (song.left) return;
    if (this.device.product) this.clearOwnMarks(song);
    this.failed.add(undecodable ? `decode\0${keyFor(song.folderId, song.path, song.size, song.modified)}` : `play\0${song.id}`);
    this.saveMeta();
    this.device.invalidate();
  }

  // Spec 44: a track that opens clears its own failed mark. Spec 46: every mark of its own.
  opened(song) {
    if (song.left) return;
    if (!(this.device.product ? this.clearOwnMarks(song) : this.failed.delete(`play\0${song.id}`))) return;
    this.saveMeta();
    this.device.invalidate();
  }

  noteDuration(song, seconds) {
    if (!song.imported || song.left || song.duration === seconds) return;
    song.duration = seconds;
    if (song.stored) {
      this.dirtyTracks.add(song);
      this.#flushSoon();
    }
  }

  touch() {
    this.version += 1;
    this.device.invalidate();
  }

  saveMeta() {
    if (!this.store) return;
    this.metaDirty = true;
    this.#flushSoon();
  }

  saveFolder(folder) {
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
      this.flush();
    });
  }

  #listRecord(list) {
    const { songs, ...rest } = list;
    return { ...rest, matched: songs.map((s) => refOf(s.folderId, s.path)) };
  }

  // Spec 42: while a scan runs its deletions wait for its last write, so stopping loses nothing.
  flush(deletions = !this.scanning()) {
    if (!this.store) return Promise.resolve();
    const put = {};
    const remove = {};
    if (this.dirtyTracks.size) {
      put.tracks = [...this.dirtyTracks].filter((s) => s.stored).map((s) => trackRecord(s, this.device.product));
      this.dirtyTracks = new Set();
    }
    if (this.dirtyLists.size) {
      put.playlists = [...this.dirtyLists].filter((l) => l.stored).map((l) => this.#listRecord(l));
      this.dirtyLists = new Set();
    }
    if (deletions && this.goneTracks.size) { remove.tracks = [...this.goneTracks]; this.goneTracks = new Set(); }
    if (deletions && this.goneLists.size) { remove.playlists = [...this.goneLists]; this.goneLists = new Set(); }
    if (deletions && this.goneFolders.size) { remove.folders = [...this.goneFolders]; this.goneFolders = new Set(); }
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

  askToPersist() {
    if (this.persistAsked || !this.store) return;
    this.persistAsked = true;
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch { /* the result is not depended on */ }
  }

  register(song) {
    this.songs.push(song);
    this.known.set(keyFor(song.folderId, song.path, song.size, song.modified), song);
    this.paths.set(song.segments.join("/"), song);
    const name = song.segments.at(-1);
    if (!this.names.has(name)) this.names.set(name, []);
    this.names.get(name).push(song);
  }

  activate() {
    if (this.activated) return;
    this.activated = true;
    this.mode = "imported";
    this.saveMeta();
  }

  details(tags, path, size, modified) {
    const details = fromPath(path, this.device.strings);
    return {
      name: tags.title || details.title,
      artistName: tags.artist || details.artist,
      albumName: tags.album || details.album,
      imported: true,
      taggedTitle: !!tags.title,
      track: tags.track ?? details.track,
      genre: tags.genre,
      composer: tags.composer,
      albumArtist: tags.albumArtist,
      tagVersion: TAG_VERSION,
      hasArt: !!tags.art,
      segments: segmentsOf(path),
      path, size, modified,
    };
  }

  drop(gone) {
    this.songs = this.songs.filter((s) => !gone.has(s));
    this.device.resume?.dropped(gone);
    for (const song of gone) {
      this.known.delete(keyFor(song.folderId, song.path, song.size, song.modified));
      if (this.paths.get(song.segments.join("/")) === song) this.paths.delete(song.segments.join("/"));
      const name = song.segments.at(-1);
      const same = this.names.get(name)?.filter((s) => s !== song);
      if (same?.length) this.names.set(name, same);
      else this.names.delete(name);
      this.failed.delete(`play\0${song.id}`);
      this.failed.delete(`decode\0${keyFor(song.folderId, song.path, song.size, song.modified)}`);
      this.dirtyTracks.delete(song);
      if (song.stored) this.goneTracks.add(song.id);
      song.left = true;
    }
    for (const list of this.lists) {
      if (list.entries || !list.songs.some((s) => gone.has(s))) continue;
      list.songs = list.songs.filter((s) => !gone.has(s));
      this.dirtyLists.add(list);
    }
  }

  orderFolder(folder) {
    const mine = this.songs.filter((s) => s.folderId === folder.id).sort(byPath);
    if (!mine.length) return;
    const at = this.songs.findIndex((s) => s.folderId === folder.id);
    const rest = this.songs.filter((s) => s.folderId !== folder.id);
    rest.splice(at, 0, ...mine);
    this.songs = rest;
  }

  // Every playlist is resolved again after each import, so one added before its tracks
  // fills in later. Nothing counts as unmatched until there is music to match against.
  resolve() {
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
}
