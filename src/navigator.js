import { newSeed, seeded, shuffled } from "./album-order.js";
import { BACKLIGHT_MODES } from "./settings.js";
import { VERSION } from "./version.js";

const BACKLIGHT_LABELS = {
  off: "backlightOff", "1sec": "backlight1", "2sec": "backlight2", "3sec": "backlight3",
  "5sec": "backlight5", always_on: "backlightAlways",
};
const SHUFFLE_VALUES = { off: "off", songs: "shuffleSongs", albums: "shuffleAlbums" };
const REPEAT_VALUES = { off: "off", one: "repeatOneValue", all: "repeatAllValue" };
const CLICKER_VALUES = { on: "on", off: "off" };
const NEXT = { shuffle: { off: "songs", songs: "off" }, repeat: { off: "one", one: "all", all: "off" }, clicker: { on: "off", off: "on" } };

const KINDS = { nowPlaying: "now-playing", brick: "game", name: "name" };
const identity = (entry) => `${entry.key}|${entry.ctx ?? ""}`;
const SONG_LISTS = new Set(["songs", "playlist", "artist", "artistSongs", "artistAlbum", "album", "genre", "genreArtist", "composer", "composerAll"]);
const HELP_LISTS = new Set(["playlists", "artists", "songs", "albums", "genres", "composers"]);
const FOLDER_MENUS = new Set(["folder", "extraFolder"]);

export class Navigator {
  stack = [{ key: "root" }];
  selection = 0;
  scrollRestore = null;
  userMoved = false;
  navCount = 0;
  memory = new Map();
  source = null;
  lastQueue = null;
  helpEntry = null;

  constructor(device) { this.device = device; }

  get top() { return this.stack[this.stack.length - 1]; }
  get kind() { return KINDS[this.top.key] ?? "list"; }

  // Rows

  rowsFor(entry) {
    const d = this.device;
    const s = d.strings;
    if (HELP_LISTS.has(entry.key) && d.showsHelp) {
      const line = (id, key) => ({ id, kind: "info", text: s.t(key), value: null, center: true, help: true });
      return [
        line("help-1", "noMusicYet"), line("help-2", "chooseAddFolder"), line("help-3", "toLinkMusic"),
        { id: "add-folder", kind: "action", action: "pickFolder", text: s.t("addFolder"), value: null, center: true, help: true },
      ];
    }
    return (d.product ? d.menus.rowsFor(entry, () => this.#plainRows(entry)) : null) ?? this.#plainRows(entry);
  }

  #plainRows(entry) {
    const d = this.device;
    const s = d.strings;
    const c = d.catalogue;
    const v = d.settings.values;
    const nav = (id, text, target) => ({ id, kind: "navigate", text, value: null, target });
    const none = { id: "no-music", kind: "info", text: s.t("noMusic"), value: null, center: true };
    const songRows = (songs) => (songs.length
      ? songs.map((song) => ({ id: song.id, kind: "play", text: song.name, value: null, song }))
      : [none]);

    switch (entry.key) {
      case "root": {
        const rows = [
          nav("playlists", s.t("playlists"), { key: "playlists" }),
          nav("artists", s.t("artists"), { key: "artists" }),
          nav("songs", s.t("songs"), { key: "songs" }),
          nav("settings", s.t("settings"), { key: "settings" }),
        ];
        if (d.playback.queue.length) rows.push(nav("nowPlaying", s.t("nowPlaying"), { key: "nowPlaying" }));
        if (d.importer?.waiting.size) {
          rows.unshift({ id: "reconnect", kind: "action", action: "reconnect", arrow: true, text: s.t("reconnect"), value: null });
        }
        return rows;
      }
      case "settings": {
        const rows = [
          nav("about", s.t("about"), { key: "about" }),
          { id: "shuffle", kind: "toggle", text: s.t("shuffle"), value: s.t(SHUFFLE_VALUES[v.shuffle]), field: "shuffle" },
          { id: "repeat", kind: "toggle", text: s.t("repeat"), value: s.t(REPEAT_VALUES[v.repeat]), field: "repeat" },
          nav("backlight", s.t("backlightTimer"), { key: "backlight" }),
          { id: "clicker", kind: "toggle", text: s.t("clicker"), value: s.t(CLICKER_VALUES[v.clicker]), field: "clicker" },
          nav("reset", s.t("resetAll"), { key: "reset" }),
        ];
        if (d.importEnabled) {
          rows.splice(-1, 0, nav("import", s.t("importRow"), { key: "import" }));
          rows.unshift({ ...nav("name", s.t("name"), { key: "name" }), value: d.deviceName, shrink: true });
        }
        return rows;
      }
      case "import":
        return d.importer?.rows() ?? [];
      case "folders":
        return d.importer?.folderRows() ?? [];
      case "folder":
        return d.importer?.folderActions(entry.ctx) ?? [];
      case "about":
        return [
          { id: "pod", kind: "info", text: d.deviceName, value: null, center: true },
          { id: "songs", kind: "info", text: s.t("aboutSongs"), value: s.number(c.songs.length) },
          ...(d.isTestPage ? [
            { id: "capacity", kind: "info", text: s.t("capacity"), value: s.size(9.2) },
            { id: "available", kind: "info", text: s.t("available"), value: s.size(4.5) },
            { id: "version", kind: "info", text: s.t("version"), value: "2644.1.0" },
          ] : [
            { id: "library", kind: "info", text: s.t("library"), value: s.bytes(d.importer.librarySize) },
            { id: "version", kind: "info", text: s.t("version"), value: VERSION },
          ]),
        ];
      case "backlight":
        return BACKLIGHT_MODES.map((mode) => ({ id: mode, kind: "choice", text: s.t(BACKLIGHT_LABELS[mode]), value: null, mode }));
      case "reset":
        return [
          { id: "cancel", kind: "cancel", text: s.t("cancel"), value: null },
          { id: "reset", kind: "reset", text: s.t("reset"), value: null },
        ];
      case "playlists":
        return c.playlists.length
          ? c.playlists.map((p) => nav(p.id, p.name, { key: "playlist", ctx: p.id }))
          : [none];
      case "artists": {
        const rows = c.artists.map((a) => nav(a.id, a.name, { key: "artist", ctx: a.id }));
        if (c.artists.length && c.songs.length) rows.unshift(nav("all", s.t("all"), { key: "songs", titleKey: "allSongs" }));
        return rows.length ? rows : [none];
      }
      case "songs":
        return songRows(c.songs);
      case "playlist":
        return songRows(c.songsFor(c.playlist(entry.ctx)?.songIds));
      case "artist":
        return songRows(c.songsFor(c.artist(entry.ctx)?.songIds));
      default:
        return [];
    }
  }

  get rows() { return this.rowsFor(this.top); }

  titleOf(entry) {
    const own = this.device.product ? this.device.menus.titleOf(entry) : null;
    if (own !== null) return own;
    const s = this.device.strings;
    const c = this.device.catalogue;
    switch (entry.key) {
      case "root": return this.device.deviceName;
      case "settings": return s.t("settings");
      case "name": return s.t("name");
      case "folders": return s.t("folders");
      case "folder": return this.device.importer?.folderName(entry.ctx) ?? s.t("folders");
      case "about": return s.t("about");
      case "backlight": return s.t("backlightTimer");
      case "reset": return s.t("resetAll");
      case "import": return s.t("importRow");
      case "playlists": return s.t("playlists");
      case "artists": return s.t("artists");
      case "songs": return s.t(entry.titleKey ?? "songs");
      case "playlist": return c.playlist(entry.ctx)?.name ?? s.t("playlists");
      case "artist": return c.artist(entry.ctx)?.name ?? s.t("artists");
      case "nowPlaying": return s.t("nowPlaying");
      default: return s.t("brick");
    }
  }

  get title() { return this.titleOf(this.top); }

  clampSelection() {
    const rows = this.rows;
    if (rows[0]?.help) {
      this.helpEntry = this.top;
      this.selection = rows.length - 1;
      return;
    }
    if (this.helpEntry === this.top) {
      this.helpEntry = null;
      this.selection = 0;
    }
    const last = rows.length - 1;
    if (this.selection > last) this.selection = Math.max(0, last);
  }

  // Root's rows shift by one when Reconnect comes or goes. Stay on the same row.
  reconnectChanged(shown) {
    if (this.top.key !== "root" || this.device.loading) return;
    this.selection = Math.max(0, this.selection + (shown ? 1 : -1));
    this.device.invalidate();
  }

  // Queue match

  currentRow(rows) {
    const { playback } = this.device;
    const q = this.lastQueue ?? { ids: playback.queue.map((s) => s.id), index: playback.index };
    const plays = rows.filter((r) => r.kind === "play");
    if (!plays.length || plays.length !== q.ids.length) return -1;
    if (plays.some((r, i) => r.id !== q.ids[i])) return -1;
    return rows.indexOf(plays[q.index]);
  }

  // Memory

  #save(entry, rows) {
    if (entry.key === "reset" || FOLDER_MENUS.has(entry.key)) return;
    const row = rows[this.selection];
    if (row) this.memory.set(identity(entry), { id: row.id, index: this.selection });
  }

  #recall(entry, rows) {
    const saved = this.memory.get(identity(entry));
    if (!saved) return -1;
    if (rows[saved.index]?.id === saved.id) return saved.index;
    return rows.findIndex((r) => r.id === saved.id);
  }

  #arrive(entry, rows) {
    if (entry.key === "backlight") {
      return Math.max(0, rows.findIndex((r) => r.mode === this.device.settings.values.backlight));
    }
    if (FOLDER_MENUS.has(entry.key)) return Math.max(0, rows.findIndex((r) => r.kind === "cancel"));
    const chosen = rows.findIndex((r) => r.current);
    if (chosen >= 0) return chosen;
    if (rows[0]?.help) return rows.length - 1;
    const current = this.currentRow(rows);
    if (current >= 0) return current;
    return Math.max(0, this.#recall(entry, rows));
  }

  setSource(entry) { this.source = { id: identity(entry), entry }; }

  queueChanged() {
    const { playback } = this.device;
    const song = playback.song;
    if (this.source && song && !this.stack.some((e) => identity(e) === this.source.id)) {
      this.memory.set(this.source.id, { id: song.id, index: playback.index });
    }
    if (this.kind !== "list" || this.userMoved) return;
    const current = this.currentRow(this.rows);
    if (current >= 0 && current !== this.selection) {
      this.selection = current;
      this.device.invalidate();
    }
  }

  // Movement

  move(delta) {
    if (this.kind === "name") return this.device.view.turn(delta);
    const rows = this.rows;
    if (!rows.length || rows[0].help) return false;
    const next = Math.min(rows.length - 1, Math.max(0, this.selection + delta));
    if (next === this.selection) return false;
    this.selection = next;
    this.userMoved = true;
    this.device.invalidate();
    return true;
  }

  // Push and pop

  #leave(toKey) {
    const d = this.device;
    d.wheel.listTracker.reset();
    d.modes.screenChanged(toKey === "nowPlaying");
    d.screenKeys.resetEscape();
    this.navCount += 1;
  }

  push(target, { idle = false } = {}) {
    const d = this.device;
    const take = d.shouldTakeFocus(idle);
    const entry = this.top;
    const rows = this.rows;
    entry.selection = this.selection;
    entry.scrollTop = d.view?.scrollTop ?? 0;
    entry.keepRow = idle && this.userMoved;
    entry.leftViaNowPlaying = rows[this.selection]?.id === "nowPlaying";
    this.#save(entry, rows);
    this.#leave(target.key);
    this.stack.push({ ...target });
    this.userMoved = false;
    this.selection = this.#arrive(this.top, this.rows);
    this.scrollRestore = null;
    d.showTop(1, take);
  }

  pop() {
    if (this.stack.length < 2) return false;
    const d = this.device;
    const take = d.shouldTakeFocus(false);
    this.#save(this.top, this.rows);
    const under = this.stack[this.stack.length - 2];
    this.#leave(under.key);
    this.stack.pop();
    this.userMoved = !!under.keepRow;
    const rows = this.rows;
    const current = this.userMoved ? -1 : this.currentRow(rows);
    const recalled = this.#recall(under, rows);
    const fallback = recalled >= 0 ? recalled : (this.userMoved ? under.selection ?? 0 : 0);
    this.selection = current >= 0 ? current : fallback;
    if (this.selection > rows.length - 1) this.selection = Math.max(0, rows.length - 1);
    this.scrollRestore = this.selection === under.selection ? under.scrollTop ?? null : null;
    d.showTop(-1, take);
    return true;
  }

  queueEnded(last) {
    if (this.source) {
      this.memory.delete(this.source.id);
      this.source = null;
    }
    if (this.top.key === "nowPlaying") {
      this.lastQueue = last;
      this.pop();
      this.lastQueue = null;
    }
    const top = this.top;
    if (top.leftViaNowPlaying) {
      this.selection = 0;
      this.scrollRestore = null;
      top.scrollTop = 0;
      this.device.view?.resetScroll?.();
    }
    this.clampSelection();
    this.device.invalidate();
  }

  // Row actions

  songsOf(target) {
    const own = this.device.product ? this.device.menus.songsOf(target) : null;
    return own ?? this.rowsFor(target).filter((r) => r.kind === "play").map((r) => r.song);
  }

  // A song from a folder that lost permission asks inside this same press. If that is
  // refused, the list stays and Reconnect stays on Root. By the time of the answer, the device
  // can be off or the window lost, and then it plays nothing (45).
  #whenAllowed(songs, chosen, play) {
    const d = this.device;
    const asked = d.importer?.permissionFor(songs, chosen);
    if (!asked) { play(); return; }
    const entry = this.top;
    asked.then((allowed) => { if (allowed && this.top === entry && !d.off && !d.lost) play(); });
  }

  #playRow(rows, index) {
    const row = rows[index];
    const plays = rows.filter((r) => r.kind === "play").map((r) => r.song);
    const current = this.currentRow(rows) === index && !this.device.playback.parked;
    this.#whenAllowed(current ? [] : plays, row.song, () => this.#startRow(rows, index));
  }

  #startRow(rows, index) {
    const d = this.device;
    const row = rows[index];
    if (this.currentRow(rows) === index) {
      if ((d.playback.loaded || d.playback.parked) && d.playback.paused) d.playback.resume();
    } else {
      const plays = rows.filter((r) => r.kind === "play");
      this.setSource(this.top);
      d.playback.start(plays.map((r) => r.song), plays.indexOf(row));
    }
    this.push({ key: "nowPlaying" });
  }

  activate() {
    const d = this.device;
    const rows = this.rows;
    const row = rows[this.selection];
    if (!row) return;
    switch (row.kind) {
      case "navigate":
        this.push(row.target);
        break;
      case "toggle":
        if (row.field === "library") d.importer.toggleLibrary();
        else d.settings.set(row.field, row.next ?? NEXT[row.field][d.settings.values[row.field]]);
        break;
      case "action":
        if (row.run) row.run();
        else d.importer[row.action](row.arg);
        if (row.pop) this.pop();
        break;
      case "choice":
        d.settings.chooseBacklight(row.mode);
        this.pop();
        break;
      case "pick":
        d.settings.set(row.field, row.pick);
        this.pop();
        break;
      case "shuffle":
        this.shuffleSongs();
        break;
      case "cancel":
        this.pop();
        break;
      case "reset":
        d.resetSettings();
        this.pop();
        break;
      case "play":
        this.#playRow(rows, this.selection);
        break;
      default:
        break;
    }
  }

  // Returns false when the row holds no songs.
  #startList(target) {
    const d = this.device;
    const songs = this.songsOf(target);
    if (!songs.length) return false;
    this.#whenAllowed(songs, null, () => {
      this.setSource(target);
      d.playback.start(songs);
      this.push({ key: "nowPlaying" });
    });
    return true;
  }

  // Spec 37: one fresh order of the whole library. The Shuffle setting has no say in it.
  // Spec 42: that holds on every press, even when Songs is already the queue source.
  shuffleSongs() {
    const d = this.device;
    const seed = newSeed();
    const songs = shuffled(d.catalogue.songs, seeded(seed));
    this.#whenAllowed(songs, null, () => {
      this.setSource({ key: "songs" });
      d.playback.start(songs, 0, seed);
      this.push({ key: "nowPlaying" });
    });
  }

  // Spec 37, ahead of rule 1 of 08: Play on a row that opens another list starts that list.
  playHighlighted() {
    if (this.kind !== "list") return false;
    const row = this.rows[this.selection];
    if (row?.kind === "shuffle") {
      this.shuffleSongs();
      return true;
    }
    if (!this.device.playback.loaded || row?.kind !== "navigate" || !SONG_LISTS.has(row.target.key)) return false;
    return this.source?.id !== identity(row.target) && this.#startList(row.target);
  }

  playSelection() {
    const d = this.device;
    const rows = this.rows;
    const row = rows[this.selection];
    const { song, parked } = d.playback;
    // Spec 43: the row of a parked queue's own source resumes it, and does not restart the list.
    const ownSource = parked && row?.kind === "navigate" && this.source?.id === identity(row.target);
    if (!ownSource && row?.kind === "navigate" && SONG_LISTS.has(row.target.key) && this.#startList(row.target)) return;
    if (row?.kind === "play") { this.#playRow(rows, this.selection); return; }
    if (parked) this.#whenAllowed([song], song, () => d.playback.resume());
    else if (d.playback.queue.length) d.playback.resume();
  }
}
