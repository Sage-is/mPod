# Roadmap

This file tracks active work only.

> **Convention** — Sections map to kanban columns. Inline source tags use the same vocabulary. `KANBAN.canvas` auto-generates from this file and inline tags, so do not hand-edit it.
>
> | Column      | Markdown section          | Inline tag |
> |-------------|---------------------------|------------|
> | Backlog     | `## Backlog`              |            |
> | TODO        | `## TODO`                 | `TODO:`    |
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
  - [ ] [MANUALLY] Move to Startr CapRover: unlisted URL, HTTP off, Cloudflare URL in front

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

- [x] **Stage 0**: folder survives restart and audio plays hidden, on Chrome on the Fold
- [x] **Stage 1**: repos created, app split out, 45 of 45 scenarios on the new layout
