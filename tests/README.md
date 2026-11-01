# Tests

Everything drives real pointer and key input through headless Chrome over DevTools, with no packages. Needs Node with built-in `WebSocket` and Google Chrome at its default path.

## Run

```
node tests/run.mjs            # every suite: see the font-unit note below
node tests/run.mjs t8 t10     # suites whose name contains a word
```

The runner starts `dev/serve.mjs` on port 8432, runs each suite, stops the server and prints a summary. It exits non-zero on any failure. A full run takes about 20 minutes.

To run one suite or one section by hand, start the server first:

```
node dev/serve.mjs 8432 &
node tests/t8-import.mjs picker
```

Chrome uses port 9334 and one suite runs at a time, so do not run two together.

## Suites

| File | Covers |
| --- | --- |
| `brick-vectors`, `tags-unit`, `font-unit` | Node only: Brick physics, tags, playlists, font file |
| `smoke`, `t1`, `t2` | boot, wheel, keys, lists, playback, scrub |
| `t3`, `t7` | crossfade, queue end, backlight, boot, offline, errors |
| `t4`, `t5`, `t6` | Brick, accessibility, i18n, motion, scaling, RTL |
| `t8` | import (spec 29) |
| `t9` | idle timer accuracy |
| `t10` | no catalogue and `index.html` (spec 30) |
| `t11` | screen font in Chrome (spec 31) |
| `t12` | remembered library: fake handles, real OPFS handles, stubbed picker (spec 32) |
| `t13` | device name (spec 33) |
| `t14` | manifest, precache, offline start, update, layout, emulated touch (spec 34) |
| `t15` | media controls against a stubbed `navigator.mediaSession` (spec 35) |

## Notes

- `font-unit` runs `fonts/build-font.mjs`, which overwrites `src/pod-screen.ttf` with our drawn font. Name the other suites instead of running everything, or restore the file afterwards.
- Output goes to `work/`: Chrome profile, screenshots, and samples from `gen-samples.mjs`, which suites regenerate themselves.
- `CLEAR_STORED` in `h.mjs` wipes localStorage and the `mpod` database. `boot()` also clears any service worker left on port 8432.
- `t14` copies the app to `work/pwa-copy` and serves it on port 8436, then stops that server, so "no network" is real. Its `precache` section fails if `sw-precache.js` is stale: run `node dev/build-sw.mjs`.
- `t12` and `t15` use real directory handles from the origin private file system. A real picker, permission prompt, lock screen or finger needs a real device.
- `t1-nav` also fails on `scroll height 1440 got 1443`. It did before specs 32 to 35. The cause is not yet investigated.
- The colour scheme is pinned to dark. Set `SCHEME=light` to change it, though some checks assume dark defaults.
