# 14. Volume, scrub and hold seek

Three modes on Now Playing: progress, volume, scrub. Default is progress. Leaving Now Playing ends volume and scrub.

## Volume mode

- Any wheel or key step on Now Playing, outside scrub, enters volume mode and restarts its 5,000 ms idle timer, even at a limit with no change.
- New value = current ± steps, clamped to 0 to 100. Unchanged means no set and no click.
- Applied at once to the master gain and the display. Saved after 1,000 ms of quiet (15).
- Timer ends: back to progress. Verified live at 5.3 s.
- Select: back to progress at once, without entering scrub. Verified live.

Verified live, from 50: +47° gives 60; -47° gives 50; +10° gives 52; +240° clamps at 100.

## Scrub mode

**Enter:** Select on Now Playing with a loaded track and no volume bar. Snapshot the current track and queue. Start a 5,000 ms idle timer. The wheel target becomes `seek`, Back and Forward go dead.

**Preview:**

- base = preview, or floor(current time) when none.
- A step asks for base + delta seconds, rounded, then clamped to 0 to duration. With unknown duration there is no upper limit.
- Every request restarts the idle timer, even with no change. No change also means nothing further.
- A change sets the preview, stores it as pending, and starts a 1,000 ms commit timer, unless a drag is in progress. Drag here includes a key held for scroll. When the drag ends, the timer starts if something is pending.

**Commit:** cancel the timer, send the pending position to `seek` (12). When the seek finishes, clear the preview, unless a newer change has happened. Stays in scrub mode. Playback continues underneath the whole time, and the display shows the preview only.

**Exit:** Select again, idle timer, or leaving the screen. Each commits anything pending first, then clears all scrub state. Verified live.

**Track change while scrubbing:** drop anything pending. If a loaded track remains and the mode was being held open by a focused range input, leave and re-enter scrub on the new track. Otherwise exit.

**Duration shorter than preview:** cap the preview, and any pending value, to the duration.

Scrub steps never click. Verified live, paused at 0:00: +47° shows `0:03` `-0:27`; after 1.3 s still `0:03`; Select exits at `0:03`. Scrub idle timeout verified at 5.3 s.

## Hold seek on Back and Forward

Fires from the hold timing in 04, on any screen.

- **First fire of a hold:** baseline = current time, note the track, reset the step counter. If inert, there is no baseline.
- **Each fire:** does nothing if there is no baseline, or it is inert, or scrubbing, or no track is loaded, or duration ≤ 0, or the track changed since the first fire.
- Step sizes in seconds, by fire: 5, 5, 5, 10, 10, 10, 20, then 20 for all further fires.
- New position = baseline ± step, clamped to 0 to duration. If the result is strictly inside, it becomes the baseline. If it hit an end, the baseline clears, so later fires do nothing.
- Each effective fire counts as activity and calls `seek`.
- Entering scrub cancels the baseline.
- A fired hold swallows the click, so it never also skips.

Verified live, paused at 0:00: Forward held 1,650 ms fires twice, giving `0:10`. Back held 1,100 ms then gives `0:05`.

## Range inputs, for assistive technology

The scrub and volume inputs of 22 tie into these modes.

- Scrub input focus: leave volume mode, hold scrub open with no idle timer, if a track is loaded. Blur: commit, then restart the timer.
- Scrub input change: same focus handling, then request that position. `change`: commit.
- Volume input focus: end scrub, hold volume open. Input: hold open, set value. Blur: restart the timer.
