# 42. Rulings on 36 to 41 (our own addition)

A review of the batch found these. This file wins over every earlier spec, on the product page only. The test page stays as it is.

## Reach

- 36's Resume applies only without `catalogue-url`, like 37 to 41.
- 37 replaces the root rows in 07, 30 and 32. `Name` is the first row of Settings.
- Settings writes keep every field: add `name`, `eq` and `contrast` to 15's list. The test page keeps stored fields it does not show.
- With no catalogue, 21's offline overlay and inert state do not apply.
- 32's rescan at start covers library folders only, never the folders in 38.

## Resume

- Store folder id plus relative path, not an index, because a rescan shifts indices.
- Store the queue source and a shuffle seed when a queue starts. The 5 second write holds only the track and position.
- On start, build the queue without playing: load the track, seek, stay paused. If the list has changed, the resumed track comes first.
- A track is gone only if it has left the stored index. A waiting folder does not make it gone.
- Track in a waiting folder: `Now Playing` shows. The first press that would play requests permission, as in 32. A Media Session action cannot request it, so it does nothing. Refused: stay paused, and show `Reconnect`.
- 15's "the queue does not" return gains: except for Resume.

## Menu and queue

- `Shuffle Songs` wins over the Shuffle setting for that queue, including `Albums`. A later change to the setting applies as in 11.
- Play on a highlighted list: rule 3 of 08 applies to every kind listed in 37, and to `Shuffle Songs`, which builds a new order even when Songs is the queue source.
- The composer reread may happen during the quiet rescan at start, once, as an exception to 32's rule on unchanged files. The stored library still shows first.

## Extras

- `Rescan` is offered only for a picked folder. File input results persist too, with no handle.
- Replace stored data only after a complete read. A refusal or an error keeps it.
- The `Skipped` row shows any skipped count, whatever the reason.
- `EXDATE` removes the occurrence starting at that time.
- A rule with any part beyond those in 38 counts as another rule. `BYDAY` works only when weekly.
- Without `COUNT`, jump straight to the first occurrence near today, rather than stepping from `DTSTART`.

## Power

- Off shows solid `#111`, or the Charging screen.
- `Charged` shows only if charging below full was seen since the page started, so a computer with no battery stays solid.
- Entering off clears `forcedOn` and `forcedOff` (16).
- A press that wakes starts no single hold. It can still be part of Restart.
- Hold Play during Brick abandons Brick as Menu does (08), then goes off.
- Auto-off is blocked on Name, like the idle jump.
- Space and Escape together are exempt from 05's rule that a new key cancels an active one.

## EQ

Preamp is minus the largest of the ten gains when that is positive, otherwise 0 dB.

## One window

- The lost window ignores Media Session actions.
- A stopped rescan ends at its current transaction. A rescan writes deletions last, so stopping loses nothing.
- The lost window is not inert. Its first press runs only the steal, and no other action.
