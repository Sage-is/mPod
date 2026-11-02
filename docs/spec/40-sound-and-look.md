# 40. Shuffle Albums, EQ and Contrast (our own addition)

Only without `catalogue-url`. On the test page, stored values for these fields read as defaults, and the audio graph stays as in 17.

## Shuffle Albums

`shuffle` gains `albums`. The row cycles `Off`, `Songs`, `Albums`.

Order: the current song, then the rest of its album in track order, then every other album in random order, each in track order, then the earlier songs of the first album. With no start song, begin at the first song of a random album. An album is the pair in 37. The icon is the same as for `Songs`.

## EQ

Field `eq`, default `off`, shown as row `EQ` with the preset name as its value. It opens a choice list like Backlight Timer: `Off`, then the presets below in order. It applies live, and Reset All Settings restores it.

Graph: fade gain → preamp → ten filters → master gain. Clicks still bypass it all. Filters are peaking, Q 1.4, with low shelf on the lowest band and high shelf on the highest. Move each gain with `setTargetAtTime`, time constant 0.02 s. `Off` is every gain at 0 dB. Preamp is minus the highest band gain when that is positive, otherwise 0 dB, so a boost cannot clip.

Our own curves, in dB:

| Preset | 31 | 62 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Acoustic | 4 | 4 | 3 | 1 | 1 | 1 | 2 | 3 | 3 | 2 |
| Bass Booster | 5 | 4 | 3 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| Bass Reducer | -5 | -4 | -3 | -2 | -1 | 0 | 0 | 0 | 0 | 0 |
| Classical | 4 | 3 | 2 | 1 | -1 | -1 | 0 | 2 | 3 | 3 |
| Dance | 4 | 6 | 4 | 0 | 1 | 2 | 4 | 4 | 3 | 0 |
| Deep | 4 | 3 | 1 | 1 | 2 | 1 | -1 | -2 | -3 | -4 |
| Electronic | 4 | 3 | 1 | 0 | -2 | 2 | 1 | 1 | 3 | 4 |
| Hip-Hop | 5 | 4 | 1 | 3 | -1 | -1 | 1 | -1 | 2 | 3 |
| Jazz | 3 | 2 | 1 | 2 | -1 | -1 | 0 | 1 | 2 | 3 |
| Latin | 4 | 3 | 0 | 0 | -1 | -1 | -1 | 0 | 3 | 4 |
| Loudness | 5 | 4 | 0 | 0 | -2 | 0 | -1 | -4 | 4 | 1 |
| Lounge | -3 | -2 | -1 | 1 | 3 | 2 | 0 | -2 | 2 | 1 |
| Piano | 2 | 1 | 0 | 2 | 3 | 1 | 3 | 4 | 3 | 3 |
| Pop | -1 | -1 | 0 | 2 | 4 | 4 | 2 | 0 | -1 | -2 |
| R&B | 3 | 6 | 5 | 1 | -2 | -1 | 2 | 2 | 3 | 3 |
| Rock | 4 | 3 | 2 | 1 | -1 | -1 | 0 | 2 | 3 | 4 |
| Small Speakers | 5 | 4 | 3 | 2 | 1 | 0 | -1 | -2 | -3 | -4 |
| Spoken Word | -4 | -1 | 0 | 1 | 3 | 4 | 4 | 3 | 1 | -2 |
| Treble Booster | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 3 | 4 | 5 |
| Treble Reducer | 0 | 0 | 0 | 0 | 0 | -1 | -2 | -3 | -4 | -5 |
| Vocal Booster | -2 | -3 | -3 | 1 | 4 | 4 | 3 | 1 | 0 | -2 |

## Contrast

Field `contrast`, default `normal`, shown as row `Contrast`. It opens a choice list: `Lightest`, `Light`, `Normal`, `Dark`, `Darkest`, for CSS contrast 0.7, 0.85, 1, 1.2 and 1.4. Apply it to the screen's content, not its backlight layers. Reset All Settings restores it.

## Tests

Check the album order, live EQ changes through the filter gains, the preamp, that `Off` is flat, reading the fields on the test page, and persistence of all three.
