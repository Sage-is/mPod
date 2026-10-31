# mPod

A pocket music player for your own music, as an installable web app. Private project: not for release until the items below are cleared.

## Run it

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`. Folder access needs HTTPS or localhost.

## Layout

- `index.html`: the page people open.
- `src/`: the `pod-player` web component. Plain ES modules, no build step, no dependencies.
- `dev/`: dev server, test page, and a small Chrome client.
- `docs/spec/`: the specification this code is built from.
- `docs/SPEC-GAPS.md`: where the spec was silent or wrong, and what was chosen.
- `fonts/`: our own drawn pixel font and its builder.
- `fixtures/`: an invented catalogue and test tones.
- `tests/`: browser and unit suites. See `tests/README.md`.

## Before anyone outside uses it

- `src/pod-screen.ttf` is ChicagoFLF 2.1 and is not cleared. See `docs/FONT.md`.
- `src/styles.js` needs reworking to reduce overlap with the original's CSS.
- The name needs a trademark check, and the look needs legal review.

`tests/font-unit.mjs` and `tests/t11-font.mjs` check for our own drawn font, so they fail while ChicagoFLF is in place.

Test specifications and comparison tools live in the private `Sage-is/Pod-Recomp` repo.
