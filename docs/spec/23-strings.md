# 23. Strings, formats, localisation hooks

## Default English strings

Key names are yours to choose.

| Group | Strings |
| --- | --- |
| Root | `Playlists`, `Artists`, `Songs`, `Settings`, `Now Playing` |
| Lists | `All`, `All Songs`, `No Music` |
| Settings | `About`, `Shuffle`, `Repeat`, `Backlight Timer`, `Clicker`, `Reset All Settings` |
| Values | `Off`, `On`, `Songs`, `One`, `All` |
| Backlight | `Off`, `1 second`, `2 seconds`, `3 seconds`, `5 seconds`, `Always On` |
| Reset | `Cancel`, `Reset` |
| About | `Songs`, `Capacity`, `Available`, `Version` |
| Position | `{index} of {total}` |
| Modes | `Shuffle on`, `Repeat one`, `Repeat all`, `Shuffle on, Repeat one`, `Shuffle on, Repeat all` |
| Inputs | `Playback Progress`, `Volume` |
| Buttons | `Menu`, `Back`, `Forward`, `Play`, `Pause`, `Select` |
| Game | `Brick`, `GAME OVER`, `Press Center to Launch Ball` |
| Status | `Loading`, `Ready` |
| Error | `You are not connected to the internet` |

Fixed, never localised: `Pod` as root title and About's first row. Version `2644.1.0`.

The wheel's top label is lowercase `menu`, drawn in the glyph, not a string.

## Formatting

All numbers go through `Intl`.

- Position values, song count: plain number format.
- Sizes: unit style, unit gigabyte, default short display.
- Time: minutes with grouping off; seconds with minimum 2 integer digits.
- Range text: unit style with long display; `Intl.ListFormat` long conjunction.
- Volume text: percent style on volume ÷ 100.

Cache formatter objects by option set.

## Hooks

- `i18n` property: an optional host object with `t(key, params)`.
  - When it returns a truthy string, use it. On a falsy result or a throw, log any error and use the English default.
  - Keys missing from the defaults render as `**key**`, with a warning.
  - Placeholders in defaults are replaced by name. Unknown placeholders stay as written.
- `locale` property: `{storefront, language}`, default `{storefront: "us", language: "en-US"}`. A catalogue language is reported but does not change the UI.
- Formatting language: the `locale.language` when a host `i18n` is present, canonicalised with `Intl.getCanonicalLocales`, and en-US when invalid, with a warning. With no host `i18n`, always en-US.

Changing either rebuilds strings without resetting state.

## Right-to-left

Direction comes from the surrounding page. Not exercised live; read from the reference.

- Automatic direction on row titles, values, screen title, artist and album.
- Start and end insets flip: play icon, battery, chevron side.
- Slide direction flips (27). Now Playing strip direction flips (13).
- Left and Right on a list swap (05).
- Position line text aligns right; its order stays left-to-right.
- Bars, time labels, Brick header and the wheel never mirror.
- Slight colour tweaks on selected rows (09).
