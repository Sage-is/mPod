# Tests

Everything drives real pointer and key input through headless Chrome over DevTools, with no packages. Needs Node with built-in `WebSocket` and Google Chrome at its default path.

## Run

```
node tests/run.mjs            # every suite
node tests/run.mjs t8 t10     # suites whose name contains a word
```

The runner starts `dev/serve.mjs` on port 8432, runs each suite, stops the server and prints a summary. It exits non-zero on any failure. A full run takes about 15 minutes.

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

## Notes

- Output goes to `work/`: Chrome profile, screenshots, and samples from `gen-samples.mjs`, which suites regenerate themselves.
- The colour scheme is pinned to dark. Set `SCHEME=light` to change it, though some checks assume dark defaults.
