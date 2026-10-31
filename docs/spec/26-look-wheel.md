# 26. Wheel look

## Base disc

350 px circle, centred, placed 30 px below where it would flow (relative offset). Fill #f8f8f8. Pointer cursor.

Box shadows, x y blur spread, first listed on top:

| Inset? | Geometry | Light | Dark |
| --- | --- | --- | --- |
| inset | -16 29 11 15 | #f4f4f4 | #e9e9e9 |
| inset | 8 -7 34 -15 | rgba(137,137,137,0.8) | #1b1b1b87 |
| outer | 0 0 0 2 | rgba(135,135,135,0.38) | #00000017 |
| outer | -4 6 10 0 | rgba(131,131,131,0.23) | #0000001f |
| outer | 0 0 1 3 | rgba(72,72,72,0.1) | #0000001f |
| outer | 0 -1 1 2 | rgba(168,168,168,0.67) | #ccccccf7 |
| outer | 0 0 1 3 | #e9e9e8 | #70707008 |
| outer | -2 3 1 2 | #d7d7d7 | #d6d6d6 |
| outer | -1 1 0 3 | rgba(229,229,229,0.47) | #dadada78 |

Dark fill #ededed.

**Glint:** a circle at left 20.5, top 15, 318 × 317 px plus 4 px padding, masked to that 4 px ring, blurred 12 px, above the buttons, no pointer events. Conic gradient from 345°: transparent to 16%, white at 22%, transparent from 30% to 67%, white at 72%, transparent at 80%.

## Button band

**Dividers:** two lines, each 2 px wide, the wheel's full height, grey #888, no pointer events. One at left 50% rotated 45°, one at left 49.7% rotated 135°. The ring covers their middles.

Glyphs fill #a3a3a3. Active feedback: glyph scale 0.97 at opacity 0.99, Menu 0.99.

- **Menu:** word `menu`, lowercase, bold Arial 55 px, fill #898989, drawn on a curve in a 400 × 150 box scaled to 136 px wide, 9.5 px below the top edge. Curve: from (31, 97) up through a crest at (200, 41) to (369, 97), text starting 112 units along it. Behind it, a highlight 108 × 34 px, 2 px from the top, centred, radius 35%, opacity 0.25: a radial ellipse centred 189% above itself, white 0.9 to 57%, white 0.07 at 75.6%.
- **Forward:** 6 px from the right edge, box 23 × 12: two touching right-pointing triangles, each 9.6 wide and 11.2 tall, then a bar 3.8 wide and 11.3 tall at the right.
- **Back:** 6 px from the left edge, the Forward glyph rotated 180°.
- **Play/Pause:** 12 px from the bottom edge, box 24 × 12: a right-pointing triangle 9.6 wide, then bars 3.8 wide at x = 13.8 and x = 19.6.

## Ring

Diameter per 02, centred, 2 px #7e7e7e border, above the buttons. Fills: grain texture over a radial gradient circle centred at 130%, -100%, from #eaeaea to #f6f6f6. Texture and gradient are both sized at 30% and tile. Dark gradient stops #f1eeee, #e4e4e4.

Shadows:

| Inset? | Geometry | Light | Dark |
| --- | --- | --- | --- |
| inset | 0 0 0 2 | rgba(249,249,249,0.27) | #c1bcbc45 |
| outer | 4 -5 18 0 | rgba(122,122,122,0.6) | #b0aeae99 |
| outer | 0 -1 4 2 | rgba(168,168,168,0.67) | #9b9b9bab |

**Grain:** the original tiles an embedded PNG of fine noise. Do not reuse it. Generate your own at startup on a small canvas: faint, fine, grey noise, mostly transparent, exported as a data URL. Exact values unknown; visually it is a barely visible satin grain.

## Select

Diameter per 02, centred, rotated 35° so its light falls at an angle. Border 2 px #9f9f9f. Two background layers:

1. An ellipse, closest side, centred at 50%, 30%: white 0.2 to 72%, transparent at 80.6%.
2. A radial, farthest side, centred at -9%, 209%: rgba(22,22,22,0.19) to rgba(250,250,250,0.93).

Dark stops: #ecebeb24, #ecebeb24, #46454561, #f2f2f2d9.

Active: scale 0.98 and a shadow 0 0 1 1 #909090, 0.1 s ease-out.
