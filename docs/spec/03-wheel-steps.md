# 03. Detents and acceleration

## Target

At any moment the wheel drives one target:

- `seek` while scrubbing, whatever the screen.
- Otherwise by top screen: list screens `list`, Now Playing `volume`, Brick `brick`.

## On each scroll event

First count it as activity (16, 21). If inert (21), stop. Then:

**Brick target:** turn the paddle by step × degrees (18). No detents, no acceleration, no clicks.

**Otherwise** keep one accumulator of degrees. If the direction, or whether the target is volume, differs from the previous event, zero it. Add the event's degrees.

**List and seek:** the step angle is 15°, settable as property `dragStepDegrees`.

- count = floor(accumulator ÷ 15). Keep the remainder.
- If count ≥ 1, move by step × count × multiplier, where multiplier comes from acceleration below.
- If that move changed anything, play `count` clicks (17). Seek never clicks. Acceleration multiplies movement, not clicks.

**Volume:** 100 steps across 1.25 turns, so 4.5° per 1%.

- count = floor(accumulator ÷ 4.5). Keep the remainder.
- If count ≥ 1, change volume by step × count. Remember whether it really changed. The multiplier is ignored.
- A second accumulator runs at 20.4545° per click (22 clicks per 1.25 turns). Add degrees to it. When it yields n ≥ 1: keep the remainder, and if the volume changed since the last click, play n clicks and clear the flag.

Clockwise moves down a list, raises volume, and seeks forward. Lists do not wrap.

Reset of the accumulators happens at each drag start, so remainders never carry from one drag to the next. Verified live: two separate 14° drags move nothing.

Moves: list moves by that many rows (08), volume by that many percent (14), seek by that many seconds (14).

## Acceleration

Two independent trackers, list and seek. Both are fed on every scroll event in order to stay current, with their "active" flag true only while that target is the current one. The event's multiplier comes from the seek tracker when scrubbing, otherwise from the list tracker. In volume, both inactive, the value is ignored anyway.

| Tracker | Tiers | Min speed | Tier length |
| --- | --- | --- | --- |
| list | 1, 2, 3, 5, 8, 13, 21, 34 rows | 180°/s | 500 ms |
| seek | 1, 2, 3, 5 seconds | 180°/s | 500 ms |

Tracker state: smoothed speed s, last direction, last event time, start of fast run.

When not active: clear all state and return the first tier.

When active, for each event at time now (a monotonic clock, not the event timestamp):

1. `stale` is true if a previous event exists and more than 250 ms passed since it.
2. Record now as last event time. Let v = min(speed, 400).
3. If direction changed or stale: s = v, store the direction, clear fast-run start.
4. Otherwise s = s + 0.15 × (v − s).
5. If s ≤ 180: clear fast-run start, return the first tier.
6. Otherwise, if no fast-run start, set it to now. Return the tier at index floor((now − start) ÷ 500), capped at the last tier.

Navigation resets the list tracker. Ending a drag does not, so a new drag within 250 ms of the last event continues the fast run. Verified live: three 107° drags 250 ms apart gave 21 rows or 22 by a hair; with 500 ms gaps, always 21. While scrubbing, each event also restarts the scrub idle timer.

Verified live on the 48-song list: 150° in 1.3 s moved 9 rows; 720° in 1.3 s reached the last row; 62° in 0.2 s moved 4 rows.

The test step `rotate` runs at about 350°/s for under 0.5 s, so it stays on tier 1.

## Keyboard steps

Keyboard scrolling does not use these trackers. See 05.
