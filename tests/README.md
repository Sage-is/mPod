# Tests

Everything drives real pointer and key input through headless Chrome over DevTools, with no packages. Needs Node with built-in `WebSocket` and Google Chrome at its default path.

## Run

```
node tests/run.mjs            # every suite
node tests/run.mjs t8 t10     # suites whose name contains a word
node tests/run.mjs --jobs 1   # one suite at a time, in list order, with live output
```

The runner starts `dev/serve.mjs` on port 8532, runs the suites, stops the server and prints a summary. It exits non-zero on any failure. A full run takes about 13 minutes at 4 jobs and about 40 minutes at 1.

To run one suite or one section by hand, start the server first:

```
node dev/serve.mjs 8532 &
node tests/t8-import.mjs picker
```

A suite run by hand uses Chrome on port 9434, the same port as the runner's first worker, so do not run one during a full run.

## Parallel runs

Suites run from a queue, so a name added to `SUITES` needs nothing else. `--jobs N` sets the number of workers. The default is half the cores, at most 4.

- Each worker has its own Chrome port (`CHROME_PORT`, from 9434), profile (`CHROME_PROFILE`, from `work/chrome-0`) and port for the copies of the app in `t14` and `t21` (`COPY_PORT`, from 8533).
- The dev server is shared, because it only reads files.
- Chrome is stopped and its profile removed before each suite, so no suite can depend on the one before it.
- Output goes to `work/logs/<suite>.log` and prints whole when the suite ends, so suites print in the order they finish. The summary stays in list order. The log is a file because `process.exit` drops output still waiting in a pipe.
- `work/samples` is written once before the workers start. `gen-samples.mjs` writes nothing while `SAMPLES_READY` is set, so a suite that imports it cannot wipe the samples under another suite.

A new suite works in the pool if it follows these rules:

- Start Chrome with `boot()`.
- Start a drag on the wheel with `d.rotate`, or call `d.settled()` first. A drag that starts as a slide ends can lose pointer capture, and then every move in it, so a fixed `sleep` is not enough on a busy machine.
- Take any extra port from the environment, as `t14` does with `COPY_PORT`.
- Treat `work/samples` as read-only. To change files, use a folder of its own, as `t8` does with `work/gone`.
- Give screenshots and other `work/` files names no other suite uses.

`SERIAL` in `run.mjs` lists suites that must run alone after the pool. It is empty. Add a suite only when it fails under load and `waitFor` cannot fix its wait. `t9` measures a timer but stays in the pool: with four Chromes running it read 4940 to 4989 ms over 132 measurements, the same as when it runs alone, inside its limits of 4600 and 5800. `t2` takes the same measurement in the pool.

## Suites

| File | Covers |
| --- | --- |
| `brick-vectors`, `tags-unit`, `font-unit` | Node only: Brick physics, tags, playlists, font file |
| `extras-unit` | Node only: vCard, iCalendar and the Shuffle Albums order (specs 38, 40, 42) |
| `review-unit` | Node only: tags, EQ, text, contacts and calendar rulings (specs 43, 44, 46) |
| `dates-unit` | Node only: calendar rulings across clock changes, with `TZ` set to zones that have them (spec 46) |
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
| `t16` | one window at a time, with two pages on one origin (specs 41, 42) |
| `t17` | Resume: fake handles, its 5 second timer shortened by a seam (specs 36, 42) |
| `t18` | root menu, Browse, composer reread, Shuffle Songs, Play on a highlighted list (specs 37, 42) |
| `t19` | Shuffle Albums, EQ, Contrast, what every settings write keeps (specs 40, 42) |
| `t20` | Contacts and Calendar through fake handles and the file input (specs 38, 42) |
| `t21` | off, battery, charging screen, restart, a real waiting worker (specs 39, 42) |
| `t22` | the reviews' rulings on pausing, failed tracks, new queues, parked queues, one window, the chord, Browse, tags (specs 43, 45) |
| `t23` | the reviews' rulings on the library on both pages, the composer reread, Skipped marks, Extras, the calendar (specs 44, 46) |
| `t24` | the off screen's unlit LCD, from screenshots, and the buttons' haptics and touch against a stubbed `navigator.vibrate` (specs 48 to 51) |

## Notes

- `font-unit` runs `fonts/build-font.mjs`, which rewrites `fonts/pod-screen-a2.ttf` with the same bytes. It does not touch `src/pod-screen.ttf`, and no other suite reads the file it rewrites.
- Output goes to `work/`: Chrome profiles, suite logs, screenshots, and samples from `gen-samples.mjs`, which suites run by hand regenerate themselves.
- `CLEAR_STORED` in `h.mjs` wipes localStorage and the `mpod` database. `boot()` also clears any service worker left on port 8532.
- `t14` copies the app to `work/pwa-copy` and serves it on `COPY_PORT`, then stops that server, so "no network" is real. Its `precache` section fails if `sw-precache.js` is stale: run `node dev/build-sw.mjs`.
- `t12` and `t15` use real directory handles from the origin private file system. A real picker, permission prompt, lock screen or finger needs a real device.
- `product.mjs` holds what `t16` to `t21` share: fake handles and helpers for the product page.
- `t21` copies the app to `work/power-copy` and serves it on `COPY_PORT` for its `worker` section.
- The colour scheme is pinned to dark. Set `SCHEME=light` to change it, though some checks assume dark defaults.
