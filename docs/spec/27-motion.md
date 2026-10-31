# 27. Timings and motion

## Screen slide

Screen width w = the body's own client width, 273 px at full scale.

Push: the new screen enters from +w to 0, the old leaves from 0 to -w. Pop reverses both. In right-to-left, directions flip.

Duration 240 ms, ease in-out: progress = -0.5 × (cos(π t) − 1).

Interrupted slides pick up where they are:

- **Incoming** during an outgoing slide in the same direction: take over the leaving node's current x, which is hidden, and start there. Duration 240 ms × |x| ÷ w, so speed holds, not duration. Ease: sin(π t ÷ 2), since it is already moving.
- **Outgoing** that was still sliding in: from its current x to the far edge. Duration 240 ms × min(1, distance ÷ w). Same sine ease.

Reduced motion, or a zero-width body: no animation.

## Other motion

| Thing | Timing |
| --- | --- |
| Now Playing strip | 0.3 s ease-out |
| Device scale | 0.25 s ease-in-out |
| Ring and Select press | 0.1 s ease-out |
| Marquee | 2 s delay, 20 px/s, linear, infinite |

## Timers

| Name | Value |
| --- | --- |
| Boot minimum | 2,000 ms |
| Boot maximum | 10,000 ms |
| Idle jump | 10,000 ms |
| Volume bar idle | 5,000 ms |
| Scrub idle | 5,000 ms |
| Scrub commit | 1,000 ms |
| Volume save | 1,000 ms |
| Hold, first fire | 1,000 ms |
| Back or Forward repeat | 500 ms |
| About Select hold | 5,000 ms |
| Key scroll delay, repeat | 300 ms, 80 ms |
| Acceleration stale gap | 250 ms |
| Acceleration tier | 500 ms |
| Restart threshold on Back | 3 s |
| Crossfade | 2 s |
| Display flip in crossfade | 1 s into next track |
| Backlight | per 16 |
| Audio unlock guard | 1,000 ms |
| Click spacing, backlog, restart gap, stale | 50, 150, 80, 200 ms |
| Brick tick | 40 ms at level 1 |
| Brick serve | 1,000 ms worth of ticks |
| Ink attack, release, paddle release | 20, 70, 25 ms |

## Rates

Wheel: 15° per row or second. 4.5° per volume percent. 20.4545° per volume click. 8° reversal resistance. Keys: 5% per volume step.
