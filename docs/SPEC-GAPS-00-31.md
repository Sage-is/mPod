# Spec gaps

## Apparently wrong or contradictory

- **19:** "five setups", but six rows. All six matched.
- **09:** selected chevron has two unlit colours. Used `#b9b9b3`.
- **10 / 12:** queue end clears the queue before popping, so arrival gives row 0, yet the list "comes back on the row of the last song". The pop matches a snapshot of the ended queue.
- **13:** heights total 181 in a 180 body. The bar shrinks to 14.
- **25:** battery works out at 33 × 16.8, not "near 31 × 17". Built as drawn.
- **27 / 26:** ring press transition listed, no ring active look. Nothing changes.

## Ambiguous

- **27:** "same direction": the leaving node's exit side equals the incoming entry side, a reversal. Push after push starts at full width.
- **12:** "left from its Now Playing row" outlasts a pop, so a queue ending there gives row 0. Reached by rotation, it clamps.
- **12:** while the display lags, follow, queue match and memory use the displayed index.
- **11:** skip in an unshown crossfade: Forward steps from the internal index, Back from the displayed one.
- **11:** paused during a crossfade, the 2 s cleanup still runs, so the display can flip.
- **09 / 20:** "side padding" sits outside the scroller: list 263 wide, selected row 251.
- **13:** right-to-left: strip panels follow page direction.
- **22:** "Forced focus" applies under `forced-colors: active` only.
- **26:** glint mask and blur share one element, so the mask edge stays sharp.

## Silent

- **03:** under 4.5° does not enter volume mode. Both accumulators zero together.
- **05:** ring blur cancels a key, even to another wheel element, or scroll repeat sticks.
- **04 / 16:** the swallowed click after a hold is not activity.
- **12:** failed play recovers on Play/Pause or Forward.
- **21:** offline drawing has a cable to offset the -10% shift, 12 px up.
- **28:** a missing required array is an error state.

## Unknown, chosen

- **17:** click: 6 ms, 3.1 kHz sine plus noise, 1.1 ms decay.
- **26:** grain: 64 px tile, grey 96 to 191, 45% of pixels at alpha 5 to 16.

## Import (29)

- "Dropped" and "pending" conflict. Playlists re-resolve after each import; no matches hides one, and a later folder can fill it. Entries count as Skipped only once music exists.
- "Sorted by the existing rules", but 09 says no sorting. All is catalogue, then imports in path order.
- `track` has no stated use: artist lists run by album, then track.
- Same artist name, any case, merges in All. Playlists do not.
- 20,000 is per library and counts audio files only. Path order is numeric-aware.
- Dotted files are not Skipped; zero-byte files are. A damaged tag falls back to the path. Undecodable audio shows only on play, as in 12.
- Same path, size and date is one track.
- EXTINF replaces only a path-derived title. A suffix tie takes the first in path order. Remote URLs never match.
- Library flips at the first track read. Clear resets Skipped; the next import flips it again.
- Import rows have no arrow. `importFiles` without the attribute does nothing.
- 20,000 rows take over a second to open.

## No catalogue (30)

- "No offline overlay" read strictly: without `catalogue-url` it never shows, even offline, and playback continues.
- Read at connect. `catalogue-url=""` counts as set, so it stays an error.
- `index.html` needs a server: modules do not load from `file://`.

## Pixel font (31)

- Cites the boot gate in 02; it is in 21.
- One design pixel is 1.5 CSS px, so a row is 20. The 20 and 13 px text of 13 and 21 runs at 17.33 px, one CSS px, so pixels stay whole.
- x-height 8 cannot hold three 2-pixel bars and open counters: `a`, `e` have a 1-pixel middle bar.
- `Backlight Timer`, `Reset All Settings` end in an ellipsis in the bar, and on rows beside a scrollbar.
- Offline text wraps to two lines. Hard edges need `-webkit-font-smoothing: none`, which only macOS honours.
