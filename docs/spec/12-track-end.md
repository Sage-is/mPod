# 12. End of track, queue end, seek, play failure

## Channels

Up to two channels: current and next. Each has its audio element and a fade gain. Fading channels may linger. Keep the auto-advance target loaded in the next channel, rebuilt whenever index, shuffle or repeat changes.

Auto-advance target: with Repeat One, the playing song itself. In other modes, the adjacent next track, if any.

## Fades

Crossfade length 2 s, equal-power. Gain curves are 50 samples: fade in cos((1−x)·π/2), fade out cos(x·π/2), x from 0 to 1. Apply with a value curve. Starting a fade cancels any earlier one on that channel. "Cut in" cancels and sets gain to 1.

## At the end of a track

Tracked on `timeupdate` of the current channel, once per track:

- Duration finite, over 2 s, time at or past duration minus 2 s: if a next channel exists, crossfade to it. If not, fade out.
- On `ended` with a next channel waiting (short tracks): crossfade. With none: end the queue.
- Tracks of 2 s or less get no fade.

## Crossfade

Fade out the outgoing channel over 2 s, then destroy it. Start the incoming and fade it in. The internal current index moves to the target immediately, and the next target is prepared at once.

**The display lags.** Title, position, time and duration stay on the outgoing track until the incoming one passes 1 s, or the outgoing fade finishes, whichever is first.

Verified live on 30 s tracks: at elapsed 0:28 a fade begins; the display flips to track 2 reading `0:01`.

With Repeat One the target is the playing song, so it fades into a second copy of that song on the other channel. Verified live: 0:28 then 0:01, same index.

## Queue end

Destroy all channels, stop, zero time and duration. Then clear queue, index, loaded and loading state. Then:

1. Forget the queue source (10).
2. If Now Playing is showing, pop it.
3. If the entry now on top was left from its Now Playing row, set selection to row 0 and drop its scroll restore.

Root loses its Now Playing row. Verified live: the list comes back on the row of the last song; Root has four rows.

Verified live: the last song played to its end returns to the list about 30 s in. Fade out, no crossfade.

## Seeking

`seek(t)` applies to the track current when asked, and is dropped if the track has since changed.

If a crossfade has started but is not yet shown: undo it first. Destroy the incoming channel, cut the outgoing back to full gain, restore its index, re-prepare.

Then, on a track over 2 s, if t is in the last 2 s and an auto-advance target exists: skip to next, or restart for Repeat One. Verified live: holding Forward past the end of track 1 lands on track 2 at 0:00.

Otherwise set the time, cut to full gain, re-arm the fade trigger, and update the displayed time at once. A last track has no target, so it seeks normally and plays out. Verified live: paused seeks stay paused.

## Play failure

If `play()` rejects while starting a queue, log it and clear loading. The state connection of 11 never happens. Verified live with `play()` forced to reject:

- Now Playing opens with title, artist and album. Elapsed and remaining are `""`. No play icon.
- The queue stays, so Root keeps its Now Playing row.
- Rotation shows volume mode. Select enters no scrub.
- Play/Pause retries `play()` silently.
- Forward changes the title, while the position label stays stale.

No scenario exercises this. Keep it simple; a clean recovery is acceptable.
