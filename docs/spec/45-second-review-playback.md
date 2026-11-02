# 45. Second review: playback (our own addition)

A second code review found these. This file and 46 win over every earlier spec, on the product page only. The test page stays as it is.

## Failed tracks

- A track whose element reports `error` counts as a track that will not open, at the start of a queue or mid-queue. 32's rule applies: it is left out, the queue moves on, and `Skipped` counts it once. On this page this replaces 12 for a file that opens but will not decode.
- After a failed `play()` of any other kind, nothing is still opening. The first press of Play retries, as 12 says.

## Play and Pause

- Play/Pause acts on what the last press asked for, not on what the command chain has reached. This holds for device presses and media keys, and for a parked track while its file opens.
- Pause stops the element at once. It does not wait behind a resume that holds the chain.
- A paused track never starts a crossfade.
- A seek during a crossfade, in a playing state, leaves the restored track playing, as a restart does.

## New queues

- A new queue waits for no file. It ends a hold by a resume as it ends a hold by a start.
- A command asked for before a new queue started does nothing to that queue. The screen, the lock screen and the stored track all name the track that plays.
- The answer to a permission prompt plays nothing if the device is off or the window has been lost by then.

## Parked tracks

- The stored place moves only once the track has connected. A parked open that has not connected, or whose `play()` failed, leaves it alone.
- A press during a quiet open turns it into a press-driven open, so a failure then counts and follows 32.
- A quiet open prepares no next track until its own file has opened.
- After a failed quiet open with the folder not waiting, Forward and Back move to the next or previous track, paused at 0:00, as they do from any paused queue. The new place is stored at once. A failure there follows 32. While the folder waits, 43 stands.

## One window

In a lost window, a modifier alone, Tab, or a key held with Ctrl, Alt or Meta is not a press. It neither steals nor is stopped.

## Browse

Two different album keys never compare as equal, so accents or number forms cannot interleave two albums. After the collator, fall back to the exact key.

## Tests

Every rule here gets a test that fails first. Also:

- t22 holds a real parked open: a file behind the open gate, with the folder not waiting, for device presses and for media keys.
- `source-row` reads the stored place, not only the element.
