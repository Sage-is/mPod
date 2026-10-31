# 01. How the tests drive you, and file map

Tests use real pointer and keyboard input through Chrome DevTools, in headless Chrome, against invented fixtures at `/fixtures/catalogue.json`. The host page centres you in a flex row. Each scenario is a fresh page load with cleared storage. A snapshot compares your `debugState()` with the original's, minus fields the scenario marks as time-dependent or random.

## Aim points

With W = `getWheelRect().width` and C = the rect's centre:

- Select: at C.
- Ring: drags at radius 0.27 W, starting at 12 o'clock.
- Menu: 0.447 W above C.
- Back: 0.447 W left of C.
- Forward: 0.447 W right of C.
- Play/Pause: 0.447 W below C.

## Steps

- `press`: mouse down, about 30 ms, mouse up on a button.
- `hold`: mouse down for the given ms, then up. Used on Select, Menu, Forward, Back.
- `rotate`: a drag round the ring by the given degrees, positive clockwise, in small moves.
- `key`: a quick key down and up, with no focus step before it.
- `wait`, `snapshot`.

## Things that affect results

- The page may report dark colour scheme, so default backlight may be `always_on` (15). Follow the media query.
- All timers in 27 are observable.
- Brick final scores are compared exactly, so its physics must match 19 to the tick.
- A snapshot straight after load can land inside the boot gate (21).

## File map

| File | Subject |
| --- | --- |
| 02 | wheel geometry, drag, angle maths |
| 03 | detents and acceleration |
| 04 | buttons, hold, repeat, touch, mouse wheel |
| 05 | keyboard on the ring |
| 06 | keyboard on the screen, focus rules |
| 07 | view table and row kinds |
| 08 | actions: Select, Menu, Play/Pause, arrival selection |
| 09 | list window, scrollbar, painting, order, truncation |
| 10 | selection memory, marquee |
| 11 | queue, shuffle, repeat, skip, pause |
| 12 | end of track, queue end, seek, play failure |
| 13 | Now Playing layout, time formats |
| 14 | volume, scrub, hold seek |
| 15 | settings, persistence, reset |
| 16 | backlight logic |
| 17 | audio graph, clicker |
| 18 | Brick rules |
| 19 | Brick physics |
| 20 | Brick display |
| 21 | boot, errors, offline, no music, idle jump |
| 22 | accessibility |
| 23 | strings, formats, localisation hooks |
| 24 | device body, scale, font |
| 25 | screen, title bar, backlit look |
| 26 | wheel look |
| 27 | all timings and motion |
| 28 | catalogue format |

## Confidence

"Verified live" in these files means the behaviour was observed on the running reference, not only inferred. Anything else was read from it and not separately exercised.
