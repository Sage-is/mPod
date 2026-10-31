# 25. Screen and title bar

## Frame

Centred in the body, top margin 30 px. Inner size 273 × 223 px, plus an 8 px border of rgba(0,0,0,0.5), content-box sizing, radius 10 px.

Fill: linear gradient at 135°, #a5a59b to #d6d5d0. Inner shadow 0 0 10 2 #4d4d4d.

Type: 26 px, line-height 1, ink #484647. `pointer-events: none` on the whole screen.

**Scrim:** a centred layer 10 px smaller each way, rgba(72,70,71,0.1) with luminosity blend, no pointer events.

Content opacity: 1 in light scheme, 0.85 in dark scheme or when lit. It applies to title bar, list, Now Playing, Brick and overlays.

## Backlit

Add when lit:

- Frame: border 8 px rgba(24,24,24,0.7). Inner shadow replaced by a solid 5 px ring of rgba(71,71,71,0.85).
- Scrim: colour #0f69ff, `plus-lighter` blend, opacity 0.2, shadow -1 0 4 7 white.
- Tint for selected row text: #b5c3d8.
- Lamp layer: centred on the frame, height less 10 px, width plus 2 px, shifted 6 px left, opacity 0.15, `plus-lighter`. Bulb colour B = rgb(254,249,220). Radial gradients, all together:
  - Three at left, 50% × 70% ellipses at x 0, y 19%, 53%, 83%: B at 0, B 0.85 at 6%, B 0.15 at 20%, transparent at 50%.
  - The same three again: B at 0, B 0.85 at 6%, transparent at 33%.
  - Three at right, 20% × 83% ellipses at x 100%, y 19%, 54%, 83%: B at 0, B 0.7 at 6%, transparent at 33%.

## Vertical layout

Title bar 37 px, then body 181.7 px, clipped. Screens stack absolutely at full width. The menu layer sits above the scrim (z-index 2), overlays at 3.

## Title bar

37 px tall with 5 px side margins and a 2 px #484647 bottom rule. Content:

- **Title:** centred at 50% across and 50% + 3 px down. Max width 100% − 86 px.
- **Play state icon**, once a track is loaded, 10 px from the start edge, centred with 1.2 px down, ink:
  - Playing: right-pointing triangle, box 17 × 20, scaled 0.9.
  - Not playing: two bars, box 14 × 20, scaled 1 × 0.8, nudged 2.3 px towards the centre.
- **Battery**, always, full, decorative: top 3 px, end 5 px. Drawn at 98 × 44 with a 6 px outline, then scaled to 0.3, origin at its right edge, 23% down, for a final size near 31 × 17 px. Outline in ink, with a small nub on the far end, and four solid cells filling the inside with thin gaps.

The bar is `dir`-aware (23). On Brick its grid replaces the title (18).

## Visual check

Verified live at 0.75 scale: root and Now Playing screens match this description. Selected row spans the full list width less the scrollbar. Title bar, screen rule and text are crisp.

## What the screen does not do

No artwork. No progress on list screens. No clock.
