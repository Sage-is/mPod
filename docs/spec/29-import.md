# 29. Import (our own addition)

This feature is new. It lets a person play their own music. Everything else in the spec stays as it is.

## Switch

Import exists only when the element has the boolean attribute `import`. Without it, nothing changes: no row, no state, and `debugState()` is identical to before.

## Settings row

With the attribute, Settings gains one row, `Import`, with an arrow, directly above `Reset All Settings`.

## Import screen

Title `Import`. Rows, in order:

| Row | Value | Select does |
|---|---|---|
| `Add Folder` | none | Opens the browser's folder picker |
| `Add Playlists` | none | Opens a file picker for `.m3u` and `.m3u8`, several allowed |
| `Library` | `All` or `Imported` | Toggles, as Shuffle does in Settings |
| `Songs` | imported count | Nothing; informational |
| `Skipped` | count | Nothing; informational |
| `Clear Imported` | none | Removes all imported music at once |

Open the picker synchronously inside the activating press or key, or the browser refuses it. Use a hidden file input with `webkitdirectory` inside the shadow root. Cancelling a picker changes nothing.

While files are read, the `Songs` value counts up and the screen stays responsive: yield to the event loop at least every 200 files. Stop at 20,000 files and add the rest to `Skipped`.

## Reading a folder

- Accept `.mp3 .m4a .aac .mp4 .wav .ogg .oga .opus .flac`, in any letter case. Other files are ignored and are not counted as skipped, except `.m3u` and `.m3u8`, which load as playlists.
- Skip files whose name starts with a dot.
- A track that cannot be read adds 1 to `Skipped`.
- Each chosen folder also becomes one playlist, named after that folder, with its songs in path order.

## Track details

Read tags from the file itself, using no library. Read ID3v2 for MP3 (title, artist, album, track) and the iTunes-style atoms for M4A and MP4, including files whose metadata sits at the end. Other formats may use the fallback alone.

Fallback, from the relative path: the folder two levels up is the artist, the parent folder is the album, and the file name is the title after removing the extension and a leading track number. A missing level becomes `Unknown Artist` or `Unknown Album`.

Duration is unknown at import. Learn it from the audio element when the track loads.

## Playlist files

- Treat lines as UTF-8. Skip blanks and lines starting with `#`. Use `#EXTINF` only as a fallback title.
- Accept `\` and `/` separators, and percent-encoded paths.
- Match each entry against imported tracks: first by path relative to the playlist, then by longest matching path suffix, then by file name. Ignore letter case.
- An unmatched entry adds 1 to `Skipped`, and the playlist keeps the rest.
- The playlist's name is its file name without the extension. A playlist with no matches is dropped.
- A playlist file added before its tracks stays pending, and resolves when a later folder is added.

## Library

- `Imported` shows only imported music in Playlists, Artists and Songs. `All` merges it with the catalogue, sorted by the existing rules.
- The first successful import sets `Library` to `Imported`.
- About's song count follows what is shown.
- Changing the library while music plays keeps the current queue playing.
- Clearing imported music stops an imported track, empties any queue holding one, and sets `Library` to `All`.

## Lifetime and privacy

Imports last until the page reloads. This is a known limit, so say nothing on screen about it. Play files through object URLs and revoke them on clear. Nothing leaves the browser: no uploads and no network requests for imported music. `Reset All Settings` leaves imports alone. Nothing about imports goes into localStorage.

## Testing hook

Method `importFiles(files)` on the element takes an array of `File` objects, reads each one's `webkitRelativePath`, behaves like `Add Folder`, and returns a promise that resolves when it finishes. Use it for tests, since headless Chrome cannot use a picker.
