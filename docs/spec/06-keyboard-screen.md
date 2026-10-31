# 06. Keyboard on the screen, and focus rules

## Tab order

Page Tab reaches the list first (tabindex 0), or the Now Playing group, then wheel buttons in order Menu, Back, Forward, Play/Pause, Select. Now Playing also holds two range inputs (22). Verified live: the first Tab lands on the list.

## Screen layer

Listen for keys on the screen body. Disabled in Brick, where nothing there takes focus.

While inert: for arrows, Enter, Space, Escape, Home, End, PageUp and PageDown, prevent default and stop propagation, and do nothing else.

**List screens**

- Down and Up: move one row. The speed estimate here is capped under the acceleration threshold, so it never accelerates and always moves one row. No click.
- Left and Right: swallowed. Verified live.
- Enter and Space, not auto-repeat: perform Select. Verified live.
- Escape: see below.
- All of these stop propagation and prevent default. Others pass.

**Now Playing**

- Escape: see below.
- With focus on a range input and the key an arrow, Home, End, PageUp or PageDown; or focus on the title link and the key Enter: stop propagation only, so the browser default still runs.
- Other arrows, Enter, Space: stop propagation and prevent default. Nothing happens.

**Escape, both screens**
Key down, not auto-repeat, starts a 1,000 ms timer that toggles the backlight when it fires. Key up before it fired goes back one screen. Verified live: tapped goes back; held 1,100 ms toggles the backlight.

The Escape timer resets on navigation, on focus leaving the screen body, on window blur, or if the device goes inert.

Note that Enter in the screen layer has no hold, so Brick can only be opened from a focused list by first moving to the wheel.

## Focus across navigation

On every push or pop, decide whether the incoming screen takes focus, before changing screens. Find the truly focused element by descending through shadow roots.

- **Normal push or pop:** focus the new screen unless focus is somewhere outside the screen. "Outside" means a focused element exists, it is not the body, and it is not inside the screen. So focus on the body moves to the new list; focus on the ring or the host page stays put.
- **Idle jump (21):** focus the new screen only if focus was already inside the screen.

Verified live: focus stays on the list through Enter and Escape; a mouse press keeps it on the ring.

Focus the list element or the Now Playing group with `preventScroll`.

## Selection scrolling and focus

Selecting scrolls within the list only (09), and focus remains on the list element, not the rows. The active row is exposed through `aria-activedescendant` (22).
