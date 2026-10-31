# 02. Wheel geometry and drag

Lengths are at 100% scale. Measure at run time from bounding rects, so scaling needs no special case.

## Geometry

- Wheel: 350 px circle.
- Ring: centred, diameter 276 px, or 78.857% of the wheel. It sits above the outer buttons.
- Select: centred, diameter 100 px, or 28.571% of the wheel. It sits above the ring.
- Outer button band: radius 138 to 175.
- A drag may start only at distance d from the centre with d ≤ ring radius and d ≥ 0.3623 × ring radius (that is 100/276, the Select radius). Add 1e-6 to the squared outer limit, so a point on the rim counts.

The ring element's bounding rect is the reference for centre and radius. Radius is half the smaller side.

## Drag life cycle

- Pointer down inside that area begins a drag and captures the pointer. Only one pointer drags at a time; other pointers are ignored until it ends.
- Starting a drag zeroes the detent accumulator (03) and marks the wheel as dragging. While dragging, the outer buttons and Select take no pointer events.
- Starting a drag also tells the scrub logic a drag is in progress (14), unless the device is still in its boot screen.
- Pointer up, pointer cancel or lost capture ends the drag and releases capture, clearing all per-drag state.
- The wheel and ring use `touch-action: none`. Text selection and the long-touch callout are disabled.

## From pointer moves to steps

For each move of the captured pointer, take its offset from the ring centre. Compare it with the previous offset. Then always store the new offset and event timestamp as the previous ones, even when the move is ignored below.

1. **Centre guard.** Compute the shortest distance from the centre to the straight segment between the previous and new offsets. If that is under 10% of the ring radius (13.8 px at full scale), ignore the move. This stops a fast swipe across the hub producing a wild jump.
2. **Angle change.** The angle of an offset is atan2(y, x) in degrees with y pointing down, so clockwise increases it. Delta is the shortest signed turn from old to new, wrapped into -180 to 180. Delta of 0 is ignored.
3. **Reversal resistance.** Keep a current direction and a reversal counter.
   - No direction yet, or delta has the current direction's sign: take that direction, zero the counter, and go on.
   - Otherwise add |delta| to the counter. If it is still under 8°, ignore this move. Once it reaches 8°, flip the direction, zero the counter, and go on with this move.
4. **Emit** a scroll event with: step (+1 clockwise, -1 anticlockwise), degrees = |delta|, speed = |delta| ÷ elapsed ms × 1000 in degrees per second, or 0 when elapsed is 0.

The resisted degrees during a reversal are lost, not banked.

## Verified live, in the 262.5 px harness size

| Rotate from rest | Rows moved |
| --- | --- |
| 14° | 0 |
| 16° | 1 |
| 32° | 2 |
| 44° | 2 |
| 46° | 3 |
| -32° at top of list | 0 |

Exact multiples of 15 are unstable under pointer rounding: 30° gave 2 and 60° gave 3. This is expected. Do not add rounding to hide it.
