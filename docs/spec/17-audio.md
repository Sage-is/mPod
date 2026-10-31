# 17. Audio graph and clicker

## Graph

One `AudioContext` per element, with the webkit-prefixed fallback.

- Track path: media element source → per-channel fade gain → master gain → destination.
- Fade gain starts at 0; starting a track sets it to 1 (12).
- Master gain: value = volume ÷ 100, moved with `setTargetAtTime`, time constant 0.01 s.
- Click path: buffer source → click gain of 0.3 → destination. It bypasses master gain, so clicks ignore the volume setting.

Close the context when the element disconnects. Destroying a channel pauses the element, removes its source, reloads it empty, and disconnects its nodes.

## Unlocking

If the context state is neither `running` nor `closed`, call `resume()`. Allow one attempt at a time, and clear the guard when it settles, or after 1,000 ms at most. Triggered by device activity (04).

## Click sound

The original plays a very short decoded sample, embedded in the bundle. Do not extract or reuse it. Exact waveform is unknown to this spec.

Synthesise your own at startup: an `AudioBuffer` at the context sample rate holding a dry, percussive tick of a few milliseconds, such as a noise burst or high sine with a fast exponential decay. It should sound like a soft mechanical detent.

## Playing a click

Keep `nextTime`, the earliest moment for the next click.

- Context not running: request unlock, and record the time of the first waiting request if there is none. Play nothing yet.
- Running, buffer ready: if nextTime − currentTime ≥ 0.15 s, drop this click. Otherwise schedule at max(currentTime, nextTime), and set nextTime to that plus 0.05 s.

On the context changing to running: nextTime = max(nextTime, currentTime + 0.08). If a request was waiting: clear it, and play one click if it is 200 ms old or less.

So spacing is at least 50 ms and backlog at most about three clicks.

## What clicks

| Source | Clicks |
| --- | --- |
| List rotation | one per detent that moved the selection |
| Volume rotation | one per 20.4545° if volume changed |
| Key scroll step on the ring, list or volume | one per step that changed something |
| Scrub | never |
| Brick | never |
| Screen-layer arrow keys | never |
| Buttons, Select | never |

With the Clicker setting at `off`, none of them click. Rotation at a list end moves nothing, so it does not click.
