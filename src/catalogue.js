export class Catalogue {
  constructor(data = {}) {
    this.songs = data.songs ?? [];
    this.artists = data.artists ?? [];
    this.playlists = data.playlists ?? [];
    this.byId = new Map(this.songs.map((s) => [s.id, s]));
  }

  songsFor(ids) {
    return (ids ?? []).map((id) => this.byId.get(id)).filter(Boolean);
  }

  playlist(id) { return this.playlists.find((p) => p.id === id); }
  artist(id) { return this.artists.find((a) => a.id === id); }
}

export async function fetchCatalogue(url) {
  if (!url) throw new Error("no catalogue-url");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`catalogue HTTP ${response.status}`);
  const data = await response.json();
  if (data?.schemaVersion !== 3) throw new Error(`catalogue schema ${data?.schemaVersion}`);
  if (!Array.isArray(data.songs) || !Array.isArray(data.artists) || !Array.isArray(data.playlists)) {
    throw new Error("catalogue is missing required arrays");
  }
  return new Catalogue(data);
}
