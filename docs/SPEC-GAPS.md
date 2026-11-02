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
- Skipped survives restart. A failed open counts once per track, and the queue leaves that track out. On the product page 45 treats a file the element refuses the same way. On the test page it still follows 12.
- `importFiles` tracks have no file after a reload, so playing one counts as a failed open. Importing it again restores it.
- Help needs `import` and no `catalogue-url`. A bare element and a failed catalogue keep No Music. The wheel does not move on help.
- Boot waits for the stored library, inside the 2 s and 10 s gate.
- Seam: `linkFolder(handle)`. A fake sets `testId`, found again in `window.__podHandles`, because functions cannot be stored.
- Genre reads `TCON`, `TCO` and `©gen`. The test page strips a numeric `(17)`. Spec 43 maps it on the product page.

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
- Media keys skip Play on a highlighted list (37): they mean the track, and a lock screen cannot see the row.

## Product page (36 to 42)

- "Product page" means `import` with no `catalogue-url`, settled at connect. A bare element keeps the plain menus, so t10's `no-import` section stands.
- New stored data goes in `meta` at database version 1, because t12 opens that version by number.
- Each suite's rulings from 42 are tested with its spec, in `t16` to `t21`. Specs 43 to 46 have `t22`, `t23`, `review-unit` and `dates-unit`.
- 43 and 45 are gated to the product page, and so is 46 apart from its Library section. 44's Library rules and 46's run on both, as they say, which covers a test page with `import`.

## Resume (36, 42)

- `meta` holds `resumeQueue`, written at queue start and on a Shuffle change, and `resume`, the track and position. The first `resume` goes in with the queue, so a takeover inside 5 s still resumes. 45: a new queue is stored once its track has connected, so one that never connects leaves the last stored queue.
- The seed drives the same small generator as the grain. A hash of the list is stored too, which is how "the list has changed" is seen.
- Changed list with no shuffle: the order rotates to the resumed track, so the list carries on after it.
- A track its list no longer holds is not gone, so it goes in front of that list.
- A file that will not open at start stays parked and adds nothing to Skipped. A press then follows 32, including one made while it was opening (45). It is gone once a rescan drops it.
- A quiet open counts as opened at the element's metadata, so a next track is prepared then (45).
- Restart saves the position first.
- 43 and 45: Play and Pause both set the state at once, not when the command chain reaches them, so a resume waiting on a file holds up neither.

## Main menu (37)

- 09 has no sorting, so "Sorting follows 09" became: letter case ignored, numbers by value, a leading `The` ignored. `Songs` and `All` keep library order, as t12 requires.
- A genre's artist level has no `All`. An artist's list runs by album name, then track.
- Music with no composer at all: `Composers` shows `No Music`.
- Album artist is read too: `TPE2`, `TP2`, `aART`, Vorbis `ALBUMARTIST`. Vorbis comments give only these and the composer; titles stay with the path, as 29 allows.
- Ogg and Opus comments are read as well as FLAC.
- Composer, album artist and tag version are stored on the product page only, since t12 fixes the test page's fields.
- `importFiles` tracks have no folder, so they are never reread.
- 44 replaces the earlier choice on failed rereads: the record stays due, and adds to Skipped until it reads.
- 43: ID3v1 names use the common modern spellings, such as `Afro-Punk` at 133. A mixed value such as `(17)Rock` keeps its text.

## Sound and look (40)

- `eq` values are lower-case ids; `R&B` is `r-and-b`.
- `Contrast` shows no value on its row, as written.
- The product page writes all seven fields, defaults included. The test page writes 15's list, plus whatever it holds from storage, so t13 stands.
- A stored `albums` stays stored on the test page until that page changes `shuffle` itself.

## Extras (38, 42)

- Stored under the `meta` keys `contacts` and `calendar`, which `Clear Imported` skips.
- A card with only `N` shows given and family name. With no `N`, it sorts by its shown name.
- Cards with nothing to show, and cards or events cut off at the end of a file, count as skipped. A file with no card or calendar in it counts as one.
- 44 sets what a complete read is. A pick through the file input that holds no file of this kind changes nothing.
- 46 says a read in which every file was skipped keeps the stored data. A file counts as skipped if it adds no card or event and has at least one it could not use, so a valid calendar with no events is not skipped. The file input follows the same rule.
- A row with no title shows `Untitled`. The title bar on an event reads `Calendar`. With no `DTEND` or `DURATION`, the time is the start alone.
- `DTSTART` always counts as the first occurrence, even off its `BYDAY` days, and off a monthly ordinal day. Weeks start on Monday unless `WKST` says otherwise.
- A date that a month lacks, such as the 31st, is passed over. So is a month with no fifth Monday.
- `UID` matching runs across all the files read, since that is where the 2,000 limit applies.
- 44 says `BYMONTH` and `BYMONTHDAY` that match `DTSTART` change nothing. That is true of `BYMONTH` on a yearly rule and `BYMONTHDAY` on a monthly or yearly one, so only those are accepted. Elsewhere they narrow the rule, which then counts as another rule. 46: `BYMONTHDAY` with `BYDAY` always counts as another rule.
- An all-day event over several days reads `All Day – Jun 18`, its last day. 44 names only ranges, but `All Day` alone would hide the end.
- 46 changes how a `DURATION` is kept, as days and milliseconds. An event stored earlier holds plain milliseconds, which read as exact time until the next rescan.
- A rule's `COUNT` counts `EXDATE` occurrences too, so one whose last occurrences are excluded leaves when the count runs out, not sooner.
- An ended event with a rule we cannot follow is left out, and is not counted.

## Power (39, 42)

- `off` and `lost` are new `debugState().view` values, on the product page only.
- Off counts as inert, so Brick stops and nothing acts. Lost is not inert, so `halted` covers both for Brick and auto-off.
- Auto-repeat and key release do not wake. Ctrl, Meta and Alt keys wake but keep their browser meaning.
- A media action on a parked track in a waiting folder does nothing, so it does not wake either.
- On the wheel, a touch anywhere in a wedge counts for Restart. With a mouse, only the Menu and Play/Pause buttons do.
- A finger that turns the wheel leaves the chord.
- The worker message is the string `skipWaiting`.
- 43: the chord watches touch pointers itself, with the wheel's 8 px slop. A mouse held on a button does not leave it by moving.

## One window (41, 42)

- The overlay keeps the offline drawing, with the two lines where its text goes.
- The menu layer stays hidden under it, by a class of its own, since the window is not inert.
- Clicks there are stopped too, because the press that follows a steal must run nothing.
- While a scan runs, its deletions wait for its last write.
- 43 says to listen on the device. The listener is on the window, in the capture phase, and checks the press came from the device. Only that runs ahead of the constructor's own key listener there, so nothing else runs.
- 45 names modifiers without listing them. Those are the UI Events modifier keys, the lock keys among them. Since those keys now reach the player, the screen and button key handlers ignore them in a lost window, or Ctrl+Enter would select a row there.

## Library review (44)

- A refusal while opening a track also makes its folder wait, so `Reconnect` shows even if nothing had reported it yet.
- A failed read at start keeps no partial library, and it leaves Extras as read, in memory only.
- A failed store read has no retry for the life of the page, as written.

## Second review (45, 46)

- On the product page a track counts as opened at its `loadedmetadata`, not when its file is read, so a file the element refuses never clears its own mark.
- A failed `play()` leaves the queue paused, connected or not. That is what lets the first press of Play retry. The icon and the lock screen then both say paused.
- An element `error` counts even while the track's folder waits, because the folder is not its cause.
- A press clears a stalled start through `toggle()` from any row, so Play retries rather than starting the row.
- 46's marks: a scan can judge a failed open, so a finished scan replaces that `play` mark. It cannot see a file that will not decode, so that mark is tied to the file's size and date. It stays through scans and restarts until the file changes, goes, or opens. Each file holds at most one mark from playback.
- A scan's new marks are not counted toward the 20,000 until the scan ends.
- `stopScans` zeroes the scan count, as Clear does, so a lost window keeps it right.
- A link matches the folders that exist when it is asked. Folders added after that are matched at its turn, so one folder linked twice in quick succession stays one.
- Removing a folder also stops its walk, as 46 says of a walk that has been stopped. A link's walk used to stop only on Clear.
