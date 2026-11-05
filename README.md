# mPod

A pocket music player for your own music, as an installable web app. Free and open source under the GNU AGPL, version 3 or later.

## A love letter to the iPod

Apple released the first iPod on Nov. 10, 2001. mPod’s first public release, v0.1.0, marks its 25th anniversary on Nov. 10, 2026. This is an homage to the first and second generation iPod, made as a work of love.

The wheel turns beneath your hand, each step gives its tick, and the buttons press like switches. The grey LCD and its backlight complete the small, familiar world we wanted to honour.

<p>
  <img src="docs/images/ipod-1g.jpg" alt="A first generation iPod on a wooden table" width="49%">
  <img src="docs/images/ipod-2g.jpg" alt="A second generation iPod on a dark wooden table" width="49%">
</p>

Photos: the first generation by [Blake Patterson](https://commons.wikimedia.org/wiki/File:Original_iPod_5G_(52066067732).jpg), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0); the second generation by [fhke](https://commons.wikimedia.org/wiki/File:IPod_second_generation-2007-07-29.jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0). Both from Wikimedia Commons, resized.

mPod plays your own music from folders on your own device, offline, in an app you install from the web. Every line of code is our own, written from our own descriptions of how the iPod behaved. Made by Alexander Somma with Sage.is AI.

mPod is an unofficial fan project. It is not affiliated with or endorsed by Apple Inc. iPod is a trademark of Apple Inc.

## Run it

```bash
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`. Folder access, the service worker and install need HTTPS or localhost.

`make publish` rebuilds the generated files, runs the checks, writes `dist/` and copies it to the tailnet page. `make deploy` does the same for Cloudflare Pages. `dist/` is plain static files, so any host can serve it. `node dev/draw-icons.mjs` redraws the icons.

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

Test specifications and comparison tools live in the private `Sage-is/Pod-Recomp` repo.

## Licence

Copyright © 2026 Alexander Somma.

mPod is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It comes with no warranty. See `LICENSE`.

If you run a modified mPod for other people, offer them its source, as section 13 asks.

Additional term under section 7(e): this licence grants no rights to the name mPod or its icon as trademarks.

Not covered by this licence:

- `src/pod-screen.ttf` is ChicagoFLF 2.1 by Robin Casady, who placed it in the public domain. See `docs/FONT.md`.
- The photos in `docs/images/` keep their own Creative Commons licences, credited above.
