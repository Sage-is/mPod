# 41. One window at a time (our own addition)

Only without `catalogue-url`. Two copies of mPod must not play together or overwrite each other's stored data. An installed app and a browser tab count as two copies.

## Taking over

At start, take the Web Lock `mpod` with `steal: true`, and hold it for the life of the page. The newest window wins. A reload takes the lock back as the old page closes. Where `navigator.locks` is missing, skip all of this.

## The window that lost

When its lock request rejects with `AbortError`:

- Pause playback, and clear the Media Session.
- Stop every write: IndexedDB, resume state and settings. Stop any rescan.
- Stop the auto-off from 39.
- Show the lines `Playing in`, `another window` over the screen, in the style of the offline overlay.

Any press there steals the lock back, then reloads the page, so that it starts from fresh stored data.

## Tests

Use two pages on one origin: the second takes over, the first stops playing and writing, a press in the first takes it back, and a reload keeps working alone.
