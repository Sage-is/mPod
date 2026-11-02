# 43. Review rulings: playback and menus (our own addition)

A code review found these. This file and 44 win over every earlier spec, on the product page only. The test page stays as it is.

## Pause

A pause from any source wins over a file that is still opening. This covers Pause, off and the lost window, after a skip, a crossfade or a restart of the track. When the file opens, the channel stays silent and paused, and the screen and the lock screen agree.

## Resume

- The Shuffle setting reaches a parked queue. Changing it reorders that queue as 11 does, with the parked track first, and the new order is stored.
- A paused seek or a paused track change is stored at once.
- Forward and Back do nothing while the parked track's folder waits.
- A media Play with a parked track resumes that track, never a highlighted row. With no queue, 08 stands.
- Play on the row that opens the parked queue's own source resumes it, through the permission rule in 42. It does not restart the list.
- A failed art read is not remembered. When a parked track's folder comes back, publish its art again.

## One window

- Any pointer press anywhere on the device steals, including on the screen. Listen on the device, not only the wheel.
- In a lost window, no other listener runs for that press, including the wake in the constructor.

## Power

- A finger that joins the chord stays watched, so turning the wheel still leaves the chord, and its release still presses nothing.
- The chord eats every click until the next fresh press, not only one. A fresh key press clears this, as a fresh pointer press does.
- Restart waits for the new worker for up to 5,000 ms, not 1,000.

## Browse

- Artist, genre and composer song lists group by album as 37 defines it: the pair of album and album artist. Two albums with one title stay apart, each in track order.
- `albumOf` keys contain the separator that `menus.js` splits on. Keep `artistAlbum` working.

## Tags

These ship with the reread in 37, so no later pass is needed.

- ID3 text marked Latin-1 reads as UTF-8 when its bytes are valid UTF-8 and include one above 0x7F.
- A genre that is only an ID3v1 number, bare or in parentheses, shows its ID3v1 name, for 0 to 191. Any other number counts as no genre.

## EQ

Preamp is minus the largest gain, less a further 1.5 dB, when that gain is positive. Otherwise it is 0 dB. This replaces the rule in 42, and keeps every preset's combined curve at or below 0 dB.
