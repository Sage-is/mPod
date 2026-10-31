# 36. Listening features (our own addition)

All of this appears only with the `import` attribute. The comparison test page stays as it is. Data lives in the IndexedDB store from 32.

## Resume

Store the current queue source, track path, position and shuffle order every 5 seconds while playing, and on pause. On start, the root menu shows `Now Playing`, paused at that position, without autoplay. If the track is gone, resume nothing and show no error. Resuming a track from a waiting folder uses the rule in 32.

## Stats

Count a play when a track passes half its length or 4 minutes, whichever comes first. Store count and last played time per track.

Playlists gains these at the top, in order:

- `Recently Added`: newest 50, by first seen.
- `Most Played`: top 50, played at least once.
- `Recently Played`: last 50.

They are hidden while empty. `Clear Imported` clears them, and `Reset All Settings` does not.

## Albums and Genres

The root menu becomes `Playlists`, `Artists`, `Albums`, `Genres`, `Songs`, `Settings`, plus `Reconnect` and `Now Playing` where they apply.

- `Albums`: `All`, then albums by name. An album is the pair of album and album artist, or artist. A song list keeps track order, then file path.
- `Genres`: `All`, then genres by name, then artists in that genre, then songs. Missing genre is `Unknown Genre`, sorted last.
- `Artists` gains an albums level when an artist has more than one: `All Songs`, then albums.
- Sorting follows 09, ignoring a leading `The`.

Read the genre from tags. Add it to 29's fields.

With a catalogue and no imports the root menu stays exactly as in the original, so the comparison holds.

## On-The-Go

- In any song list, hold Select for 800 ms on a song to add it to the list. The row flashes twice, with a click.
- Hold Select on an album, artist, genre or playlist to add all its songs.
- This takes priority over the 5 second Brick hold only outside About.
- Playlists gains `On-The-Go` at the top once it holds a song. Selecting a song plays from there.
- Its last row is `Save`, which stores it as `On-The-Go 1`, then `2`, and empties the list. Saved lists sit with the others, and they can be removed: hold Select, then `Cancel` or `Remove`.
- The list survives restarts.

## Tests

Use fake handles from 32, plus real listening timers shortened by a test seam.
