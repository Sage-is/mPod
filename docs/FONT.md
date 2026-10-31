# Screen font

`src/pod-screen.ttf` is currently ChicagoFLF 2.1, chosen by Alexander on 2026-10-31 for private use, to be revisited.

- The file came from font.download. Its embedded note, from Robin Casady, says he created it, it is free to use as you wish, and he considers it public domain.
- An older 1.0 copy carries a different line: "(c)1990-92 by Richard A. Ware. All Rights Reserved." The credits conflict, so this file is not cleared for release.
- `fonts/` holds our own drawn font and its builder. `fonts/pod-screen-a2.ttf` is the second pass, kept for the return to this decision.

Before anyone outside uses mPod: replace this file with our own font, or a recomp of the design, or get legal sign-off.

ChicagoFLF needed fitting, so `registerFont` in `src/pod-player.js` loads it at 90% with overridden ascent and descent, and `src/styles.js` gives clipped text boxes headroom. Those values belong to this font: remove them when it is replaced. They were made on the spec side, outside the isolated builder.

The `.title` offset in `src/styles.js` is also tuned for this font.
