# 48. Off screen look (our own addition)

Alexander's ruling, 2026-11-02. On the product page this replaces the solid `#111` in 39.

## Off

Off, the screen is the unlit LCD: its own background tint and its reflection, as they look with the backlight off. Nothing is drawn on it: no title bar, no battery icon, no list and no text. The device body is unchanged.

## Charging and Charged

The `Charging` and `Charged` screens from 39 draw their title and battery on that same unlit LCD, in the screen's ink colours. When charging stops, the screen returns to the plain unlit LCD.

## Change

Going off and waking are instant. Nothing on the screen fades. The backlight turns off on entering, as 39 says.

## Tests

Each rule gets a test that fails first. Off and Charging show the screen's unlit background and its reflection, with no ink drawn while plain off. Waking shows the same screen as before, at once. Every device gets this look; colour styles come later.
