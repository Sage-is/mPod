# 09. List behaviour

## Scrolling window

- Body height 180 px, top margin 1.7 px, side padding 5 px.
- Row height 30 px: 26 px type at line-height 1, 3 px padding above, 1 px below, 12 px at the sides. Six rows show at once. Verified live: 48 rows give a scroll height of 1,440.
- The list is a real scrolling element, hidden horizontally, automatic vertically. Every row is in the DOM; there is no virtual window.
- When the selection changes, and on first paint, scroll the selected row into view with "nearest" alignment, so the view moves only when the selection reaches an edge.

## Scrollbar

Webkit-styled, 12 px wide, present only when rows exceed six. Track: fill of rgba(72,70,71,0.1) with a 1 px solid #484647 border. Thumb: #484647, inset by a 2 px transparent border with the background clipped to the padding box. It cannot be dragged, because the screen ignores pointers.

## Row painting

- Flex row, title and value at opposite ends, centred vertically. No wrapping. The title truncates with an ellipsis. The value keeps normal weight and does not wrap.
- Selected row, unless informational: fill #484647. Text is the backlit tint when lit (25), else #afaea7, or #b8b7b1 in right-to-left. Value and chevron use that tint when lit, else #c1c1ba. Chevron unlit: #b9b9b3, or #a7a79f in right-to-left.
- Informational rows never show a highlight, even when selected.
- Inline-toggle value: #333, with an ellipsis if needed. Info value: inherits text colour.
- Centred info row (`Pod`, `No Music`): title centred.
- Chevron: a 12 × 12 box with 3 px #333 borders on its top and end sides, rotated 45° then nudged -2 px on its own y axis, 5 px end margin. Mirrored in right-to-left.
- High contrast (`prefers-contrast: more`): selected fill black, text #eed unless lit, value and chevron #eed.
- Each title and value uses automatic text direction.

## Order

No sorting anywhere. Rows keep catalogue order: `songs`, `playlists`, `artists`, and each `songIds`. Ids not found in `songs` are dropped silently.

## Queue match

A list matches the queue when the song ids of its play rows, in order, equal the queue's ids exactly, same length, non-empty. The current song's row is the play row at the queue's current index.

While a matching list shows and its "user moved" flag is off, the selection follows the playing song as tracks change.

Verified live: with track 2 playing from Songs, Menu lands on row 1.

## Truncation

| Text | Rule |
| --- | --- |
| List rows | one line, ellipsis |
| Title bar | centred, max width is bar width less 86 px, ellipsis, automatic direction |
| Artist, album on Now Playing | one line, ellipsis |
| Song title on Now Playing | marquee (10) |

Verified live: `Paper Rivers 00 (E...` paints on a row, while `debugState()` carries the full text.
