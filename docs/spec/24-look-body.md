# 24. Device body, scale and type

The look reproduces a white-fronted first-generation pocket player with a mirror-steel edge. No logo, no wordmark.

## Host and scaling

- Host is `display: block` and an inline-size container. Keep this exact: in the test host (a flex item) containment collapses its width to 0 and the device overflows centred. Verified live: host width 0, device at scale 0.75, wheel 262.5 px.
- Layers: a full-width flex wrapper centring a 415 px wide box, holding a scaled layer with its origin at top centre.
- Scale by container width: 1 at 440 px and over; 0.9 under 440; 0.8 under 400; 0.75 under 360. Use the CSS `scale` property, transition 0.25 s ease-in-out. Layout height does not shrink.
- `color-scheme: light dark`.

## Body

415 × 692 px, 1 px transparent border, corner radius 38 px. Contents: screen, then wheel.

Fill: a linear gradient at 42°, rgba(232,232,232,0.96) at 0 to white at 149%.

Reflection: `-webkit-box-reflect` below, 4 px gap, mask transparent to 50%, rgba(0,0,0,0.15) at 100%.

Box shadows (x, y, blur, spread):

| Inset? | Geometry | Light | Dark |
| --- | --- | --- | --- |
| inset | 0 -1 3 2 | rgba(168,168,168,0.67) | #2d2d2dab |
| inset | -1 0 2 5 | white | #9e9e9e |
| outer | -1 1 0 3 | rgba(146,146,146,0.47) | #00000078 |
| outer | 2 1 0 3 | #e7e7e7 | #777 |

Dark fill stops: #d4d4d4f5, #fefefe.

## Steel rim overlays

Both cover the body, 6 px bigger overall (offset -3 px), radius 38 px, no pointer events.

**Sheen**, on top: two gradients, size 181% × 200%, position 0 50%, no repeat. At 249°: white alpha 0 at 0, 0.08 from 40% to 50%, 0 from 52% to 76%. At 257°: alpha 0 at 0, 0.04 from 42% to 55%, 0 from 58% to 76%.

**Rim**, under it, masked to a 6 px frame by padding and mask exclusion. Layers, top first, conic ones starting at -23°:

1. Conic highlights, white 0.4: rising to full at 1%, out by 2.5%; 5.5% to 6.5%, in from 5%, out by 8%; 10% to 12%, in from 9%, out by 13%.
2. Conic shade, black: 0.3 to 10%, 0.1 at 20%, 0.45 at 57%, 0.2 from 70% to the end.
3. Two flat white 0.3 washes.

Add an inset ring of 3 px white at 0.5.

## Around the body

On the scaled layer:

- **Floor shadow:** 200 px tall, just below the body, full width, radius 38 px at top only, opacity 0.3, 1 px blur. Vertical gradient: #010101 at 0, rgba(87,87,87,0.89) at 5%, rgba(72,72,72,0.41) at 17%, transparent at 50%. Top edge shadow 0 -1 1 0.5 rgb(112,112,112).
- **Dark edge:** 2 px bigger than the body all round, radius 38 px, gradient at 249° from transparent at 79% to black at 84%, size 181% × 200%, position 0 50%, no pointer events.

## Screen type

The original embeds a bitmap-style UI face. Do not embed one.

Register, with `document.fonts.add` because shadow-DOM font rules are not honoured, a face called `PodScreen`, source `local("Krungthep")`, display block, size-adjust 79.5%, ascent-override 94.1%, descent-override 27.7%.

Family stack: `PodScreen, system-ui, sans-serif`. Register once per page. Log load failures and go on.
