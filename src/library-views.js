import { Catalogue } from "./catalogue.js";
import { keyOf } from "./m3u.js";

// What Playlists, Artists and Songs show, from the imported tracks and any base catalogue.
export class LibraryViews {
  cache = null;
  artistIds = new Map();

  constructor(library) { this.library = library; }

  // Artist lists run album by album in first-seen order, then by track number.
  #artists() {
    const groups = new Map();
    this.library.songs.forEach((song, order) => {
      const key = keyOf(song.artistName);
      if (!groups.has(key)) groups.set(key, { name: song.artistName, albums: new Map(), rows: [] });
      const group = groups.get(key);
      if (!group.albums.has(song.albumName)) group.albums.set(song.albumName, group.albums.size);
      group.rows.push({ song, order, album: group.albums.get(song.albumName) });
      if (!this.artistIds.has(key)) this.artistIds.set(key, `import-artist-${++this.library.nextId}`);
    });
    return [...groups].map(([key, group]) => {
      group.rows.sort((a, b) => a.album - b.album
        || (a.song.track ?? Infinity) - (b.song.track ?? Infinity) || a.order - b.order);
      return { id: this.artistIds.get(key), key, name: group.name, songIds: group.rows.map((r) => r.song.id) };
    });
  }

  #playlists() {
    return this.library.lists.filter((l) => l.songs.length).map((l) => ({ id: l.id, name: l.name, songIds: l.songs.map((s) => s.id) }));
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
      songs: [...base.songs, ...this.library.songs],
      artists,
      playlists: [...base.playlists, ...this.#playlists()],
    });
  }

  view(base) {
    if (this.library.mode === "all" && !this.library.songs.length) return base;
    const c = this.cache;
    if (c?.base === base && c.mode === this.library.mode && c.version === this.library.version) return c.catalogue;
    const catalogue = this.library.mode === "imported"
      ? new Catalogue({ songs: this.library.songs.slice(), artists: this.#artists(), playlists: this.#playlists() })
      : this.#merged(base);
    this.cache = { base, mode: this.library.mode, version: this.library.version, catalogue };
    return catalogue;
  }

}
