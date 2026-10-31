# 22. Accessibility

## Device

- Wheel has `dir="ltr"` always; it never mirrors.
- Ring: `aria-hidden`, tabindex -1.
- Button names: Menu, Back, Forward, Select. The bottom button reads Pause while playing or starting, else Play.
- Button glyphs are `aria-hidden`.
- Back and Forward report `aria-disabled` while scrubbing or inert. Others while inert. Inert buttons have tabindex -1.

## Title bar

Has id, used as label for the screen below. Battery and play icons are `aria-hidden`.

## List

- `role="listbox"`, tabindex 0, labelled by the title bar.
- `aria-activedescendant` names the selected row. Row ids combine the navigation counter and the row index, so each screen instance has unique ids.
- Rows `role="option"` with `aria-selected`. Info rows have neither.
- Chevrons are `aria-hidden`.

## Now Playing

- `role="group"`, tabindex 0, labelled by the title bar.
- Hidden text after the position line, when a mode is on:
  - shuffle only: `Shuffle on`
  - repeat one: `Repeat one`
  - repeat all: `Repeat all`
  - both: `Shuffle on, Repeat one`, `Shuffle on, Repeat all`
- Progress bar and its labels are `aria-hidden`; screen readers use the inputs.
- Song title link is keyboard reachable.

## Range inputs

Invisible (opacity 0), covering their bars, tabindex 0. Focus shows a 2 px currentColor outline, offset 2 px, on the bar. They work while the screen ignores pointers because keyboard focus still reaches them.

**Playback Progress:** min 0, max duration, step default, value floor(displayed time), or 0 with unknown duration. Disabled with no loaded track. `aria-valuetext` in words, such as `1 minute and 5 seconds`, or `0 seconds`. Units are hour, minute, second, zero parts omitted, joined by locale list format, conjunction, long style.

**Volume:** min 0, max 100, value volume. `aria-valuetext` in locale percent format, such as `50%`.

Their behaviour is in 14.

## Status

- Live status text: see 21.
- Brick status text has `role="status"`. Canvas is `aria-hidden`.

## User preferences

- `prefers-reduced-motion: reduce`: no screen slides, strip slide or marquee. 09 to 13 and 27 give the details.
- `prefers-contrast: more`:
  - screen ink black
  - scrim #eed, normal blend
  - selected row black with #eed text; lit tint #f0f0e6
  - wheel glyphs and dividers #3a3a3a
  - wheel gets a 2 px #3a3a3a outline
- `prefers-color-scheme: dark`: darker device shading (24, 26), screen opacity 0.85, and default backlight `always_on`.
- Forced focus: selected row `:focus-visible` outline is 2 px currentColor, inset 2 px.

## Selection and callouts

All device text is unselectable, and the touch callout is off. Set the tap highlight colour to transparent once on the host, so no element inside flashes on touch. Keyboard focus styles stay. Host `text-size-adjust` is fixed at 100%.

## Scaling

Container queries handle small hosts (24).
