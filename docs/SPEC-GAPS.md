# Spec gaps

Specs 00 to 31 are in `SPEC-GAPS-00-31.md`, moved there unchanged to keep each file under the size limit.

## Library (32)

- Rescan and Folders follow Add Playlists. Session-only hides both: nothing to rescan.
- Rescan's value counts files checked, since the total is unknown during the walk.
- Reconnect is selected if it appears during boot. Later, the selection stays on its row.
- All waiting folders are asked within the press. If a browser refuses a later prompt, the row stays for another tap.
- Moved means same size, title, artist, album and track. Untagged files take those from the path, so most moves become delete plus add.
- A changed file keeps its identity and forgets its duration.
- Only a failure at the folder's top reads Missing. A deeper failure stops that scan and drops nothing.
- Skipped survives restart. A failed open counts once per track, and the queue leaves that track out. A file that opens but will not decode still follows 12.
- `importFiles` tracks have no file after a reload, so playing one counts as a failed open. Importing it again restores it.
- Help needs `import` and no `catalogue-url`. A bare element and a failed catalogue keep No Music. The wheel does not move on help.
- Boot waits for the stored library, inside the 2 s and 10 s gate.
- Seam: `linkFolder(handle)`. A fake sets `testId`, found again in `window.__podHandles`, because functions cannot be stored.
- Genre reads `TCON`, `TCO` and `©gen`. Numeric `(17)` is stripped, not mapped.

## Name (33)

- The boot word and About's first row follow the name, replacing 23's fixed `Pod`.
- The ring starts at `A`, and shows the space as `Space`. It has no acceleration.
- Enter means Done at any focus, even on the ring, where 05 says Select. Right stays Select.
- An unchanged default stores nothing, and characters outside the ring are ignored.
- The idle jump is blocked on Name, or a pause would lose the draft.
- `debugState()` on Name: view `name`, one row of draft and letter.
- The document title changes only with `import`.

## Installable app (34)

- New attribute `fit`, on `index.html` only: scale 0.45 to 1, 4 px margin. Never above 1, for the pixel grid. Below 0.45 the device crops.
- The buttons' band is 37 px, 18 px at the smallest scale. So with `import`, a still touch on the ring presses the wedge under it, and hold works. A finger starting anywhere that moves 8 px turns the wheel. The test page has neither.
- Navigation tries the network for 3 s, then the cache. `/` is the test page under `dev/serve.mjs`, so a cache-first page would hijack it. Assets are cache-first, so a new page can briefly meet old assets until the next start.
- Offline, a deeper URL redirects to the scope, because the page's paths are relative.
- No `clients.claim`: the first visit runs uncontrolled, and the next start is covered.
- `dev/serve.mjs` also serves the app at `/app/`. Also added: `apple-touch-icon.png`, `favicon.png`.

## Media controls (35)

- All of it needs `import`, so the comparison page cannot change.
- The two likely causes are built against, but the Fold's missing art and seek bar are not reproduced here. Only the phone can confirm the fix.
- Chrome fetches the placeholder icon for tracks with no art. It is our own file and says nothing about the music, so 29's "no network requests" still holds.
- A lock screen skip leaves scrub, or a 5 s scrub would drop it.
- A system pause or a suspended context shows paused.
- Art is centre-cropped to a square. Folder image names match in any case, in the listed order.
- Chrome has no `fastSeek`, so `seekto` falls back to `currentTime`.
