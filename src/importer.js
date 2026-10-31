import { Catalogue } from "./catalogue.js";
import { collapse, entryVariants, keyOf, parsePlaylist } from "./m3u.js";
import { readTags } from "./tags.js";
import { el } from "./util.js";

const AUDIO = new Set(["mp3", "m4a", "aac", "mp4", "wav", "ogg", "oga", "opus", "flac"]);
const LISTS = new Set(["m3u", "m3u8"]);
const FILE_LIMIT = 20000;
const BATCH = 100;

const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });
const extensionOf = (name) => name.slice(name.lastIndexOf(".") + 1).toLowerCase();
const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);
const stem = (name) => (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name);
const pathOf = (file) => file.webkitRelativePath || file.name;
const keyFor = (file, path) => `${path}\0${file.size}\0${file.lastModified}`;
const collator = new Intl.Collator("en", { numeric: true });
const byPath = (a, b) => collator.compare(a.path, b.path);
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

export class Importer {
  mode = "all";
  version = 0;
  generation = 0;
  running = Promise.resolve();
  cache = null;

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
    this.folderInput = inputs({ webkitdirectory: "", multiple: "" }, (files) => this.add(files));
    this.listInput = inputs({ accept: ".m3u,.m3u8", multiple: "" }, (files) => {
      this.add(files.filter((f) => LISTS.has(extensionOf(f.name))));
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

  rows() {
    const s = this.device.strings;
    return [
      { id: "add-folder", kind: "action", action: "pickFolder", text: s.t("addFolder"), value: null },
      { id: "add-playlists", kind: "action", action: "pickPlaylists", text: s.t("addPlaylists"), value: null },
      { id: "library", kind: "toggle", field: "library", text: s.t("library"),
        value: s.t(this.mode === "imported" ? "libraryImported" : "libraryAll") },
      { id: "songs", kind: "info", text: s.t("importedSongs"), value: s.number(this.songs.length) },
      { id: "skipped", kind: "info", text: s.t("skipped"), value: s.number(this.skipped) },
      { id: "clear", kind: "action", action: "clear", text: s.t("clearImported"), value: null },
    ];
  }

  pickFolder() { this.folderInput.click(); }
  pickPlaylists() { this.listInput.click(); }

  toggleLibrary() {
    this.mode = this.mode === "all" ? "imported" : "all";
    this.device.invalidate();
  }

  add(files) {
    const generation = this.generation;
    const run = this.running.then(() => this.#read(files, generation));
    this.running = run.catch((err) => console.warn("pod-player: import failed", err));
    return this.running;
  }

  #touch() {
    this.version += 1;
    this.device.invalidate();
  }

  async #read(files, generation) {
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
    }
    tracks.sort(byPath);
    lists.sort(byPath);

    const folders = new Map();
    for (let i = 0; i < tracks.length; i++) {
      const song = await this.#track(tracks[i], generation);
      if (generation !== this.generation) return;
      if (song && tracks[i].path.includes("/")) {
        const folder = tracks[i].path.slice(0, tracks[i].path.indexOf("/"));
        if (!folders.has(folder)) folders.set(folder, []);
        folders.get(folder).push(song);
      }
      if ((i + 1) % BATCH === 0) {
        this.#touch();
        await nextTask();
        if (generation !== this.generation) return;
      }
    }
    for (const [name, songs] of folders) this.#addFolderList(name, songs);
    for (const list of lists) {
      await this.#addPlaylist(list);
      if (generation !== this.generation) return;
    }
    this.#resolve();
    this.#touch();
  }

  async #track({ file, path, extension }, generation) {
    const key = keyFor(file, path);
    const known = this.known.get(key);
    if (known) return known;
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
    const details = fromPath(path, this.device.strings);
    const segments = path.split("/").filter(Boolean).map(keyOf);
    const song = {
      id: `import-${++this.nextId}`,
      name: tags.title || details.title,
      artistName: tags.artist || details.artist,
      albumName: tags.album || details.album,
      previewUrl: URL.createObjectURL(file),
      imported: true,
      taggedTitle: !!tags.title,
      track: tags.track ?? details.track,
      segments,
    };
    this.songs.push(song);
    this.known.set(key, song);
    this.paths.set(segments.join("/"), song);
    const name = segments.at(-1);
    if (!this.names.has(name)) this.names.set(name, []);
    this.names.get(name).push(song);
    if (!this.activated) {
      this.activated = true;
      this.mode = "imported";
    }
    return song;
  }

  #addFolderList(name, songs) {
    const fresh = new Set(songs);
    const rescan = this.lists.find((l) => l.folder && l.name === name && l.songs.every((s) => fresh.has(s)));
    if (rescan) rescan.songs = songs;
    else this.lists.push({ id: `import-list-${++this.nextId}`, name, songs, folder: true });
  }

  async #addPlaylist({ file, path }) {
    const key = keyFor(file, path);
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
    this.lists.push({
      id: `import-list-${++this.nextId}`,
      name: stem(baseName(path)),
      entries,
      songs: [],
      unmatched: 0,
      directory: path.split("/").slice(0, -1).filter(Boolean).map(keyOf),
    });
  }

  // Every playlist is resolved again after each import, so one added before its tracks
  // fills in later. Nothing counts as unmatched until there is music to match against.
  #resolve() {
    const anyMusic = this.songs.length > 0;
    for (const list of this.lists) {
      if (!list.entries) continue;
      list.songs = [];
      list.unmatched = 0;
      for (const entry of list.entries) {
        const song = this.#match(entry, list);
        if (song) {
          list.songs.push(song);
          if (entry.title && !song.taggedTitle) {
            song.name = entry.title;
            song.taggedTitle = true;
          }
        } else if (anyMusic) {
          list.unmatched += 1;
        }
      }
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

  async clear() {
    this.generation += 1;
    const { playback } = this.device;
    const gone = this.songs;
    const holding = playback.queue.some((song) => song.imported);
    this.#empty();
    this.mode = "all";
    this.cache = null;
    this.#touch();
    if (holding) await playback.clear();
    for (const song of gone) URL.revokeObjectURL(song.previewUrl);
  }
}
