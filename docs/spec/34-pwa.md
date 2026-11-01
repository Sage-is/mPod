# 34. Installable app (our own addition)

mPod installs from Chrome and Edge on desktop and from Chrome on Android, and starts with no network.

## Manifest

`manifest.webmanifest` at the project root, linked from `index.html`:

- `name` and `short_name`: `mPod`.
- `start_url` and `scope`: `.`, so the app works under any path.
- `display`: `standalone`.
- `orientation`: `any`.
- `background_color` and `theme_color`: `#1f1f1f`.
- `id`: `mpod`.
- Icons at 192 and 512, plus a maskable 512.
- No `screenshots` or `shortcuts`.

Icons are our own: a front view of the click wheel on the page background, drawn by a small script in `dev/` with Node alone. No wordmark or logo. Commit the PNGs.

Add `theme-color`, `apple-touch-icon` and a real `favicon` to `index.html`.

## Service worker

`sw.js` at the root, registered from `index.html` only. The test page must not register it.

- Precache `index.html`, the manifest, the icons, `src/*.js` and the font, under one versioned cache.
- Keep the list in one generated file, built by `dev/build-sw.mjs`, with a version hash from the file contents, so a release cannot forget a file.
- Navigation falls back to the cached page.
- Never cache imported music, object URLs or anything outside its scope.
- On a new version, install quietly and use it on the next start. Delete old caches on activate.
- Show no update prompt in this version.

## Offline

Every feature works with no network, including playback from linked folders. The offline overlay in 21 must not appear when no catalogue is set. With `catalogue-url` set, 21 still applies.

## Installed window

- Fill the viewport with no scrolling at any size. On phones, scale the device to fit width and height, leaving the safe areas clear.
- The reflection may be cropped. It must never add page scroll in the product page.
- The foldable's inner and outer screens both fit, and a change of size rescales without reload.
- `overscroll-behavior: none`, and no pull-to-refresh in the installed app.

## Phone use

Touch has never been tested on a real device. Treat it as a first-class input:

- A finger on the wheel turns it. The page must not scroll.
- Taps on the outer buttons and Select work at once, and a hold works.
- A press that becomes a drag does not fire as a tap.
- Tap targets stay at least 44 px at the smallest scale.
- With Clicker on, also call `navigator.vibrate(4)` per detent where available. Limit it to 25 per second.

## About

The product page shows only true values under `Songs`:

- `Library`: the total size of imported files, in MB below 1 GB and GB from there, to one decimal.
- `Version`: the first 8 characters of the precache hash, from the generated `src/version.js`. That file sits outside the hash.

There is no `Capacity` or `Available`. A browser does not reveal the disk: `navigator.storage.estimate()` in Chrome 156 reported usage plus 10 GiB on a Mac with 29.8 GB free. The test page keeps 23's fixed values.

## Keep awake

Do not use a wake lock. Audio continues with the screen off.

## Tests

Check the manifest, the precache list against files on disk, an offline start from cache, and touch input through emulated touch events. Lighthouse is not available, so test each requirement directly.
