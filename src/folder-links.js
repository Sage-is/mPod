import { parsePlaylist } from "./m3u.js";
import { readTags } from "./tags.js";
import {
  AUDIO, BATCH, baseName, byPath, extensionOf, keyFor, LISTS, nextTask, refOf, segmentsOf, stem, TAG_VERSION,
} from "./track-library.js";

const REFUSED = new Set(["NotAllowedError", "SecurityError"]);

// Linked folders: their permission, and scanning them.
export class FolderLinks {
  folders = new Map();
  waiting = new Set();
  scanSeen = null;
  scansQueued = 0;
  permissionsChecked = null;

  constructor(importer) {
    this.importer = importer;
    this.device = importer.device;
    this.library = importer.library;
  }

  async checkPermissions() {
    const ready = [];
    for (const folder of this.folders.values()) {
      const state = await this.#permission(folder);
      if (state === "granted") ready.push(folder);
      else if (folder.handle) this.setWaiting(folder, true);
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

  setWaiting(folder, on) {
    const before = this.waiting.size;
    if (on) this.waiting.add(folder.id);
    else this.waiting.delete(folder.id);
    if (!!before !== !!this.waiting.size) this.device.nav.reconnectChanged(!before);
    this.device.invalidate();
  }

  // Whether a track failed to open only because its folder has no permission now. A refusal
  // nobody knew of yet makes the folder wait, so Reconnect shows.
  waitsFor(song, cause) {
    const folder = this.folders.get(song.folderId);
    if (!folder) return false;
    if (REFUSED.has(cause?.name)) this.setWaiting(folder, true);
    return this.waiting.has(folder.id);
  }

  #back(folder) {
    this.setWaiting(folder, false);
    this.device.resume?.folderBack(folder);
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
      if (state === "granted") this.#back(folder);
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

  // Spec 46: a rejected isSameEntry counts as no match.
  async #matching(folders, handle) {
    for (const folder of folders) {
      try {
        if (await folder.handle?.isSameEntry?.(handle)) return folder;
      } catch { /* a folder that cannot say is not this one */ }
    }
    return null;
  }

  // Spec 46: a link is tied to the folder it matched when it was asked, and ends if Remove has
  // taken that folder. Folders added since then are matched at its turn, so one linked twice in
  // quick succession stays one. Returns the folder to scan, or null if the link has ended.
  async #linked(handle, known, asked, generation) {
    const live = (folder) => generation === this.importer.generation && (!folder || this.folders.get(folder.id) === folder);
    const matched = await asked;
    if (!live(matched)) return null;
    const folder = matched ?? await this.#matching([...this.folders.values()].filter((f) => !known.includes(f)), handle);
    if (!live(folder)) return null;
    if (folder) {
      // Linked again: this handle is the live one, and it counts as Reconnect.
      folder.handle = handle;
      await this.library.saveFolder(folder);
      this.#back(folder);
      return folder;
    }
    const added = {
      id: `folder-${++this.library.nextId}`, name: handle.name, handle, scannedAt: 0, missing: false,
      testId: handle.testId, listId: `import-list-${++this.library.nextId}`,
    };
    this.folders.set(added.id, added);
    await this.library.saveFolder(added);
    return added;
  }

  link(handle) {
    const generation = this.importer.generation;
    const known = [...this.folders.values()];
    const asked = this.#matching(known, handle);
    this.scansQueued += 1;
    const run = this.importer.running.then(async () => {
      let folder = null;
      try {
        folder = await this.#linked(handle, known, asked, generation);
      } finally {
        if (!folder) this.#scanDone(generation);
      }
      if (folder) await this.#scanQueued(folder, generation);
    });
    this.importer.running = run.catch((err) => console.warn("pod-player: link failed", err));
    return this.importer.running;
  }

  rescan() {
    if (this.scansQueued) return Promise.resolve();
    const ready = [...this.folders.values()].filter((f) => f.handle && !this.waiting.has(f.id));
    const asked = this.reconnect();
    if (ready.length) this.#schedule(ready);
    return Promise.all([asked, this.importer.running]);
  }

  rescanFolder(id) {
    const folder = this.folders.get(id);
    if (!folder?.handle) return Promise.resolve();
    if (this.waiting.has(id)) {
      return this.#request([folder]).then((granted) => { if (granted.length) this.#schedule(granted); });
    }
    this.#schedule([folder]);
    return this.importer.running;
  }

  #schedule(folders) {
    const generation = this.importer.generation;
    this.scansQueued += folders.length;
    const run = this.importer.running.then(async () => {
      for (const folder of folders) await this.#scanQueued(folder, generation);
    });
    this.importer.running = run.catch((err) => console.warn("pod-player: rescan failed", err));
    return this.importer.running;
  }

  // Clear and a lost window reset the count themselves, so a stopped scan leaves it alone.
  #scanDone(generation) {
    if (generation === this.importer.generation && --this.scansQueued === 0) this.scanSeen = null;
    this.device.invalidate();
  }

  async #scanQueued(folder, generation) {
    if (generation !== this.importer.generation) return;
    this.scanSeen ??= 0;
    this.device.invalidate();
    try {
      await this.#scan(folder, generation);
    } finally {
      this.#scanDone(generation);
    }
  }

  // Spec 46: once it is stopped it counts nothing more, so each level looks again after the one below.
  async #walk(folder, live) {
    const audio = [];
    const lists = [];
    const visit = async (dir, prefix, top) => {
      try {
        for await (const [name, entry] of dir.entries()) {
          if (!live()) return;
          const path = `${prefix}/${name}`;
          if (entry.kind === "directory") {
            await visit(entry, path, false);
            if (!live()) return;
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
    const live = () => generation === this.importer.generation && this.folders.get(folder.id) === folder;
    if (!live() || !folder.handle) return;
    let found;
    try {
      found = await this.#walk(folder, live);
    } catch (err) {
      if (!live()) return;
      if (REFUSED.has(err.name)) {
        this.setWaiting(folder, true);
      } else if (err.atRoot && !folder.missing) {
        folder.missing = true;
        await this.library.saveFolder(folder);
        this.library.touch();
      } else if (!err.atRoot) {
        console.warn("pod-player: rescan stopped", err);
      }
      return;
    }
    if (!live()) return;
    const wasMissing = folder.missing;
    folder.missing = false;

    // Spec 46: on the product page the marks wait for the scan's end, so one that stops changes none.
    const marks = this.device.product ? { failed: new Set(), capped: new Set() } : this.library;
    const existing = new Map(this.library.songs.filter((s) => s.folderId === folder.id).map((s) => [s.path, s]));
    const seen = new Set();
    const toRead = [];
    for (let i = 0; i < found.audio.length; i++) {
      const item = found.audio[i];
      let file;
      try {
        file = await item.entry.getFile();
      } catch {
        if (!live()) return;
        // An unreadable file stays listed. It only drops when it stops resolving.
        seen.add(item.path);
        marks.failed.add(refOf(folder.id, item.path));
        continue;
      }
      if (!live()) return;
      marks.failed.delete(refOf(folder.id, item.path));
      const known = existing.get(item.path);
      if (known) {
        seen.add(item.path);
        if (known.size !== file.size || known.modified !== file.lastModified || this.#olderTags(known)) toRead.push({ ...item, file, known });
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
    let shown = false;
    let reread = false;
    for (let i = 0; i < toRead.length; i++) {
      const item = toRead[i];
      // Spec 46: decided now, because the read updates the record this compares with.
      const pure = item.known?.size === item.file.size && item.known.modified === item.file.lastModified;
      if (await this.#readLinked(folder, item, deleted, live, marks)) changed = true;
      if (!live()) return;
      if (pure) reread = true;
      else shown = true;
      if ((i + 1) % BATCH === 0) {
        // Spec 44: rereads are stored as they go, so a restart carries on, and they change
        // nothing on screen until the scan ends.
        if (shown) this.library.touch();
        if (reread) this.library.flush();
        shown = reread = false;
        await nextTask();
        if (!live()) return;
      }
    }
    if (deleted.size) {
      changed = true;
      this.library.drop(new Set(deleted.values()));
    }
    if (changed || wasMissing) this.library.orderFolder(folder);
    this.#folderList(folder);
    await this.#refreshLists(folder, found.lists, live, marks);
    if (!live()) return;
    if (marks !== this.library) this.library.replaceMarks(folder, [...existing.values()], marks);
    this.library.resolve();
    folder.scannedAt = Date.now();
    await this.library.saveFolder(folder);
    this.library.touch();
    this.library.saveMeta();
    this.library.flush(true);
    await this.library.flushing;
    if (this.library.songs.length) this.library.askToPersist();
  }

  // Spec 37: a record from an older tag reader is read again, once, even if unchanged.
  #olderTags(song) { return this.device.product && (song.tagVersion ?? 0) < TAG_VERSION; }

  // Spec 44: a read error leaves an older record due, so the next start tries it again.
  async #readLinked(folder, { path, extension, file, known }, deleted, live, marks) {
    const key = keyFor(folder.id, path, file.size, file.lastModified);
    if (!known && this.library.isFull) {
      marks.capped.add(key);
      return false;
    }
    let tags;
    try {
      if (!file.size) throw new Error("empty file");
      tags = await readTags(file, extension, this.device.product);
    } catch {
      if (live()) marks.failed.add(key);
      return false;
    }
    if (!live()) return false;
    marks.failed.delete(key);
    const details = this.library.details(tags, path, file.size, file.lastModified);
    const moved = known ? null : [...deleted.values()].find((s) => s.size === file.size
      && s.name === details.name && s.artistName === details.artistName
      && s.albumName === details.albumName && s.track === details.track);
    const target = known ?? moved;
    if (target) {
      if (moved) deleted.delete(moved.path);
      this.library.known.delete(keyFor(folder.id, target.path, target.size, target.modified));
      const unchanged = known?.size === file.size && known.modified === file.lastModified;
      Object.assign(target, details, moved || unchanged ? {} : { duration: undefined });
      this.library.known.set(key, target);
      this.library.paths.set(target.segments.join("/"), target);
      this.library.dirtyTracks.add(target);
    } else {
      const song = { ...details, id: `import-${++this.library.nextId}`, linked: true, stored: true, folderId: folder.id };
      this.library.register(song);
      this.library.dirtyTracks.add(song);
    }
    this.library.activate();
    return true;
  }

  #folderList(folder) {
    const songs = this.library.songs.filter((s) => s.folderId === folder.id);
    let list = this.library.lists.find((l) => l.id === folder.listId);
    if (!list) {
      list = { id: folder.listId, name: folder.name, folder: true, folderId: folder.id, stored: true, songs: [] };
      this.library.lists.push(list);
    }
    list.songs = songs;
    this.library.dirtyLists.add(list);
  }

  // A folder's playlist files are read again when they change, and leave with their file.
  async #refreshLists(folder, found, live, marks) {
    const paths = new Set(found.map((item) => item.path));
    const current = this.library.lists.filter((l) => l.folderId === folder.id && l.source === "folder-file");
    for (const list of current) {
      if (paths.has(list.path)) continue;
      this.library.lists.splice(this.library.lists.indexOf(list), 1);
      this.library.goneLists.add(list.id);
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
        if (!live()) return;
        marks.failed.add(refOf(folder.id, path));
        continue;
      }
      if (!live()) return;
      const fields = { entries, size: file.size, modified: file.lastModified, name: stem(baseName(path)) };
      if (list) {
        Object.assign(list, fields);
        this.library.dirtyLists.add(list);
      } else {
        const added = {
          ...fields, id: `import-list-${++this.library.nextId}`, source: "folder-file", folderId: folder.id, path,
          stored: true, songs: [], unmatched: 0, directory: segmentsOf(path).slice(0, -1),
        };
        this.library.lists.push(added);
        this.library.dirtyLists.add(added);
      }
    }
  }
}
