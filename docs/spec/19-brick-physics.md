# 19. Brick physics

Coordinates are logical cells, floats, origin top left, y down. A simulator written only from these rules matched the live game on the five setups at the end: same final score, same duration to within polling error.

## Constants

| Item | Value |
| --- | --- |
| Field | 148 × 101 |
| Paddle | 30 × 4, top edge fixed at y = 97, left edge at paddleX, start 59 |
| Ball half-size r | 1.5 (a 3 × 3 square, position is its centre) |
| Bricks | 12 per row, 10 × 4 |
| Brick origin | (3 + 12·col, 3 + 8·row) |
| Serve point | x = 1.5, y = 50.5 |
| Serve velocity | dx = 1.7, dy = 1.7 |
| Base speed S | hypot(1.7, 1.7) ≈ 2.40416 |

Bricks are indexed row by row, left to right, top row first.

## One tick, in order

1. If serve countdown > 0: subtract 1; the ball is in play exactly when it reaches 0.
2. If not in play, stop.
3. Note `wasAbove`: ball y + r < 97.
4. Move: x += dx, y += dy.
5. Side walls: if (x ≤ r and dx < 0) or (x ≥ 148 − r and dx > 0), negate dx.
6. Ceiling: if y ≤ r and dy < 0, negate dy.
7. If y ≥ 101: the ball is lost (18). Stop this tick.
8. Paddle: if dy > 0 and wasAbove and y + r ≥ 97 and x + r ≥ paddleX and x − r ≤ paddleX + 30, bounce.
9. Bricks: run the brick check. If a brick was hit and all are now gone, level up (18).

Positions are not corrected after a bounce.

## Paddle bounce

Let a = (x − (paddleX + 15)) ÷ 15, clamped to -1 to 1.

- speed v = S × (1 + 0.25 × |a|)
- u = 0.8 × a, m = hypot(u, 1)
- dx = v × u ÷ m
- dy = −v ÷ m

## Brick check

Test live bricks in index order. The first that yields a hit is destroyed, and the check ends: at most one brick per tick. Score +1. A "face" hit negates dy; a "side" hit negates dx.

For brick B at (bx, by), with sign of dx as s, its incoming neighbour is the brick at index i − s:

1. Skip if destroyed, or boxes do not overlap. They fail to overlap if x + r < bx, or x − r > bx + 10, or y + r < by, or y − r > by + 4.
2. px = x + r − bx when dx > 0, else bx + 10 − x + r.
3. py = y + r − by when dy > 0, else by + 4 − y + r.
4. `blocked`: the neighbour is in the same row, exists, and is live. Same row compares floor(index ÷ 12).
5. If not blocked and px × |dy| < py × |dx|, it is a side candidate: a side hit if (bx + 5 − x) × dx > 0, otherwise no hit on this brick.
6. Otherwise it is a face candidate: a face hit if (by + 2 − y) × dy > 0, otherwise no hit.

If dx = 0 then s = 0 and the "neighbour" is the brick itself, which then blocks while live.

Do not change the evaluation order, and use plain double-precision arithmetic.

## Test vectors

Launch after n quick Left taps, with no other input. Each tap moves 0.035 of travel, so paddleX = 59 − 4.13 n.

| n | Final score | Time from launch to game over |
| --- | --- | --- |
| 0 | 0 | 5.52 s |
| 3 | 7 | 20.20 s |
| 4 | 6 | 24.84 s |
| 6 | 4 | 16.92 s |
| 9 | 5 | 14.12 s |
| 10 | 4 | 13.88 s |

With n = 0 the ball falls past the paddle at tick 30 on each serve. A ball lost at level 1 then waits 25 ticks. All verified against the live game.
