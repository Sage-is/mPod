# 35. Media controls (our own addition)

The lock screen, notification, headset and keyboard media keys all control mPod.

Tested on the Z Fold4 in Chrome: play, pause, next and previous reached the page with the screen off, and tracks changed while hidden. Cover art and the seek bar appeared for only some tracks. Finding that cause is part of this work.

## Metadata

On every track change, set `navigator.mediaSession.metadata`: title, artist, album and artwork. Set it as soon as the track is chosen, then update artwork when ready. A stale title must never show.

## Artwork

- Sources, in order: embedded art, an image in the track's folder named `cover`, `folder`, `front`, `album` or `artwork` with extension `jpg`, `jpeg`, `png` or `webp`, then our placeholder.
- `reference/art.js` is our own earlier reader for ID3 `APIC` and MP4 `covr`. Use it as a starting point in `src/`. Also read FLAC `PICTURE` blocks. Read the whole ID3 tag, however large.
- Scale art to 512 × 512 on a canvas, and encode it as JPEG before publishing, so size or format never blocks it.
- Keep the two most recent artwork URLs alive, because the browser fetches them after a delay. Revoke older ones. A likely cause of missing art is revoking a URL before it was fetched.
- The placeholder is the 512 icon, by absolute URL.
- Cache scaled art by track in memory, up to 50 items.

Now Playing on the device stays text, as in the original.

## Actions

Register `play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward` and `seekforward` once, at startup. Wrap each in try and catch, since browsers may refuse an action.

- `previoustrack` and `nexttrack` follow Back and Forward in 11, including restart within the first 3 seconds.
- `seekbackward` and `seekforward` move 10 seconds.
- `seekto` honours `fastSeek` when it is offered.
- Each runs through the same code as the wheel buttons, so the device and the screen stay in step.

## Position

- Call `setPositionState` on duration change, play, pause, seek, rate change and track change.
- Only call it with a finite duration above 0, and clamp position to the duration. Clear it when no track is loaded.
- Set `playbackState` to `playing`, `paused` or `none` at the same moments.
- A seek bar needs known duration, so a track must publish position when its duration arrives, even if that is after metadata. A likely cause of the missing seek bar is this order.

## Background audio

Audio passes through Web Audio. When a page is hidden, the context must keep running.

- Resume a suspended context on any media action.
- A pause from a phone call or another app must leave the device showing paused, and a resume must work.
- Track changes while hidden must work, including reading the next file through its handle.
- Preload the next file's object URL before the current track ends. Crossfade timers must not rely on rendering, because hidden pages throttle them. Use `ended` and the audio clock.

## Keys

`MediaPlayPause`, `MediaTrackNext` and `MediaTrackPrevious` work through Media Session on desktop, with no separate key handling.

## Tests

Test with a stubbed `navigator.mediaSession` that records calls, checking order, values and every action. Real device checks stay with the owner.
