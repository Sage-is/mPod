# 11. Queue, shuffle, repeat

Duration and time come from the audio element, never from `durationInMillis`. The fixtures show this: the catalogue says 180 s, the player shows 30 s.

## Starting a queue

Inputs: a song list and an optional start index. An empty list does nothing. With no index: 0, or a random index when shuffle is on.

Playback commands run strictly one at a time, in order. Starting a new queue cancels a start in progress.

Immediately: store the queue, set the current index, set loading true. The position shows 1 if shuffle is on, else the index plus 1.

Then, in the command order: discard any old player, build a new one with current shuffle and repeat, apply volume, load and start the chosen track, and only then connect the player's state to the display. Loading clears at the end, even on failure.

Each song is one audio element: `preload="auto"`, `crossOrigin="anonymous"`, source `previewUrl`.

## Order

- Shuffle off: queue order.
- Shuffle on: a play order of queue indices. The current song comes first, then all the others uniformly shuffled (Fisher-Yates). The position label shows the place in this order, so a shuffled start always reads "1 of N". Verified live.
- Turning shuffle on during play rebuilds the order with the current song first, and the label becomes 1. Verified live. Turning it off returns the label to the true index.
- If a crossfade has started but is not shown yet (12), keep the outgoing song first and the incoming second.
- Shuffle and repeat changes apply live to the playing queue.

## Adjacent track

One step along the order. Past either end: repeat All wraps to the far end, otherwise there is none.

## Skip buttons

| Press | Repeat One | Otherwise |
| --- | --- | --- |
| Forward | restart current track | next track; if none, end the queue |
| Back | restart current track | if playing and more than 3 s in: restart. Else previous track; if none, end the queue |

Restart: time 0, full gain, same play state, fade trigger re-armed, any undisplayed crossfade dropped.

Changing track keeps the play state: paused stays paused. Elapsed and duration show 0 and unknown until the new track reports its duration. A skip while a crossfade is pending and no target exists does nothing, rather than ending the queue.

Verified live:

- Back on the first track ends playback and returns to the list.
- Back at 3.5 s restarts the same track.
- Back while paused at 3.5 s goes to the previous track, still paused.
- Repeat All: Back from first goes to last; Forward from last goes to first.
- Repeat One: Forward stays on the track at 0:00.
- Shuffle: Back on the first of the play order ends the queue.

## Pause and resume

Pause also pauses channels still fading out. Resume with no channel loaded rebuilds the current track. Otherwise start the element, set full gain at once, and re-arm the fade trigger.

Pressing Play/Pause after the device has been offline resumes from where it stopped. Verified live.

## Volume

Volume is a 0 to 1 value on the master gain, held in the display as a whole percent, rounded. See 14 and 17.

## Host-supplied player

The original can take an external player object. Out of scope.
