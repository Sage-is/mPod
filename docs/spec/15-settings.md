# 15. Settings, persistence, reset

## Fields and defaults

| Field | Values | Default |
| --- | --- | --- |
| shuffle | `off`, `songs` | `off` |
| repeat | `off`, `one`, `all` | `off` |
| clicker | `on`, `off` | `on` |
| volume | number, 0 to 100 | 50 |
| backlight | `off`, `1sec`, `2sec`, `3sec`, `5sec`, `always_on` | by colour scheme |

Default backlight: `always_on` when `prefers-color-scheme: dark` matches, otherwise `off`. Verified live: headless Chrome here resolves to dark, and the device boots lit.

## Reading

At load, parse JSON from storage.

- Missing: use defaults.
- Parse failure: log, use defaults.
- Each field is validated alone. An invalid value falls back to its default. Volume must be a finite number in 0 to 100.
- Backlight counts only if a `backlightChosen` flag is true and the value is valid. Otherwise use the colour-scheme default.

## Writing

Write the whole object on every settings change, and once at startup:
`{shuffle, repeat, clicker, volume}`, plus `backlight` and `backlightChosen: true` only once the user has chosen.
Storage errors are logged, never thrown.

Until a backlight has been chosen, a change of colour scheme updates the mode live.

The settings store is a single shared object per page.

## Volume saving

Live volume is not written at each step. When the live percent differs from the last known one, start a 1,000 ms timer; on expiry, write it to settings. It restarts with each change, and flushes when the element disconnects. Verified live: `settings.volume` stays at 50 for a second while live volume reads 60.

Live volume at start of playback comes from the setting.

## Applying

- Select on an inline toggle changes the setting at once and writes it.
- Choosing a backlight mode sets the chosen flag, then writes.
- Shuffle and repeat apply live to any playing queue (11). Repeat internal values: none, one, all.

## Reset All Settings

Screen opens on Cancel (10), title `Reset All Settings`.

- Cancel: pop, nothing changes.
- Reset: pop, and:
  - clear the chosen flag,
  - set every field to its default, with backlight from the current colour scheme,
  - cancel any pending volume save,
  - set live volume to 50 at once.

Playback continues; shuffle and repeat changes reach it. Selection memory is not cleared, and on returning to Settings the Reset All Settings row stays selected. Verified live: after reset, values read Off, Off, On; backlight `always_on`; opening the screen again lands on Cancel.

## Persisting across sessions

On a new page load, shuffle, repeat, clicker, volume and the chosen backlight return. The queue does not.

## Debug state

`debugState().settings` reports the persisted object with `backlight` filled in from the effective mode.
