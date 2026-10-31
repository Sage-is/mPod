# 08. Actions

## Select

By top screen:

**List:** act on the selected row (07). A `play` row:

- With no catalogue loaded, nothing.
- If this row is the current song of the current queue (09, queue match): resume if paused, without restarting.
- Otherwise make this list the queue, starting at this song, and record this screen as queue source (10).
- Either way, push Now Playing.

**Now Playing:** if the volume bar is showing, leave volume mode and stop. Otherwise, if a track is loaded, toggle scrub mode. Otherwise nothing.

**Brick:** launch (18).

## Menu

Pop one screen. At Root, nothing. Verified live. From Now Playing, playback goes on. From Brick, the game is abandoned.

## Play/Pause

In order:

1. A track is loaded: toggle pause and resume, on any screen.
2. A queue start is in progress: pause.
3. Otherwise look at the selected row:
   - A navigate row targeting Songs, a playlist or an artist, which yields at least one song: queue that whole list, record that list as queue source, push Now Playing. Start at the first song, or a random one when shuffle is on. Verified live: on Root's Songs row it starts song 1.
   - A play row: same as Select.
   - Otherwise, if the queue is non-empty, resume. Verified live: on the Playlists and Artists rows at Root nothing happens, because those lists do not directly hold songs. A row for one playlist or artist does start it.

## Selection on arrival

**Push:**

- Backlight Timer: select the row of the current mode, else row 0. Verified live.
- Other lists: if the list matches the queue, select the current song. Else the remembered selection (10). Else row 0.

**Pop:** if the list matches the queue and its stored "keep row" flag is false, select the current song. Otherwise the remembered selection, else row 0. Restore the saved scroll offset only if the selection equals the index it had when the screen was left; otherwise leave scrolling to the selection rule.

If rows shrink below the selection, clamp to the last row.

## Rotation on a list

Move the selection by the signed amount, clamped to the rows, with no wrap. An empty list does nothing. The selection walks onto info rows too, with nothing painted: on About it reaches row 4 invisibly. Verified live.

A real move sets the screen's "user moved" flag, which stops the selection following the playing song. The flag clears on every push. Pop restores it from the entry being returned to, where it is stored true only by an idle jump that interrupted a user-moved list. That is how an idle jump keeps the user's row. Verified live: row 3 chosen, idle jump, Menu, still row 3.

## Leaving a screen

On each push: save selection and scroll position in the current entry, save to memory (10), reset the last-key timestamp, reset the list acceleration tracker, and tell scrub and volume whether the new screen is Now Playing, which ends those modes if it is not.

On each pop: the same, minus saving a scroll position. Popping at depth 1 does nothing.

Both also bump a navigation counter. It keys the screen body, the row ids (22) and resets the Escape timer.

## Queue end

See 12.

## Links

Song title link: a plain main-button click with no modifier keys, when a host has set the `navigateToUrl` property, calls it with the href and prevents default. Failures are logged. Otherwise the link is an ordinary link.
