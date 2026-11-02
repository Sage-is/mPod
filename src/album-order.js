// Spec 40: Shuffle Albums. An album is the pair of album and album artist, or artist (37).
import { keyOf } from "./m3u.js";

const collator = new Intl.Collator("en", { numeric: true });

export const albumOf = (song) => `${keyOf(song.albumName ?? "")}\0${keyOf(song.albumArtist || song.artistName || "")}`;

export const byTrack = (a, b) => (a.track ?? Infinity) - (b.track ?? Infinity) || collator.compare(a.path ?? "", b.path ?? "");

// Spec 42: a queue stores a seed, not an order, so that a new start can build the order again.
export const newSeed = () => 1 + Math.floor(Math.random() * 2147483645);

export function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

export function shuffled(items, random = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Queue indices in play order. With no start, the first song of a random album leads.
export function albumShuffle(queue, start = null, random = Math.random) {
  const albums = new Map();
  queue.forEach((song, index) => {
    const album = albumOf(song);
    if (!albums.has(album)) albums.set(album, []);
    albums.get(album).push(index);
  });
  for (const indices of albums.values()) indices.sort((a, b) => byTrack(queue[a], queue[b]));
  const mixed = shuffled([...albums.keys()], random);
  const first = start === null ? mixed[0] : albumOf(queue[start]);
  const own = albums.get(first);
  const place = start === null ? 0 : own.indexOf(start);
  const others = mixed.filter((album) => album !== first).flatMap((album) => albums.get(album));
  return [...own.slice(place), ...others, ...own.slice(0, place)];
}

// Queue indices in play order for a shuffle mode (true or "albums"), with `lead` first.
export function playOrder(queue, mode, lead, random = Math.random) {
  const leading = new Set(lead);
  const rest = queue.map((_, i) => i).filter((i) => !leading.has(i));
  if (mode !== "albums") return [...lead, ...shuffled(rest, random)];
  return [...lead, ...albumShuffle(queue, lead[0], random).filter((i) => !leading.has(i))];
}
