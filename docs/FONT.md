# Screen font

`src/pod-screen.ttf` is ChicagoFLF 2.1. Alexander chose it on 2026-10-31 for private use, and on 2026-11-05 chose to ship it in the public repo on the strength of its public-domain note.

- The file came from font.download. Its embedded note, from Robin Casady, says he created it, it is free to use as you wish, and he considers it public domain.
- An older 1.0 copy carries a different line: "(c)1990-92 by Richard A. Ware. All Rights Reserved." The credits conflict. We ship 2.1 and rely on its note, under the release risk Alexander accepted on 2026-11-01.
- `fonts/` holds our own drawn font and its builder. `fonts/pod-screen-a2.ttf` is the second pass, kept in case a complaint means replacing ChicagoFLF.

ChicagoFLF needed fitting, so `registerFont` in `src/pod-player.js` loads it at 90% with overridden ascent and descent, and `src/styles.js` gives clipped text boxes headroom. Those values belong to this font: remove them when it is replaced. They were made on the spec side, outside the isolated builder.

The `.title` offset in `src/styles.js` is also tuned for this font.
