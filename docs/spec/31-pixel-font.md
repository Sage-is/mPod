# 31. Our own pixel font (replaces the local font rule)

The screen relied on a font installed only on Macs, so other systems show a plain system font. mPod now carries its own bitmap-style font, drawn here from scratch. This replaces the local-font rule in 00 and 24.

## Clean-room rules

- Draw every glyph yourself on a pixel grid. Do not trace, convert or measure any existing font.
- Do not read font files on this machine or elsewhere.
- This is the only embedded font. No other font data enters the project.

## Character of the design

A bold, proportional screen font with the feel of early 1980s personal computers: chunky, friendly, slightly wide, instantly legible on a low-resolution display. It is not monospaced.

- Stems 2 pixels wide, horizontals 2 pixels tall, with square corners and no anti-aliasing shapes.
- Cap height 11 pixels, x-height 8, descenders 3. Round letters have stepped corners.
- At least 1 pixel between letters, and a space about 5 pixels wide.
- Must read cleanly at the sizes the screen uses: titles, rows, Now Playing and small numbers. Pick the em size so one design pixel lands on a consistent device size in the row height from 09.

## Coverage

Basic Latin, Latin-1 Supplement, Latin Extended-A, curly quotes, dashes, ellipsis, bullet. Accented capitals must fit without touching the row above.

Anything else falls back to `system-ui`, so Greek, Cyrillic, Thai, Arabic, Hebrew and CJK titles stay readable. Remove the `Krungthep` face and its metric overrides.

The small `menu` wordmark on the wheel and any other drawn text stay as they are unless they used the old face.

## Delivery

- Glyphs live as readable text art in one source file under `fonts/`, one block per character, easy to edit by hand.
- `fonts/build-font.mjs` turns them into `src/pod-screen.ttf` with Node alone: real TrueType outlines made of pixel squares, merged where simple.
- Load the file with `FontFace` relative to the module, `font-display: block`, keeping the boot gate in 02 unchanged.
- Target under 40 KB. Include the name table: family `PodScreen`, our own copyright line, no third-party names.

## Testing

- The file loads in Chrome with no sanitiser error, and `document.fonts.check` is true.
- With every local font name removed, screenshots of root, a long list, Now Playing, Settings and About show the pixel face.
- Check a glyph sheet by eye, including `Rg@&0O1lI`, accented Latin, and a title with Cyrillic or CJK falling back.
- Text must not overflow its row on any screen.
