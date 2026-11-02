import { parsePlaylist } from "./m3u.js";
import { readTags } from "./tags.js";
import {
  AUDIO, BATCH, baseName, byPath, directoryOf, extensionOf, IMAGE, keyFor, LISTS, nextTask, pathOf, segmentsOf, stem,
} from "./track-library.js";

// Reading file lists: the session input and importFiles.
export class FileImport {
  images = new Map();

  constructor(importer) {
    this.importer = importer;
    this.device = importer.device;
    this.library = importer.library;
  }

  async read(files, generation, keep) {
    if (generation !== this.importer.generation) return;
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
      if (generation !== this.importer.generation) return;
      if (song && tracks[i].path.includes("/")) {
        const folder = tracks[i].path.slice(0, tracks[i].path.indexOf("/"));
        if (!folders.has(folder)) folders.set(folder, []);
        folders.get(folder).push(song);
      }
      if ((i + 1) % BATCH === 0) {
        this.library.touch();
        this.library.saveMeta();
        await nextTask();
        if (generation !== this.importer.generation) return;
      }
    }
    for (const [name, songs] of folders) this.#addFolderList(name, songs, keep);
    for (const list of lists) {
      await this.#addPlaylist(list, generation, keep);
      if (generation !== this.importer.generation) return;
    }
    this.library.resolve();
    this.library.touch();
    this.library.saveMeta();
    this.library.flush();
    await this.library.flushing;
    if (this.library.songs.length) this.library.askToPersist();
  }

  async #track({ file, path, extension }, generation, keep) {
    const key = keyFor(undefined, path, file.size, file.lastModified);
    const known = this.library.known.get(key);
    // Spec 46: a file imported again clears its own marks. What it does next may add one back.
    if (this.device.product) this.library.clearOwnMarks({ id: known?.id, path });
    if (known) {
      if (known.linked && !known.folderId) {
        known.linked = false;
        known.file = file;
        known.previewUrl = URL.createObjectURL(file);
      }
      return known;
    }
    if (this.library.isFull) {
      this.library.capped.add(key);
      return null;
    }
    let tags;
    try {
      if (!file.size) throw new Error("empty file");
      tags = await readTags(file, extension, this.device.product);
    } catch {
      if (generation === this.importer.generation) this.library.failed.add(key);
      return null;
    }
    if (generation !== this.importer.generation) return null;
    this.library.failed.delete(key);
    const song = {
      ...this.library.details(tags, path, file.size, file.lastModified),
      id: `import-${++this.library.nextId}`, file, previewUrl: URL.createObjectURL(file), stored: keep,
    };
    this.library.register(song);
    if (keep) this.library.dirtyTracks.add(song);
    this.library.activate();
    return song;
  }

  #addFolderList(name, songs, keep) {
    const fresh = new Set(songs);
    const rescan = this.library.lists.find((l) => l.folder && !l.folderId && l.name === name && l.songs.every((s) => fresh.has(s)));
    if (rescan) {
      rescan.songs = songs;
      this.library.dirtyLists.add(rescan);
    } else {
      const list = { id: `import-list-${++this.library.nextId}`, name, songs, folder: true, stored: keep };
      this.library.lists.push(list);
      this.library.dirtyLists.add(list);
    }
  }

  async #addPlaylist({ file, path }, generation, keep) {
    const key = keyFor(undefined, path, file.size, file.lastModified);
    if (this.library.listKeys.has(key)) return;
    let entries;
    try {
      entries = parsePlaylist(new TextDecoder("utf-8").decode(await file.arrayBuffer()));
    } catch {
      if (generation === this.importer.generation) this.library.failed.add(key);
      return;
    }
    if (generation !== this.importer.generation) return;
    this.library.failed.delete(key);
    this.library.listKeys.add(key);
    const list = {
      id: `import-list-${++this.library.nextId}`,
      name: stem(baseName(path)),
      source: "file",
      key,
      stored: keep,
      entries,
      songs: [],
      unmatched: 0,
      directory: segmentsOf(path).slice(0, -1),
    };
    this.library.lists.push(list);
    this.library.dirtyLists.add(list);
  }
}
