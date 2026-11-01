# Roadmap

This file tracks active work only.

> **Convention** — Sections map to kanban columns. Inline source tags use the same vocabulary. `KANBAN.canvas` auto-generates from this file and inline tags, so do not hand-edit it.
>
> | Column      | Markdown section          | Inline tag |
> |-------------|---------------------------|------------|
> | Backlog     | `## Backlog`              |            |
> | TODO        | `## TODO`                 | `TODO:`    |
> | In Progress | `## In Progress

- [ ] **Final device checks** [MANUALLY]: phone test passed 2026-11-01
  - [ ] Install on a computer, link a folder, try the media keys
  - [ ] Reconnect tap in the installed app after a restart

## TODO`                 | `TODO:`    |
> | In Progress | `## In Progress`          | `FIXME:`   |
> | Bugs        | `## Bugs`                 | `BUG:`     |
> | Done        | `- [x]` items / `## Done` | —          |

## In Progress

- [ ] **Remembered library**: survives reload and restart (`docs/spec/32`) #critical
  - [ ] Folder handles and track index in IndexedDB
  - [ ] Reconnect row, rescan, Folders screen
  - [ ] Help screens when there is no music
  - [ ] Session-only fallback for Brave

- [ ] **Name**: default `mPod`, editable in Settings (`docs/spec/33`)
  - [ ] Wheel letter picker, typing on desktop

- [ ] **Installable app**: PWA on desktop and Android (`docs/spec/34`) #critical
  - [ ] Manifest, our own icons, service worker, offline start
  - [ ] Phone layout and real touch on the wheel
  - [ ] Haptic tick tied to Clicker
  - [ ] Serve over tailnet HTTPS
  - [ ] [MANUALLY] Install on computer and Fold, test the Reconnect tap

- [ ] **Media controls**: lock screen, headset, keyboard keys (`docs/spec/35`)
  - [ ] All actions, position state, artwork from tags
  - [ ] Fix art and seek bar showing on only some tracks
  - [ ] [MANUALLY] Test media keys and lock screen on both devices

## TODO

### After the phone test

- [ ] **Listening features**: built from `docs/spec/36`
  - [ ] Resume last track and position
  - [ ] Play counts, Recently Added, Most Played, Recently Played
  - [ ] Albums and Genres menus
  - [ ] On-The-Go playlists

### Delivery: raised 2026-11-01

- [ ] **Hosting**: `dist/` leaves the tailnet; it is plain static files #platform
  - [x] [WE] `make publish`: generated files, release suites, `dist/`, live copy
  - [x] [MANUALLY] Public on Cloudflare Pages, no gate (Alexander, 2026-11-01); decision record `OPS-Sage/docs/decisions/2026-10-11-pages-for-sites.md`
  - [ ] [MANUALLY] Fill the Pages deploy token in the vault
  - [ ] [WE] Swap the rsync line in `make publish` for `bunx wrangler pages deploy dist`; Netlify and nginx take the same folder
  - [ ] [WE] `_headers`: `X-Robots-Tag: noindex` until Alexander announces it
  - [ ] [MANUALLY] Reinstall from the new address and link folders again: a new origin starts empty

- [ ] **CI/CD**: runs on the cluster; the card lives in `OPS-Sage/TODO.md` #platform
  - [ ] [WE] `make check` becomes this repo's job once the runner exists; it needs headless Chrome
  - [ ] [WE] Until then, a pre-commit hook running `node dev/build-sw.mjs --check`

- [ ] **Own static hosting**: revisit when AI-UI's Workshop apps tab is built #platform
  - [ ] Its planned frame has no same origin, so a service worker and folder access need a real origin

### Next version: chosen 2026-10-31

- [ ] **Sound**: each one can be turned on and off #audio
  - [ ] Volume levelling
  - [ ] Equaliser presets
  - [ ] Gapless playback
  - [ ] Sleep timer

- [ ] **Extras menu**: clock, stopwatch, Brick with a saved high score #device

- [ ] **Spoken audio and ratings** #library
  - [ ] Podcasts and audiobooks: position per file, no shuffle, playback speed
  - [ ] Star ratings and a Top Rated list, stored in mPod

- [ ] **Self-hosted library**: stream from Navidrome or Jellyfin #library

- [ ] **System integration** #platform
  - [ ] Open with mPod for audio files and `.m3u`
  - [ ] Mini player window on desktop
  - [ ] Backup and restore for playlists, ratings and stats

## Backlog`              |            |
> | TODO        | `## TODO`                 | `TODO:`    |
> | In Progress | `## In Progress

- [ ] **Final device checks** [MANUALLY]: phone test passed 2026-11-01
  - [ ] Install on a computer, link a folder, try the media keys
  - [ ] Reconnect tap in the installed app after a restart

## TODO`                 | `TODO:`    |
> | In Progress | `## In Progress`          | `FIXME:`   |
> | Bugs        | `## Bugs`                 | `BUG:`     |
> | Done        | `- [x]` items / `## Done` | —          |

## In Progress

- [ ] **Remembered library**: survives reload and restart (`docs/spec/32`) #critical
  - [ ] Folder handles and track index in IndexedDB
  - [ ] Reconnect row, rescan, Folders screen
  - [ ] Help screens when there is no music
  - [ ] Session-only fallback for Brave

- [ ] **Name**: default `mPod`, editable in Settings (`docs/spec/33`)
  - [ ] Wheel letter picker, typing on desktop

- [ ] **Installable app**: PWA on desktop and Android (`docs/spec/34`) #critical
  - [ ] Manifest, our own icons, service worker, offline start
  - [ ] Phone layout and real touch on the wheel
  - [ ] Haptic tick tied to Clicker
  - [ ] Serve over tailnet HTTPS
  - [ ] [MANUALLY] Install on computer and Fold, test the Reconnect tap

- [ ] **Media controls**: lock screen, headset, keyboard keys (`docs/spec/35`)
  - [ ] All actions, position state, artwork from tags
  - [ ] Fix art and seek bar showing on only some tracks
  - [ ] [MANUALLY] Test media keys and lock screen on both devices

## TODO

### After the phone test

- [ ] **Listening features**: built from `docs/spec/36`
  - [ ] Resume last track and position
  - [ ] Play counts, Recently Added, Most Played, Recently Played
  - [ ] Albums and Genres menus
  - [ ] On-The-Go playlists

### Delivery: raised 2026-11-01

- [ ] **Hosting**: `dist/` leaves the tailnet; it is plain static files #platform
  - [x] [WE] `make publish`: generated files, release suites, `dist/`, live copy
  - [x] [MANUALLY] Public on Cloudflare Pages, no gate (Alexander, 2026-11-01); decision record `OPS-Sage/docs/decisions/2026-10-11-pages-for-sites.md`
  - [ ] [MANUALLY] Fill the Pages deploy token in the vault
  - [ ] [WE] Swap the rsync line in `make publish` for `bunx wrangler pages deploy dist`; Netlify and nginx take the same folder
  - [ ] [WE] `_headers`: `X-Robots-Tag: noindex` until Alexander announces it
  - [ ] [MANUALLY] Reinstall from the new address and link folders again: a new origin starts empty

- [ ] **CI/CD**: runs on the cluster; the card lives in `OPS-Sage/TODO.md` #platform
  - [ ] [WE] `make check` becomes this repo's job once the runner exists; it needs headless Chrome
  - [ ] [WE] Until then, a pre-commit hook running `node dev/build-sw.mjs --check`

- [ ] **Own static hosting**: revisit when AI-UI's Workshop apps tab is built #platform
  - [ ] Its planned frame has no same origin, so a service worker and folder access need a real origin

### Next version: chosen 2026-10-31

- [ ] **Sound**: each one can be turned on and off #audio
  - [ ] Volume levelling
  - [ ] Equaliser presets
  - [ ] Gapless playback
  - [ ] Sleep timer

- [ ] **Extras menu**: clock, stopwatch, Brick with a saved high score #device

- [ ] **Spoken audio and ratings** #library
  - [ ] Podcasts and audiobooks: position per file, no shuffle, playback speed
  - [ ] Star ratings and a Top Rated list, stored in mPod

- [ ] **Self-hosted library**: stream from Navidrome or Jellyfin #library

- [ ] **System integration** #platform
  - [ ] Open with mPod for audio files and `.m3u`
  - [ ] Mini player window on desktop
  - [ ] Backup and restore for playlists, ratings and stats

### Before anyone outside uses it

- [ ] **Release blockers** [MIXED] #critical
  - [ ] Replace or clear the screen font (`docs/FONT.md`)
  - [ ] Re-derive `src/styles.js` to cut the CSS overlap
  - [ ] [MANUALLY] Trademark check on `mPod`
  - [ ] [MANUALLY] Lawyer review of the look and the method
  - [ ] [MANUALLY] Choose the public address: see **Hosting**

## Backlog

- [ ] **Device ideas** #device
  - [ ] LCD grid setting, as tested on the font page
  - [ ] Letter jump in long lists
  - [ ] Hold switch
  - [ ] Colour skins and other device styles
  - [ ] Selection bar running to the display edge

- [ ] **Library and system ideas**
  - [ ] Folder browsing that follows the disk layout
  - [ ] Chromecast

- [ ] **Font recomp**: our own file from a design, or a CleanRoom `font` kind

## Bugs

- [ ] **Font test suites fail by design**: `tests/font-unit.mjs` and `tests/t11-font.mjs` expect our drawn font #bug

## Done

- [x] **Release risk accepted** (Alexander, 2026-11-01): font, CSS overlap, name and look ship as they are; a complaint means taking it down
- [x] **Stage 2**: remembered library, Reconnect, rescan, help screens, Brave fallback (`docs/spec/32`)
- [x] **Stage 3**: name, editable in Settings (`docs/spec/33`)
- [x] **Stage 4**: installable app, phone layout, touch, haptics, lock screen controls, art and seek bar (`docs/spec/34`, `docs/spec/35`)
- [x] **Stage 0**: folder survives restart and audio plays hidden, on Chrome on the Fold
- [x] **Stage 1**: repos created, app split out, 45 of 45 scenarios on the new layout
- [x] **About tells the truth**: Library size and the build's real version; a browser cannot read the disk (`docs/spec/34`)
