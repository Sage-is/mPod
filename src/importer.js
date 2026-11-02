import { FileImport } from "./file-import.js";
import { FolderLinks } from "./folder-links.js";
import { openStore } from "./library-store.js";
import { LibraryViews } from "./library-views.js";
import { directoryOf, extensionOf, IMAGE, IMAGE_ORDER, LISTS, stem, TrackLibrary } from "./track-library.js";
import { el } from "./util.js";

// The import feature as the rest of the player sees it: its rows, its pickers, the files of
// its songs. The work itself is in track-library, folder-links, file-import and library-views.
export class Importer {
  generation = 0;
  running = Promise.resolve();
  started = null;
  openFiles = new Map();

  constructor(device) {
    this.device = device;
    this.library = new TrackLibrary(device, () => this.links.scansQueued > 0);
    this.links = new FolderLinks(this);
    this.files = new FileImport(this);
    this.views = new LibraryViews(this.library);
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

  get store() { return this.library.store; }
  get storedMeta() { return this.library.storedMeta; }
  get flushing() { return this.library.flushing; }
  get songs() { return this.library.songs; }
  get skipped() { return this.library.skipped; }
  get librarySize() { return this.library.librarySize; }
  get folders() { return this.links.folders; }
  get waiting() { return this.links.waiting; }
  get permissionsChecked() { return this.links.permissionsChecked; }

  songAt(ref) { return this.library.songAt(ref); }
  opened(song) { this.library.opened(song); }
  noteDuration(song, seconds) { this.library.noteDuration(song, seconds); }
  view(base) { return this.views.view(base); }
  link(handle) { return this.links.link(handle); }
  reconnect() { return this.links.reconnect(); }
  permissionFor(songs, chosen) { return this.links.permissionFor(songs, chosen); }
  rescan() { return this.links.rescan(); }
  rescanFolder(id) { return this.links.rescanFolder(id); }

  // Spec 44: a track its folder will not give up is skipped, and it is not counted.
  openFailed(song, cause, undecodable) {
    if (undecodable || !this.links.waitsFor(song, cause)) this.library.openFailed(song, undecodable);
  }

  get sessionOnly() { return !this.library.store || typeof window.showDirectoryPicker !== "function"; }
  get nothing() { return !this.library.songs.length; }

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
    this.library.store = await openStore();
    if (!this.library.store) return;
    try {
      const stored = await this.library.store.load();
      this.library.storedMeta = stored.meta;
      this.library.restore(stored, this.links);
    } catch (err) {
      // Spec 44: what is stored may be sound, so nothing here may write over it.
      console.warn("pod-player: library read failed", err);
      this.library.empty();
      this.library.store = null;
      this.library.storedMeta = {};
      this.links.folders.clear();
    }
    this.library.touch();
    this.links.permissionsChecked = this.links.checkPermissions();
  }

  async fileOf(song) {
    if (song.file) return song.file;
    const folder = this.links.folders.get(song.folderId);
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

  async folderImage(song) {
    const dirPath = directoryOf(song.path);
    let candidates = [];
    if (song.folderId) {
      const folder = this.links.folders.get(song.folderId);
      let dir = folder.handle;
      for (const name of dirPath.split("/").slice(1).filter(Boolean)) dir = await dir.getDirectoryHandle(name);
      for await (const [name, entry] of dir.entries()) {
        if (entry.kind === "file" && IMAGE.test(name)) candidates.push({ name, entry });
      }
    } else {
      candidates = (this.files.images.get(dirPath) ?? []).map((file) => ({ name: file.name, file }));
    }
    const rank = ({ name }) => IMAGE_ORDER.indexOf(stem(name).toLowerCase());
    const best = candidates.sort((a, b) => rank(a) - rank(b))[0];
    if (!best) return null;
    return best.file ?? best.entry.getFile();
  }

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
          value: this.links.scanSeen === null ? null : s.number(this.links.scanSeen) },
        { id: "folders", kind: "navigate", text: s.t("folders"), value: null, target: { key: "folders" } },
      );
    }
    rows.push(
      { id: "library", kind: "toggle", field: "library", text: s.t("library"),
        value: s.t(this.library.mode === "imported" ? "libraryImported" : "libraryAll") },
      { id: "songs", kind: "info", text: s.t("importedSongs"), value: s.number(this.library.songs.length) },
      { id: "skipped", kind: "info", text: s.t("skipped"), value: s.number(this.skipped) },
      { id: "clear", kind: "action", action: "clear", text: s.t("clearImported"), value: null },
    );
    if (session) rows.push({ id: "session", kind: "info", text: s.t("lastsUntilReload"), value: null });
    return rows;
  }

  folderRows() {
    const s = this.device.strings;
    const rows = [...this.links.folders.values()].map((folder) => ({
      id: folder.id, kind: "navigate", text: folder.name, shrink: true, target: { key: "folder", ctx: folder.id },
      value: folder.missing ? s.t("missing") : s.number(this.library.songs.filter((song) => song.folderId === folder.id).length),
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

  folderName(id) { return this.links.folders.get(id)?.name; }

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
    this.library.mode = this.library.mode === "all" ? "imported" : "all";
    this.library.saveMeta();
    this.device.invalidate();
  }

  add(files, { keep = true } = {}) {
    const generation = this.generation;
    const run = this.running.then(() => this.files.read(files, generation, keep && !!this.library.store));
    this.running = run.catch((err) => console.warn("pod-player: import failed", err));
    return this.running;
  }

  // Spec 41: a scan checks the generation between steps, so this ends any that is running.
  stopScans() {
    this.generation += 1;
    this.links.scansQueued = 0;
    this.links.scanSeen = null;
  }

  async removeFolder(id) {
    const folder = this.links.folders.get(id);
    if (!folder) return;
    const gone = new Set(this.library.songs.filter((s) => s.folderId === id));
    const { playback } = this.device;
    const holding = playback.queue.some((song) => gone.has(song));
    this.links.folders.delete(id);
    if (this.links.waiting.has(id)) this.links.setWaiting(folder, false);
    this.library.drop(gone);
    if (this.device.product) this.library.clearFolderMarks(id);
    for (const list of this.library.lists.filter((l) => l.folderId === id)) {
      this.library.lists.splice(this.library.lists.indexOf(list), 1);
      this.library.goneLists.add(list.id);
    }
    this.library.resolve();
    if (!this.library.songs.length) {
      this.library.mode = "all";
      this.library.activated = false;
    }
    this.views.cache = null;
    this.library.touch();
    this.library.goneFolders.add(id);
    this.library.saveMeta();
    await this.library.flush(true);
    if (holding) await playback.clear();
  }

  async clear() {
    this.generation += 1;
    const { playback } = this.device;
    const gone = this.library.songs;
    const holding = playback.queue.some((song) => song.imported);
    const wasWaiting = this.links.waiting.size > 0;
    this.library.empty();
    this.links.folders.clear();
    this.links.waiting.clear();
    this.files.images.clear();
    this.library.dirtyTracks.clear();
    this.library.dirtyLists.clear();
    this.library.goneTracks.clear();
    this.library.goneLists.clear();
    this.library.goneFolders.clear();
    this.library.metaDirty = false;
    this.links.scansQueued = 0;
    this.links.scanSeen = null;
    this.library.mode = "all";
    this.views.cache = null;
    if (wasWaiting) this.device.nav.reconnectChanged(false);
    this.library.touch();
    // Spec 46: the store first, because playback can be waiting on a file.
    const cleared = this.library.store?.clear().catch((err) => console.warn("pod-player: library clear failed", err));
    if (holding) await playback.clear();
    for (const song of gone) if (song.previewUrl) URL.revokeObjectURL(song.previewUrl);
    await cleared;
  }
}
