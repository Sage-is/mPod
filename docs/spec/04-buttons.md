# 04. Buttons, hold and repeat

## Layout

Each outer button is a real `<button>` the size of the whole wheel, circular, clipped to a triangle from the wheel centre to two adjacent corners of its box. Hit areas are thus four 90° wedges split along the diagonals. The ring and Select cover their inner parts.

| Wedge | Button | Click | Hold |
| --- | --- | --- | --- |
| top | Menu | back one screen | backlight toggle (16) |
| left | Back | previous track (11) | seek backward (14) |
| right | Forward | next track (11) | seek forward (14) |
| bottom | Play/Pause | see 08 | none |
| centre | Select | activate (08) | on About only: opens Brick |

Back and Forward act from any screen. While scrubbing, both their click and their hold are dropped, and they report `aria-disabled` true.

While inert (21), actions are dropped, buttons get tabindex -1 and `aria-disabled`. Exception: the Menu hold still toggles the backlight.

## Hold timing

| Button | First fire | Repeat |
| --- | --- | --- |
| Menu | 1,000 ms | none |
| Back, Forward | 1,000 ms | every 500 ms while held |
| Select on About | 5,000 ms | none |
| Select elsewhere | no hold; plain click | none |

Verified live: 4,600 ms on About stays on About; 5,200 ms opens Brick.

## Hold rules

- Begins on a primary pointer's main-button press. Ignored if already held, or the hold is disabled.
- At press, release any implicit pointer capture, so the pointer leaving can be detected.
- Pointer up on the button: stop the timer. If the hold never fired, the browser's normal click runs the click action.
- Pointer leaving the button, or pointer cancel: abandon the hold.
- While held, suppress the context menu (long touch).
- After a hold has fired, swallow the next click on or containing that button. Catch it on `window` in the capture phase, stop it at once, prevent default. Any new pointer press anywhere clears this flag. This is why a hold on Select does not also launch Brick.
- Window blur cancels. So does the hold becoming disabled, such as Select when leaving About.

## Keyboard on a focused button

Menu, Back, Forward: Enter or Space acts like a pointer hold. Key down (not auto-repeat) starts the timer; key up before it fired performs the click; key up after does nothing. Prevent default on both. Blur cancels. Select takes no part: focused, it gets the browser's normal key click and no hold there. Play/Pause has no hold.

## Activity and audio unlock

A pointer down on the device body, and each click there, does two things: resumes the audio context if suspended, and counts as activity (16, 21). So does a key down inside the device, ignoring auto-repeat unless the key name starts with "Arrow". Listen for keys in the capture phase on the body.

## Touch and pen

No separate path; pointer events cover them. Outer buttons and Select use `touch-action: manipulation` with no tap highlight.

## Mouse wheel

Deliberate: the whole screen has `pointer-events: none`, so a mouse wheel over it scrolls the host page, never the list. There is no wheel-event handler. The song title link is the only part of the screen that takes pointer input (13).

Press feedback is in 26.
