# mPod

A pocket music player for your own music, as an installable web app. The code is private.

## Run it

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`. Folder access, the service worker and install need HTTPS or localhost.

`make publish` rebuilds the generated files, runs the checks, writes `dist/` and puts it live. `dist/` is plain static files, so any host can serve it. `node dev/draw-icons.mjs` redraws the icons.

## Layout

- `index.html`, `manifest.webmanifest`, `sw.js`, `sw-precache.js`, `icons/`: the page people open and what installs it.
- `src/`: the `pod-player` web component. Plain ES modules, no build step, no dependencies.
- `dev/`: dev server, test page, and a small Chrome client.
- `docs/spec/`: the specification this code is built from.
- `docs/SPEC-GAPS.md`, `docs/SPEC-GAPS-00-31.md`: where the spec was silent or wrong, and what was chosen.
- `fonts/`: our own drawn pixel font and its builder.
- `fixtures/`: an invented catalogue and test tones.
- `tests/`: browser and unit suites. See `tests/README.md`.

## Release status

Alexander accepted the risk on 2026-11-01. The font, the CSS overlap, the name and the look ship as they are, and a complaint means taking the site down. `src/pod-screen.ttf` is ChicagoFLF 2.1: see `docs/FONT.md`.

`tests/font-unit.mjs` and `tests/t11-font.mjs` check for our own drawn font, so they fail while ChicagoFLF is in place.

Test specifications and comparison tools live in the private `Sage-is/Pod-Recomp` repo.
