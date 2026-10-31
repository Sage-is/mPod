# 00. Build contract

Build a working pocket music player as one web component. This folder is your only source. Where a file says "unknown", choose something sensible and note it.

## Deliverable

- Custom element `pod-player`, defined in `src/pod-player.js`.
- Plain ES modules. No dependencies, no build step, no framework. Extra modules may sit beside it in `src/`.
- Open shadow root, with all styles inside it.
- Attribute `catalogue-url`: URL of the catalogue JSON (28). Read it when the element connects.
- No Apple logo and no "iPod" wordmark anywhere. The product name is "Pod". Never contact an Apple host. Embed no PNG or WAV, and no font except our own drawn in 31: synthesise the click (17) and the wheel grain (26).
- Store settings in localStorage under `pod-player:settings`.

## Method `debugState()`

Synchronous, no side effects. Returns exactly:
`{view, title, rows:[{text, value, selected, arrow}], nowPlaying:null|{index,total,title,artist,album,elapsed,remaining,mode,playing,volume}, brick:null|{balls,score,message}, settings:{shuffle,repeat,clicker,volume,backlight}, backlit}`

- `view`: `"offline"` while the offline overlay shows; else `"loading"` while the boot screen shows; else `"list"`, `"now-playing"` or `"brick"` for the top screen. During a slide, report the incoming screen.
- `title`: title of the top screen, even under an overlay. Root is `"Pod"`. On Brick it is `"Brick"`, although the bar paints balls and score there.
- `rows`: **all** rows of the top screen, not only the visible ones. `[]` on Now Playing and Brick. Rows are reported under overlays too.
  - `text`: full untruncated row title.
  - `value`: right-hand string (`"Off"`, `"48"`, `"9.2 GB"`) or `null`.
  - `selected`: true for exactly one row, the one at the selection index, even when it is informational and paints no highlight.
  - `arrow`: true when the chevron is shown.
- `nowPlaying`: `null` unless the top screen is Now Playing.
  - `index`, `total`: integers of "3 of 48", index 1-based.
  - `title`, `artist`, `album`: strings, `""` when absent.
  - `elapsed`, `remaining`: exact display strings such as `"0:07"`, `"-0:23"`. `""` while duration is unknown. While scrubbing they show the preview time.
  - `mode`: `"progress"`, `"volume"` or `"scrub"`.
  - `playing`: true only when the title bar shows the play triangle; false for pause bars or no icon.
  - `volume`: live integer 0 to 100.
- `brick`: `null` unless the top screen is Brick. `balls`, `score` integers. `message`: `"Press Center to Launch Ball"`, `"GAME OVER"` or `""`.
- `settings`: the persisted values, using the strings of 15, not live ones. `volume` lags the live value by the 1,000 ms save delay.
- `backlit`: true while the screen has its lit look.

## Method `getWheelRect()`

The wheel fills a square element. Return `{x, y, width}`: that element's viewport position and size after all scaling. Tests aim every input from this rect (01).

Both methods live on the `pod-player` element.
