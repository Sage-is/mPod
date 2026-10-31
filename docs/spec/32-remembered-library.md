# 32. A library that survives restarts (our own addition)

Imported music must survive reload, browser restart and device restart. Folders are linked, never copied. This replaces "Imports last until the page reloads" in 29. Everything else in 29 stands unless changed here.

Tested on the Z Fold4 in Chrome 156: a folder handle kept in IndexedDB survives a restart, and access returns as `prompt`. One tap brings it back.

## Picking

- Where `showDirectoryPicker` exists, `Add Folder` uses it, in read mode, called synchronously inside the press.
- Several folders may be linked. Each stays a separate source.
- Where it is missing, such as Brave, keep the session-only input from 29. The Import screen then adds an informational row: `Lasts until reload`.

## Stored data

Use one IndexedDB database, `mpod`. Store:

- Each folder's handle, name and last scan time.
- A track index: relative path, size, modified time, title, artist, album, track number, genre, duration once known, and whether embedded art exists.
- Imported playlists: name, source, and matched track paths, with unmatched entries kept so a rescan can resolve them.
- The `Library` value.

No audio or art is stored. Start must not read tag data for unchanged files.

Call `navigator.storage.persist()` after the first successful import. Do not depend on the result.

## Starting up

1. Show the stored library at once, before any permission exists.
2. For each folder, `queryPermission`. If `granted`, rescan quietly in the background.
3. If any folder needs permission, the root menu gains a first row, `Reconnect`, with an arrow.

Permission can only be requested inside a press. Selecting `Reconnect` requests it for every waiting folder, then rescans. The row leaves when none are waiting.

If a song is chosen from a waiting folder, request permission inside that same press and play on success. If refused, stay on the list and show the `Reconnect` row.

Rows stay visible while disconnected. Never empty the library because access is missing.

## Rescan

- Import gains row `Rescan`. Its value shows progress.
- Compare path, size and modified time. Read tags only for new or changed files.
- Add new tracks, update changed ones, and drop deleted ones from the library and playlists.
- A moved file is a delete plus an add, unless size and tags match, and then it keeps its identity.
- A folder that no longer resolves stays listed, with its tracks, and its row value reads `Missing`.
- Yield at least every 200 files. Playback must not stutter.

## Folders screen

Import gains row `Folders`, showing a list of linked folders with track counts. Selecting one offers `Rescan`, `Remove` and `Cancel`, with `Cancel` preselected. Remove forgets the folder and its tracks, and never touches files on disk. `Clear Imported` stays, and also clears stored data.

## Empty state

With no catalogue and no imported music, the root menu stays as it is, and Playlists, Artists and Songs each show a help screen instead of No Music:

- Title unchanged, then the lines `No music yet`, `Choose Add Folder`, `to link your music.`
- One selectable row, `Add Folder`, which opens the picker directly.

## Playlist identity

`Add Playlists` files are read once and stored. A folder's `.m3u` files refresh on rescan. Saved playlists from 36 live in the same store.

## Errors

If IndexedDB is unavailable, behave as session-only with the `Lasts until reload` row. A file that fails to open during playback skips to the next track, and it adds 1 to `Skipped`.

## Tests

Keep `importFiles()` for headless tests, and store those imports without handles. Add a test seam that takes fake handle objects, so permission states, rescan and missing folders can be tested without a picker.
