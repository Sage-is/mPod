// Spec 37 and 40: the product page's own menus. Nothing here reaches the test page.
import { CONTRASTS, EQ_PRESETS } from "./eq-presets.js";
import { buildIndex } from "./browse.js";

const SHUFFLE_NEXT = { off: "songs", songs: "albums", albums: "off" };
// Between the two keys of a context. Not "\0": an album key already holds that.
const SEPARATOR = "\u0001";

const detail = (values) => values.map((text, i) => ({ id: `value-${i}`, kind: "detail", text, value: null, marquee: true }));

export class Menus {
  cache = null;

  constructor(device) { this.device = device; }

  get index() {
    const d = this.device;
    const c = d.catalogue;
    if (this.cache?.catalogue !== c) this.cache = { catalogue: c, index: buildIndex(c.songs, d.strings.t("unknownGenre")) };
    return this.cache.index;
  }

  #nav(id, text, target) { return { id, kind: "navigate", text, value: null, target }; }

  #groups(list, target) {
    return list.map((group) => this.#nav(`${target}:${group.key}`, group.name, { key: target, ctx: group.key }));
  }

  #none() {
    return { id: "no-music", kind: "info", text: this.device.strings.t("noMusic"), value: null, center: true };
  }

  #songs(songs) {
    if (!songs?.length) return [this.#none()];
    return songs.map((song) => ({ id: song.id, kind: "play", text: song.name, value: null, song }));
  }

  #all(rows) {
    return rows.length ? [this.#nav("all", this.device.strings.t("all"), { key: "songs", titleKey: "allSongs" }), ...rows] : [this.#none()];
  }

  #root() {
    const d = this.device;
    const s = d.strings;
    const rows = [];
    if (d.importer?.waiting.size) rows.push({ id: "reconnect", kind: "action", action: "reconnect", arrow: true, text: s.t("reconnect"), value: null });
    rows.push(
      this.#nav("playlists", s.t("playlists"), { key: "playlists" }),
      this.#nav("browse", s.t("browse"), { key: "browse" }),
      this.#nav("extras", s.t("extras"), { key: "extras" }),
      this.#nav("settings", s.t("settings"), { key: "settings" }),
    );
    if (d.catalogue.songs.length) rows.push({ id: "shuffle-songs", kind: "shuffle", text: s.t("shuffleLibrary"), value: null });
    if (d.playback.queue.length) rows.push(this.#nav("nowPlaying", s.t("nowPlaying"), { key: "nowPlaying" }));
    rows.push(this.#nav("about", s.t("about"), { key: "about" }));
    return rows;
  }

  #settings(base) {
    const d = this.device;
    const s = d.strings;
    const v = d.settings.values;
    const row = (id) => base.find((r) => r.id === id);
    const preset = EQ_PRESETS.find((p) => p.id === v.eq);
    return [
      row("name"),
      { ...row("shuffle"), next: SHUFFLE_NEXT[v.shuffle] },
      row("repeat"), row("backlight"),
      this.#nav("contrast", s.t("contrast"), { key: "contrast" }),
      { ...this.#nav("eq", s.t("eq"), { key: "eq" }), value: preset ? s.t(`eq-${preset.id}`) : s.t("off"), shrink: true },
      row("clicker"), row("import"), row("reset"),
    ];
  }

  #choices(field, options) {
    const current = this.device.settings.values[field];
    return options.map(([id, text]) => ({ id, kind: "pick", field, pick: id, text, value: null, current: id === current }));
  }

  rowsFor(entry, base) {
    const d = this.device;
    const s = d.strings;
    const { key, ctx } = entry;
    const [first, second] = String(ctx ?? "").split(SEPARATOR);
    switch (key) {
      case "root": return this.#root();
      case "settings": return this.#settings(base());
      case "browse":
        return [
          this.#nav("artists", s.t("artists"), { key: "artists" }),
          this.#nav("albums", s.t("albums"), { key: "albums" }),
          this.#nav("songs", s.t("songs"), { key: "songs" }),
          this.#nav("genres", s.t("genres"), { key: "genres" }),
          this.#nav("composers", s.t("composers"), { key: "composers" }),
        ];
      case "artists": return this.#all(this.#groups(this.index.artistList, "artist"));
      case "albums": return this.#all(this.#groups(this.index.albumList, "album"));
      case "genres": return this.#all(this.#groups(this.index.genreList, "genre"));
      case "composers": {
        const rows = this.#groups(this.index.composerList, "composer");
        return rows.length ? [this.#nav("all", s.t("all"), { key: "composerAll" }), ...rows] : [this.#none()];
      }
      case "artist": {
        const artist = this.index.artists.get(ctx);
        if (!artist || artist.albums.size < 2) return this.#songs(artist?.songs);
        const albums = this.index.albumsOf(artist).map((album) => this.#nav(
          `album:${album.key}`, album.name, { key: "artistAlbum", ctx: `${ctx}${SEPARATOR}${album.key}` },
        ));
        return [this.#nav("all-songs", s.t("allSongs"), { key: "artistSongs", ctx }), ...albums];
      }
      case "artistSongs": return this.#songs(this.index.artists.get(ctx)?.songs);
      case "artistAlbum": return this.#songs(this.index.artists.get(first)?.albums.get(second)?.songs);
      case "album": return this.#songs(this.index.albums.get(ctx)?.songs);
      case "genre": {
        const genre = this.index.genres.get(ctx);
        if (!genre) return [this.#none()];
        return this.index.artistsOf(genre).map((artist) => this.#nav(
          `artist:${artist.key}`, artist.name, { key: "genreArtist", ctx: `${ctx}${SEPARATOR}${artist.key}` },
        ));
      }
      case "genreArtist": return this.#songs(this.index.genres.get(first)?.artists.get(second)?.songs);
      case "composer": return this.#songs(this.index.composers.get(ctx)?.songs);
      case "composerAll": return this.#songs(this.index.composed);
      case "contrast": return this.#choices("contrast", CONTRASTS.map(({ id, key: label }) => [id, s.t(label)]));
      case "eq": return this.#choices("eq", [["off", s.t("off")], ...EQ_PRESETS.map(({ id }) => [id, s.t(`eq-${id}`)])]);
      case "extras":
        return [this.#nav("contacts", s.t("contacts"), { key: "contacts" }), this.#nav("calendar", s.t("calendar"), { key: "calendar" })];
      case "contacts": return d.extras.contactRows();
      case "calendar": return d.extras.eventRows();
      case "extraFolder": return d.extras.folderRows(ctx);
      case "contact": return detail(entry.card.values);
      case "event": {
        const { event } = entry;
        return detail([
          event.title || s.t("untitled"), s.fullDate(event.at),
          event.allDay ? s.allDayRange(event.at, event.end) : s.timeRange(event.at, event.end),
          ...(event.location ? [event.location] : []),
        ]);
      }
      default:
        return null;
    }
  }

  // The songs a row opens, also when that row opens a list of lists.
  songsOf(entry) {
    const { key, ctx } = entry;
    if (key === "artist") return this.index.artists.get(ctx)?.songs ?? [];
    if (key === "genre") return this.index.genres.get(ctx)?.songs ?? [];
    return null;
  }

  titleOf(entry) {
    const s = this.device.strings;
    const { key, ctx } = entry;
    const [first, second] = String(ctx ?? "").split(SEPARATOR);
    switch (key) {
      case "browse": return s.t("browse");
      case "albums": return s.t("albums");
      case "genres": return s.t("genres");
      case "composers": return s.t("composers");
      case "artist": return this.index.artists.get(ctx)?.name ?? s.t("artists");
      case "artistSongs": case "composerAll": return s.t("allSongs");
      case "artistAlbum": return this.index.artists.get(first)?.albums.get(second)?.name ?? s.t("albums");
      case "album": return this.index.albums.get(ctx)?.name ?? s.t("albums");
      case "genre": return this.index.genres.get(ctx)?.name ?? s.t("genres");
      case "genreArtist": return this.index.genres.get(first)?.artists.get(second)?.name ?? s.t("artists");
      case "composer": return this.index.composers.get(ctx)?.name ?? s.t("composers");
      case "contrast": return s.t("contrast");
      case "eq": return s.t("eq");
      case "extras": return s.t("extras");
      case "contacts": return s.t("contacts");
      case "calendar": case "event": return s.t("calendar");
      case "extraFolder": return s.t(ctx === "contacts" ? "contactsFolder" : "calendarFolder");
      case "contact": return entry.card.name;
      default: return null;
    }
  }
}
