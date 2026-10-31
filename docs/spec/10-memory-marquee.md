# 10. Selection memory and marquee

## Selection memory

A map from screen identity (key plus context id) to `{row id, row index}`. Row ids: song id, playlist id, artist id, or a fixed id per menu row.

- **Save** on leaving a screen by push or pop, if a selected row exists. Reset All Settings never saves, so it always opens on Cancel. Verified live.
- **Recall:** if the row at the saved index still has the saved id, use it. Otherwise search for the id. Not found means none, which arrival rules turn into row 0.

Verified live: Artists row 4, into the artist, Menu, Menu, back into Artists lands on row 4.

## Queue source

When a queue starts, remember the screen identity it came from.

Whenever the queue or current index changes: if a source is set, a current song exists, and the source screen is not on the stack, set its saved entry to the current song and index. So returning to that list later lands on the song now playing. If the source screen is on the stack, the stored entry is left for the follow rule (09).

When the queue ends, delete the source's saved entry and forget the source.

Verified live: a queue ending on the last song of an artist returns to that list on row 3.

## Marquee

Used for the Now Playing song title.

- Overflowing means text width minus container width is more than 1 px. Measure with resize observers on both.
- Not overflowing: one centred line.
- Overflowing: a track containing the text, a 30 px gap and a duplicate of the text. The duplicate is `aria-hidden`.
- Animation: translate the track from 0 to -(text width + 30) px, linear, infinite. Loop time is that distance × 0.05 s, which is 20 px per second. A 2 s delay comes before the first pass only.
- Direction is left for left-to-right text, right for right-to-left. Text direction is automatic per title.
- When the song or the text changes, rebuild the track so that the animation restarts at 0, even for the same text on a different song.
- Reduced motion: no animation, no duplicate, ellipsis.
