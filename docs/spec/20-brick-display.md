# 20. Brick display

The game is painted to look like a slow monochrome LCD, with fading trails.

## Layout

Body 180 px tall, top margin 1.7 px, 5 px side padding. A block canvas, width 100%, nearest-neighbour scaling, colour #484647, `aria-hidden`. With 148 : 101 at 263 px wide, it displays about 263 × 179. Verified live.

A visually hidden paragraph with `role="status"` holds the status text.

## Drawing to the cell buffer

After every tick batch and every direct paddle move, clear a 148 × 101 cell buffer, then fill rectangles. Round x and y to integers, clip to the field, and keep the given width and height.

- Live bricks: 10 × 4, value 1.
- Paddle: at y = 97, 30 × 4, value 2.
- Ball: at (x − 1.5, y − 1.5), 3 × 3, value 1.

## Ink model

Each cell keeps three things: a mid value, an ink value (both 0 to 1), and which drive value last lit it.

On each frame with dt ms:

- Attack coefficient A = 1 − e^(−dt ÷ 20).
- Release coefficient R = 1 − e^(−dt ÷ 70).
- Paddle release P = 1 − e^(−dt ÷ 25).

For each cell, with target 1 if the buffer is non-zero, else 0:

- Record the buffer value as "last lit by", if non-zero.
- If |target − mid| or |target − ink| exceeds 1/255:
  - release coefficient is P when last lit by the paddle, else R.
  - mid moves towards target by its gap × (A if rising, else release).
  - ink moves towards the new mid by its gap × (A if rising, else release).
- Otherwise snap both to target.

Report whether anything is still changing; if so, keep frames running. Two stages in series give the soft S-shaped trail. The paddle's shorter release keeps it crisp while moving.

On first show, skip the fade: set ink equal to target for every cell.

## Painting

Paint alpha only, into an `ImageData` of canvas size, with RGB fixed to the computed text colour. Alpha = ink × grid factor × 255.

**Backing resolution.** Let target = round(displayed CSS width × device scale × devicePixelRatio), where device scale is the scale in 24. If target ≥ 444 (three times 148), use it as canvas width, with height round(width × 101 ÷ 148). Otherwise use 148 × 101. Recompute on host resize and on any change of pixel ratio, watching a `resolution` media query. Reallocate only if the width changes.

In the test harness that gives 148 × 101. Verified live.

**Grid.** Each canvas pixel maps to its cell by floor((p + 0.5) ÷ s), s being canvas pixels per cell. When s > 1, darken the grid lines between cells. For position p, let b = round((p + 0.5) ÷ s) × s; the factor is 1 − 0.3 × max(0, 1 − |p + 0.5 − b|). Pixel alpha uses the product of the x and y factors. At s = 1 the factor is 1.

Precompute a pixel-to-cell index and factor table when the size changes.

## Rendering is not tested exactly

Snapshots read only balls, score and message. Aim for the look.
