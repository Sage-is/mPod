# 07. Views and row kinds

The device keeps a stack of screens, starting with Root. Each entry has a screen key, and optionally a context id (playlist or artist) and a title override. Rows are rebuilt from catalogue, settings and playback whenever they change.

## View table

| Screen | Kind | Title | Rows |
| --- | --- | --- | --- |
| Root | list | `Pod` | Playlists, Artists, Songs, Settings; plus Now Playing while the queue is non-empty |
| Settings | list | Settings | About, Shuffle, Repeat, Backlight Timer, Clicker, Reset All Settings |
| About | list | About | below |
| Backlight Timer | list | Backlight Timer | Off, 1 second, 2 seconds, 3 seconds, 5 seconds, Always On |
| Reset All Settings | list | Reset All Settings | Cancel, Reset |
| Playlists | list | Playlists | one per playlist, or No Music |
| Artists | list | Artists | All, then one per artist, or No Music |
| Songs | list | Songs, or All Songs when reached by All | all songs, or No Music |
| Playlist tracks | list | playlist name | its songs, or No Music |
| Artist tracks | list | artist name | its songs, or No Music |
| Now Playing | now-playing | Now Playing | none |
| Brick | game | Brick | none |

All appears only when there is at least one artist and at least one song.

Scroll target: list kind is `list`, Now Playing is `volume`, game is `brick`, overridden by `seek` while scrubbing.

Idle jump is blocked on Now Playing and Brick (21).

## About rows

All are informational: no highlight, no arrow.

| Title | Value |
| --- | --- |
| `Pod` | none, centred |
| Songs | song count, locale-formatted |
| Capacity | 9.2 in gigabytes, locale unit format, short: `9.2 GB` |
| Available | 4.5 likewise: `4.5 GB` |
| Version | `2644.1.0` |

Verified live with 48 songs: `48`, `9.2 GB`, `4.5 GB`, `2644.1.0`.

## Row kinds

| Kind | Arrow | Value | Select does |
| --- | --- | --- | --- |
| navigate | yes | none | push target screen |
| inline toggle | no | current option | advance to next option, wrapping, and stay |
| choice | no | none | set backlight mode, mark as chosen (15), pop |
| cancel | no | none | pop |
| reset | no | none | reset everything (15), pop |
| play | no | none | see 08 |
| info | no | maybe | nothing |

Which rows are which:

- Root rows, Settings' About, Backlight Timer and Reset All Settings, Artists rows and Playlists rows: navigate.
- Shuffle, Repeat, Clicker: inline toggle.
- Backlight Timer rows: choice.
- Song rows: play.
- About rows and No Music: info. No Music is centred.

Toggle cycles, with their shown values:

- Shuffle: Off → Songs → Off.
- Repeat: Off → One → All → Off.
- Clicker: On → Off → On.

## Slides

Push slides the new screen in from the right, pop from the left (27). The title bar changes at once and does not slide. Each push or pop replaces the body with a new instance, so scroll position and marquee state start fresh.

## Unknown titles

A playlist or artist that vanished from the catalogue falls back to the title Playlists or Artists.
