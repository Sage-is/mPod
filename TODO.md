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
>
> `DEPRECATED:` tags are tracked as TODO items for removal at the stated version.

## In Progress

- [ ] **Off screen and haptics**: chosen by Alexander, 2026-11-02 #device
  - [x] Off and Charging show the unlit LCD, not `#111` (`docs/spec/48`); live as `65c37bed`
  - [x] Button ticks follow Clicker; the wheel stays at 4 ms and stops at a list's end (`docs/spec/49`)
  - [x] The wheel only turns: a touch on the ring presses nothing, as on the 1G and 2G (`docs/spec/50`)
  - [x] One 10 ms tick per press, none on release, nothing mid-hold (`docs/spec/51`, after Alexander's Fold4 try); live as `3e6aae35`
  - [ ] [MANUALLY] Try 51 on the Fold4: taps, long holds, a resting thumb
  - [ ] [MANUALLY] Approve the commit: full screen, off screen, haptics, specs 47 to 51

- [ ] **Full screen on phones**: the installed app hides the status and navigation bars (Alexander, 2026-11-02) #device
  - [x] [WE] Spec 47: manifest `display: fullscreen`, set by the spec side; `t14` checks it; live as `a2c9d27b`
  - [ ] [MANUALLY] Check that the installed app on the Mac still opens as a window
  - [ ] [MANUALLY] Reinstall on the phone, or wait for Chrome to refresh the installed app

- [ ] **Final device checks** [MANUALLY]: phone test passed 2026-11-01
  - [ ] Install on a computer, link a folder, try the media keys
  - [ ] Reconnect tap in the installed app after a restart

## TODO

### Delivery: raised 2026-11-01

- [ ] **Hosting**: `dist/` leaves the tailnet; it is plain static files #platform
  - [x] [WE] `make publish`: generated files, every suite, `dist/`, tailnet copy
  - [x] [MANUALLY] Public on Cloudflare Pages, no gate (Alexander, 2026-11-01); decision record `OPS-Sage/docs/decisions/2026-10-11-pages-for-sites.md`
  - [x] Address: `mpod.startr.cloud` (Alexander, 2026-11-02); `cloudflare-startr-llc` sees only `startr.llc`, so it cannot deploy
  - [x] [MANUALLY] Token in `cloudflare-startr-cloud-pages-deploy`: active, Pages works, all six Startr zones (2026-11-02)
  - [x] [MANUALLY] Its `account-id` is the account that owns `startr.cloud`; Pages answers through it
  - [ ] [MANUALLY] Keep `cloudflare-sage-is-pages-deploy` for a sage.is Pages token (Alexander's plan)
  - [ ] [WE] After the first deploy, attach `mpod.startr.cloud` to the Pages project and add its DNS record
  - [x] [WE] `make deploy`: stops early on an empty or unresolved token or a dirty tree, checks, creates the project if needed, uploads `dist/`; `master` is production, other branches get a preview; Netlify and nginx take the same folder
  - [ ] [MANUALLY] Release this batch to `master` with git-flow
  - [ ] [WE] First `make deploy` from `master`, then retire the tailnet page and `make publish`
  - [x] [WE] `_headers`: `X-Robots-Tag: noindex` until Alexander announces it
  - [ ] [MANUALLY] Reinstall from the new address and link folders again: a new origin starts empty

- [ ] **CI/CD**: runs on the cluster; the card lives in `OPS-Sage/TODO.md` #platform
  - [ ] [WE] `make check` becomes this repo's job once the runner exists; it needs headless Chrome
  - [ ] [WE] Until then, a pre-commit hook running `node dev/build-sw.mjs --check`

- [ ] **Own static hosting**: revisit when AI-UI's Workshop apps tab is built #platform
  - [ ] Its planned frame has no same origin, so a service worker and folder access need a real origin

- [ ] **TodoScope alignment**: the board follows the convention (2026-11-02) #platform
  - [x] [WE] Board restructured; `dist` added to `.todoscope-exclude.csv`
  - [ ] [MANUALLY] Scan the repo in TodoScope and check the columns
  - [ ] [WE] Move any inline tags the scan finds to `TODO:`, `FIXME:` or `BUG:`

### Next version: chosen 2026-10-31

- [ ] **Listening features**: built from `docs/spec/36`
  - [ ] Play counts, Recently Added, Most Played, Recently Played
  - [ ] On-The-Go playlists

- [ ] **Sound**: each one can be turned on and off #audio
  - [ ] Volume levelling
  - [ ] Gapless playback
  - [ ] Sleep timer

- [ ] **Extras menu** #device
  - [ ] Clock
  - [ ] Stopwatch
  - [ ] Brick with a saved high score

- [ ] **Spoken audio and ratings** #library
  - [ ] Podcasts and audiobooks: position per file, no shuffle, playback speed
  - [ ] Star ratings and a Top Rated list, stored in mPod

- [ ] **Self-hosted library**: stream from a music server #library
  - [ ] Navidrome
  - [ ] Jellyfin

- [ ] **System integration** #platform
  - [ ] Open with mPod for audio files and `.m3u`
  - [ ] Mini player window on desktop
  - [ ] Backup and restore for playlists, ratings and stats

## Backlog

- [ ] **Device ideas** #device
  - [ ] LCD grid setting, as tested on the font page
  - [ ] Letter jump in long lists
  - [ ] Hold switch: set aside by Alexander, 2026-11-01
  - [ ] Colour skins and other device styles; steer OLED phones to black styles (Alexander, 2026-11-02)
  - [ ] Selection bar running to the display edge

- [ ] **Library and system ideas**
  - [ ] Folder browsing that follows the disk layout
  - [ ] Chromecast
  - [ ] Apple Lossless: Chrome 156 refuses it (measured 2026-11-02), so those tracks count under Skipped; needs a decoder in the app

- [ ] **Review leftovers**: from the code review of 2026-11-02; none block a release
  - [ ] Calendar: Windows zone names from Outlook stay local time; needs a name table or `VTIMEZONE`
  - [ ] Scans: a file that never answers stalls later scans until reload; needs a timeout
  - [ ] Tags: a multi-value field keeps its first value only, so a second composer gets no row
  - [ ] Browse: a list left open rebuilds its index on every import batch
  - [ ] Wheel: a press landing as a slide ends can lose pointer capture and drop that drag; seen once in a test, untested on a device
  - [ ] Install: `sw.js` stores what arrives; a per-file hash would catch a mixed rollout

- [ ] **Clean-up if it grows**: the release risk is accepted, so none of these block anything
  - [ ] Replace or clear the screen font (`docs/FONT.md`): our own file from a design, or a CleanRoom `font` kind
  - [ ] Re-derive `src/styles.js` to cut the CSS overlap
  - [ ] [MANUALLY] Trademark check on `mPod`
  - [ ] [MANUALLY] Lawyer review of the look and the method

## Bugs

_No known bugs. Use `BUG:` inline tags to flag defects in source._

## Done

- [x] **Manual batch**: chosen 2026-11-01 from Apple's 2002 guide; specs 36 to 41, review rulings 43 to 46; live as `c299b546`, committed as `f3c467b` (2026-11-02)
  - [x] One window at a time (`docs/spec/41`)
  - [x] Resume last track and position (`docs/spec/36`)
  - [x] Main menu: Browse, Extras, Shuffle Songs, About; Albums, Genres, Composers; Play on a highlighted list (`docs/spec/37`)
  - [x] Contacts and Calendar, each with its own folder (`docs/spec/38`)
  - [x] Power, real battery, Charging screen, Restart (`docs/spec/39`)
  - [x] Shuffle Albums, EQ, Contrast (`docs/spec/40`)
  - [x] Split `src/importer.js` by responsibility
  - [x] Two code reviews, each ruled into specs and rebuilt: 30 suites, 2,138 assertions
  - [x] Commit and push to `develop`, approved by Alexander
- [x] **Faster checks**: suites run 4 at a time; a full run takes about 13 minutes, against about 40 one at a time #platform
- [x] **Font suites**: `t11-font` tests ChicagoFLF; spec 31's drawn-font checks wait behind `DRAWN_FONT`; `make check` runs every suite
- [x] **Release risk accepted** (Alexander, 2026-11-01): font, CSS overlap, name and look ship as they are; a complaint means taking it down
- [x] **Stage 2**: remembered library, Reconnect, rescan, help screens, Brave fallback (`docs/spec/32`)
- [x] **Stage 3**: name, editable in Settings (`docs/spec/33`)
- [x] **Stage 4**: installable app, phone layout, touch, haptics, lock screen controls, art and seek bar (`docs/spec/34`, `docs/spec/35`)
- [x] **Stage 0**: folder survives restart and audio plays hidden, on Chrome on the Fold
- [x] **Stage 1**: repos created, app split out, 45 of 45 scenarios on the new layout
- [x] **About tells the truth**: Library size and the build's real version; a browser cannot read the disk (`docs/spec/34`)
