# 21. Boot, errors, offline, no music, idle jump

## Inert

The device is inert while loading or offline. Inert means: menu layer hidden (`visibility: hidden`, still mounted), wheel and buttons ignore actions (04), keys swallowed, Brick paused.

## Boot gate

Deliberate: the device shows its boot screen for at least 2,000 ms, then at most until data arrives, capped at 10,000 ms.

loading = (data not settled and under 10,000 ms) or under 2,000 ms.

**This explains the "first click changed nothing":** a click inside the first 2 s is dropped. Verified live: a press at 1.5 s after load does nothing; one after about 2.1 s works. Timing starts at the element's mount.

Boot screen: no logo. Show the word `Pod`, centred, in screen type, shifted 10 px up, with screen opacity (25). It takes no pointer events. The original shows a logo here; do not copy it.

A Menu hold during boot still toggles the backlight; other input is dropped. Verified live.

## Loading

On mount and online, fetch `catalogue-url`. If not OK, or the JSON's `schemaVersion` is not 3, or the network fails: error state. If a fetch is superseded, ignore its result. Each attempt sets status loading.

## Error and slow load

Verified live, for HTTP 500 and schema 2:

- After 2 s the menu appears normally. No message is shown; the failure is only logged.
- Root rows are intact. Playlists, Artists and Songs each show one centred row `No Music`. About shows Songs `0`.

Verified live, slow data at 3 s: boot lasts 3 s. Slow data at 12 s: boot ends at 10 s with No Music lists, and when data arrives they fill in live, with no reboot.

## No music

An empty catalogue behaves the same with no error. Verified live. Artists shows no All row. A No Music row is info: selectable, nothing happens.

## Offline

Watch `navigator.onLine` plus window `online` and `offline` events.

Offline, at any time: overlay, playback paused, inert. Overlay: centred column with a drawing and the text `You are not connected to the internet` at 13 px, 10 px side margins, 20 px from the bottom, centred. Drawing: your own sad-faced little player, 90 px wide, shifted -10% in x, in currentColor. Screen opacity applies, no pointer events.

Back online, once boot had finished at least once: menu returns as it was, with no boot screen, and playback stays paused until Play/Pause. Verified live.

If going offline during the very first boot: clear the timers. Back online: restart the 2 s and 10 s timers. If data is not ready when back online, fetch again. Offline at mount: no fetch and no timers until online. Verified live: offline at mount shows the overlay for as long as it lasts; once online the boot screen runs a full 2 s, then the menu works.

## Live status text

A visually hidden `role="status"` element in the screen, present from a tick after mount. Text: `Loading` while loading, `Ready` after, the offline text while offline. Verified live.

## Idle jump to Now Playing

While music is playing, on any screen except Now Playing and Brick: 10,000 ms without activity pushes Now Playing, by itself. Any activity restarts the countdown. Arrival on a blocked screen or pausing cancels it.

It does not take focus unless focus was on the screen (06), and it keeps the row the user had moved to (08). Verified live: nothing at 9 s, Now Playing at 10.3 s; Menu returns to the moved row.

## Rows at Root after failure

The Now Playing row depends only on a non-empty queue (12).
