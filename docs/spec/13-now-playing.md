# 13. Now Playing layout and time formats

## Layout

Sizes at full scale. The body is 180 px tall, top margin 1.7 px, padding 4 px top, 15 px sides, 7 px bottom, a clipped flex column.

1. **Position line.** A grid: flexible column then auto column, centred, 6 px below it, 20 px type, line-height 1, left aligned, always left-to-right order.
   - Left: `3 of 48`.
   - Right: repeat icon if repeat is on, then shuffle icon if shuffle is on, 6 px apart, in ink colour. They are `aria-hidden`; a visually hidden text gives their meaning (22).
2. **Info block.** Centred, 5 px below it. Each line omitted when absent.
   - Song title, marquee (10), 2 px below it. A link if the song has `url`: inherits colour, no underline, takes pointer events, underlined on hover and keyboard focus.
   - Artist, 2 px below it, one line, ellipsis.
   - Album, one line, ellipsis.
3. **Control strip.** Pushed to the bottom with auto top margin. Two panels side by side in a window one panel wide; strip width 200% + 30 px, 30 px gap.
   - Panel 1: 10 px top padding, progress bar, then time labels.
   - Panel 2: two layers in one cell, scrub and volume. Only the active one shows; the other has opacity 0. The last active layer stays visible while the strip slides back.
   - Strip position: progress at 0. Volume or scrub moves it by -(50% of strip + 15 px), in right-to-left +. Transition 0.3 s ease-out, none with reduced motion. Inner content stays left-to-right.

## Bars

- Progress bar: 15 px tall, minimum 12, 1.5 px #484647 border, radius 7 px, clipped, always left-to-right. Fill #484647, width = min(100, time × 100 ÷ duration) percent, 0 if duration is 0.
- Scrub layer: same bar with no fill and overflow visible, plus a 10 × 10 #484647 square rotated 45°, centred on that same percentage, and the same time labels under it, with 10 px top padding.
- Volume layer: grid of auto, flexible, auto with 7 px gaps, centred. Small speaker icon, filled bar at volume percent, larger speaker with two waves. Ink colour.
- Each of scrub and volume has an invisible range input covering its bar (22).

## Time labels

Flex, space between, 6 px above, 26 px type, tabular figures. Elapsed at left, remaining at right.

- Displayed time is the scrub preview if there is one while scrubbing, else playback time.
- **Elapsed:** shown when duration > 0, else `""`. floor(t) as `m:ss`.
- **Remaining:** shown when duration is finite and > 0, else `""`. A minus sign, then ceil(duration − t) as `m:ss`.
- `m:ss`: minutes are floor(s ÷ 60) with no digit grouping and no hours field, so 75 minutes is `75:00`. Seconds are s mod 60 with at least two digits. Both locale-formatted. Negative input counts as 0.

Examples verified live at t = 1.x on a 30 s track: `0:01` and `-0:29`. Both ends: `0:00` and `-0:30`.

## Title bar on this screen

Title `Now Playing`, with the play state icon, as on every screen once a track is loaded (25).

## Modes

Wheel target and strip position depend on mode. `volume` wins if both are somehow active. See 14.

## Icons

Own drawings in ink colour, sized in px: repeat-all 18 × 15, a two-arrow loop. Repeat-one 19 × 15, the same with a small `1`. Shuffle 20 × 15, two crossing arrows. Small speaker 10 × 16, a body and cone. Large speaker 18 × 16, the same plus two arcs.
