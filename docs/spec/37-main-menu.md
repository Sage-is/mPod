# 37. Main menu and Browse (our own addition)

Everything here applies only without `catalogue-url`. With it, every menu stays as the original, so the comparison holds. This replaces the root menu wording in 29 to 36.

## Root

Rows, in order:

1. `Reconnect`, where 32 calls for it
2. `Playlists`
3. `Browse`
4. `Extras`, see 38
5. `Settings`
6. `Shuffle Songs`, only while the library holds a song
7. `Now Playing`, only with a queue
8. `About`

`Now Playing` sits above `About` so it stays on the first screen. `About` opens the same screen as before, and holding Select there still opens Brick. It leaves Settings.

Settings becomes: `Name`, `Shuffle`, `Repeat`, `Backlight Timer`, `Contrast`, `EQ`, `Clicker`, `Import`, `Reset All Settings`. Contrast and EQ are in 40.

## Shuffle Songs

Select or Play/Pause builds one fresh random order of the whole library, starts it at its first song, and pushes Now Playing. The queue source is Songs. The Shuffle setting does not change. The position reads `1 of N`.

## Browse

Rows: `Artists`, `Albums`, `Songs`, `Genres`, `Composers`.

- `Artists`: `All`, then artists by name. An artist with more than one album gains a level: `All Songs`, then albums.
- `Albums`: `All`, then albums by name. An album is the pair of album and album artist, or artist. Its song list keeps track order, then file path.
- `Genres`: `All`, then genres by name, then artists in that genre, then songs. A missing genre is `Unknown Genre`, sorted last.
- `Composers`: `All`, then composers by name, then songs. A song with no composer is left out of this tree, and `All` lists the songs that have one.

Sorting follows 09, ignoring a leading `The`. Selection memory (10) holds on every level. The help screen from 32 appears on `Playlists` and on each Browse list while there is no music.

## Tags

Read the composer from `TCOM`, `TCM`, `©wrt` and Vorbis `COMPOSER`, and add it to the track index in 32.

Stored tracks have no composer yet. Keep a tag version on each record. A rescan rereads a record with an older version once. The rule that unchanged files are not read otherwise stands.

## Play on a highlighted list

This changes rule 1 of 08's Play/Pause. A track is loaded, a list is showing, and the selected row opens something that holds songs: a playlist, artist, album, genre, composer, `All`, `All Songs` or `Songs`. If that list is not the current queue source, Play/Pause starts it, as rule 3 does, and does not pause.

If it is the current queue source, the row is a song, or the row holds no songs, 08 stands.

## Tests

Check the root order in each state, Browse on each level, the composer tag in every format, the once-only reread, `Shuffle Songs` leaving the setting alone, and Play on a highlighted list both ways. The 45 scenarios stay the same.
