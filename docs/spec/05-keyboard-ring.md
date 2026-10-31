# 05. Keyboard on the ring

There are two independent keyboard layers. Which acts depends on focus. With focus on the page body, keys do nothing. Verified live. This file covers the ring layer; 06 covers the screen layer.

## How the ring gets focus

- Mouse press on the ring focuses it, if `(any-pointer: fine)` matches.
- A mouse pointer-up anywhere on the wheel also focuses it, if the same query matches and the event has non-zero width or height, which excludes synthetic clicks. So after any mouse press on any wheel button, the ring holds focus. Verified live.
- Use `preventScroll`. Ring and wheel have tabindex -1. The ring shows no outline.

## Ring key map

Listen for key down and up on the wheel, acting only when the event target is the ring.

Ctrl, Meta or Alt held: cancel any active key, do nothing more. Unknown keys pass through untouched. For a known key: prevent default and stop propagation. Ignore auto-repeat, and ignore a key already active. Otherwise cancel any other active key, then act by target (03):

| Key | list | volume | seek | brick |
| --- | --- | --- | --- | --- |
| Down | scroll +1 | scroll -1 | scroll -1 | swallowed |
| Up | scroll -1 | scroll +1 | scroll +1 | swallowed |
| Left | press Menu | hold Back | scroll -1 | steer left |
| Right | press Select | hold Forward | scroll +1 | steer right |
| Enter | press Select | same | same | same |
| Space | press Play/Pause | same | same | same |
| Escape | hold Menu | same | same | same |

In a right-to-left context the list column swaps: Left presses Select, Right presses Menu.

On About, Enter is a hold of Select with a 5,000 ms first fire.

## Kinds

- **press:** acts on key up. Goes through the same gate as the button, so Back and Forward obey the scrub block.
- **hold:** key down starts a timer, 1,000 ms unless stated. Back and Forward then repeat every 500 ms. Fired: same as a pointer hold. Released before firing: acts as a press. Verified live: Right in Now Playing skips to the next track on a short press.
- **scroll:** fires one step at once, then after 300 ms one more every 80 ms until key up. At key down, enter the dragging state unless already dragging; leave it on key up. Step size from ms held since key down:
  - list: tier table of 03, index floor(held ÷ 500), capped.
  - seek: seek tiers likewise.
  - volume: always 5% per step.
  - A step that changed something plays 1 click, unless the target is seek.
- **steer:** key down sets steer direction, key up clears it (18).
- **swallowed:** nothing happens, but the event is consumed.

If the target or the hold setting changes while a key is active, cancel it silently when its timer next fires. Wheel focus leaving, or window blur, cancels it with no action.

Each scroll step counts as activity. Steps are ignored while inert.

## Verified live

| Sequence | Result |
| --- | --- |
| Down, Down, Up at root | row 1 |
| Right on Artists | opens Artists |
| Left | back, row 1 kept |
| Space on Artists row | nothing |
| Space on Songs row | starts queue, song 1 |
| Up, Up, Down in Now Playing | volume 55, 60, 55 |
| Enter in volume mode | back to progress |
| Enter again | scrub |
| Right, Up, Down in scrub | +1, +1, -1 second |
| ArrowDown held 1.5 s in a 13-row list | reaches row 12 |
