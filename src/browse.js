// Spec 37: the Browse trees, built from the shown library and rebuilt when it changes.
import { albumOf, byTrack } from "./album-order.js";
import { keyOf } from "./m3u.js";

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const sortName = (name) => name.replace(/^the\s+/i, "");
const byName = (a, b) => collator.compare(sortName(a.name), sortName(b.name)) || collator.compare(a.name, b.name);

function group(map, key, name) {
  if (!map.has(key)) map.set(key, { key, name, songs: [] });
  return map.get(key);
}

const sorted = (map) => [...map.values()].sort(byName);
const exactly = (a, b) => (a < b ? -1 : Number(a > b));
// Spec 43: an album is the pair in 37, so two albums with one title stay apart here too. Spec 45:
// the collator takes accents and number forms as equal, so the exact key has the last word.
const byAlbum = (a, b) => byName({ name: a.albumName ?? "" }, { name: b.albumName ?? "" })
  || collator.compare(albumOf(a), albumOf(b)) || exactly(albumOf(a), albumOf(b)) || byTrack(a, b);

function subgroups(songs, keyFor, nameFor) {
  const groups = new Map();
  for (const song of songs) group(groups, keyFor(song), nameFor(song)).songs.push(song);
  return groups;
}

export function buildIndex(songs, unknownGenre) {
  const artistKey = (song) => keyOf(song.artistName ?? "");
  const artistName = (song) => song.artistName ?? "";
  const albumName = (song) => song.albumName ?? "";

  const artists = subgroups(songs, artistKey, artistName);
  for (const artist of artists.values()) {
    artist.songs.sort(byAlbum);
    artist.albums = subgroups(artist.songs, albumOf, albumName);
    for (const album of artist.albums.values()) album.songs.sort(byTrack);
  }

  const albums = subgroups(songs, albumOf, albumName);
  for (const album of albums.values()) album.songs.sort(byTrack);

  const genres = subgroups(songs.filter((s) => s.genre), (s) => keyOf(s.genre), (s) => s.genre);
  const unknown = songs.filter((s) => !s.genre);
  const genreList = sorted(genres);
  if (unknown.length) genreList.push({ key: "", name: unknownGenre, songs: unknown });
  for (const genre of genreList) {
    genre.songs.sort(byAlbum);
    genre.artists = subgroups(genre.songs, artistKey, artistName);
  }

  const composed = songs.filter((s) => s.composer);
  const composers = subgroups(composed, (s) => keyOf(s.composer), (s) => s.composer);
  for (const composer of composers.values()) composer.songs.sort(byAlbum);

  return {
    artists, albums, composers, composed,
    genres: new Map(genreList.map((genre) => [genre.key, genre])),
    artistList: sorted(artists), albumList: sorted(albums), genreList, composerList: sorted(composers),
    artistsOf: (genre) => sorted(genre.artists),
    albumsOf: (artist) => sorted(artist.albums),
  };
}
