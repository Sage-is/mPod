const DEFAULTS = {
  playlists: "Playlists", artists: "Artists", songs: "Songs", settings: "Settings", nowPlaying: "Now Playing",
  all: "All", allSongs: "All Songs", noMusic: "No Music",
  about: "About", shuffle: "Shuffle", repeat: "Repeat", backlightTimer: "Backlight Timer",
  clicker: "Clicker", resetAll: "Reset All Settings",
  off: "Off", on: "On", shuffleSongs: "Songs", repeatOneValue: "One", repeatAllValue: "All",
  backlightOff: "Off", backlight1: "1 second", backlight2: "2 seconds", backlight3: "3 seconds",
  backlight5: "5 seconds", backlightAlways: "Always On",
  cancel: "Cancel", reset: "Reset",
  aboutSongs: "Songs", capacity: "Capacity", available: "Available", library: "Library", version: "Version",
  position: "{index} of {total}",
  shuffleOn: "Shuffle on", repeatOne: "Repeat one", repeatAll: "Repeat all",
  shuffleRepeatOne: "Shuffle on, Repeat one", shuffleRepeatAll: "Shuffle on, Repeat all",
  playbackProgress: "Playback Progress", volume: "Volume",
  menu: "Menu", back: "Back", forward: "Forward", play: "Play", pause: "Pause", select: "Select",
  brick: "Brick", gameOver: "GAME OVER", launchPrompt: "Press Center to Launch Ball",
  loading: "Loading", ready: "Ready", offline: "You are not connected to the internet",
  importRow: "Import", addFolder: "Add Folder", addPlaylists: "Add Playlists", library: "Library",
  libraryAll: "All", libraryImported: "Imported", importedSongs: "Songs", skipped: "Skipped",
  clearImported: "Clear Imported", unknownArtist: "Unknown Artist", unknownAlbum: "Unknown Album",
  reconnect: "Reconnect", rescan: "Rescan", folders: "Folders", remove: "Remove", missing: "Missing",
  noFolders: "No Folders", lastsUntilReload: "Lasts until reload", noMusicYet: "No music yet",
  chooseAddFolder: "Choose Add Folder", toLinkMusic: "to link your music.",
  name: "Name", delete: "Delete", done: "Done", space: "Space",
};

export class Strings {
  #i18n = null;
  #locale = { storefront: "us", language: "en-US" };
  #language = "en-US";
  #formatters = new Map();

  get i18n() { return this.#i18n; }
  set i18n(v) { this.#i18n = v ?? null; this.#refresh(); }
  get locale() { return this.#locale; }
  set locale(v) { this.#locale = v ?? { storefront: "us", language: "en-US" }; this.#refresh(); }

  #refresh() {
    this.#formatters.clear();
    this.#language = "en-US";
    if (!this.#i18n) return;
    try {
      this.#language = Intl.getCanonicalLocales(this.#locale?.language ?? "en-US")[0] ?? "en-US";
    } catch {
      console.warn("pod-player: invalid locale language", this.#locale?.language);
    }
  }

  t(key, params = {}) {
    if (this.#i18n?.t) {
      try {
        const out = this.#i18n.t(key, params);
        if (out && typeof out === "string") return out;
      } catch (err) {
        console.warn("pod-player: i18n failed for", key, err);
      }
    }
    const text = DEFAULTS[key];
    if (text === undefined) {
      console.warn("pod-player: missing string", key);
      return `**${key}**`;
    }
    return text.replace(/\{(\w+)\}/g, (raw, name) => (name in params ? String(params[name]) : raw));
  }

  #number(options) {
    const id = "n" + JSON.stringify(options);
    if (!this.#formatters.has(id)) this.#formatters.set(id, new Intl.NumberFormat(this.#language, options));
    return this.#formatters.get(id);
  }

  #list() {
    if (!this.#formatters.has("list")) {
      this.#formatters.set("list", new Intl.ListFormat(this.#language, { style: "long", type: "conjunction" }));
    }
    return this.#formatters.get("list");
  }

  number(n) { return this.#number({}).format(n); }
  size(gb) { return this.#number({ style: "unit", unit: "gigabyte" }).format(gb); }
  bytes(n) {
    const [unit, scale] = n < 1e9 ? ["megabyte", 1e6] : ["gigabyte", 1e9];
    return this.#number({ style: "unit", unit, maximumFractionDigits: 1 }).format(n / scale);
  }
  percent(volume) { return this.#number({ style: "percent" }).format(volume / 100); }

  time(seconds) {
    const s = Math.max(0, seconds);
    const minutes = this.#number({ useGrouping: false }).format(Math.floor(s / 60));
    return `${minutes}:${this.#number({ minimumIntegerDigits: 2 }).format(s % 60)}`;
  }

  rangeText(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const parts = [
      ["hour", Math.floor(total / 3600)],
      ["minute", Math.floor(total / 60) % 60],
      ["second", total % 60],
    ].filter(([, n]) => n > 0);
    if (!parts.length) parts.push(["second", 0]);
    return this.#list().format(parts.map(([unit, n]) => this.#number({ style: "unit", unit, unitDisplay: "long" }).format(n)));
  }
}
