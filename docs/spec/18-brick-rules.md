# 18. Brick rules

A hidden game. Holding Select for 5 s on About opens it (04), or Enter held on the ring (05). The top screen becomes Brick. Menu leaves and discards the game; coming back is a new game. Verified live. Nothing about it persists, and there is no high score.

## Screen

Playfield: 148 wide × 101 tall, in logical cells. The title bar, in place of a title, shows two equal columns, in a grid as wide as the bar less 110 px: balls left at the start, score at the end. Always left-to-right. Battery and play state remain.

## Start state

Level 1, score 0, 3 balls, paddle centred, ball waiting at the serve point, not in play. Status text `Press Center to Launch Ball`. The first serve never starts by itself.

## Select

- Game over: full reset to the start state.
- Otherwise: ball in play now, skipping any serve countdown.

A hold that opened Brick does not launch. Verified live.

## Status text

- Game over: `GAME OVER`.
- Ball in play, or a serve countdown running: empty.
- Otherwise: `Press Center to Launch Ball`.

Verified live: after game over, one Select shows the prompt with 3 balls and score 0; a second launches.

## Controls

- Paddle travel is 118 cells (148 − 30). `movePaddle(fraction)` adds fraction × 118 and clamps to 0 to 118. It is ignored after game over, but works before launch.
- **Wheel:** fraction = signed degrees ÷ 360, so one full turn crosses the field. Unaffected by detents. Clockwise moves right.
- **Keys on the ring:** Left and Right set a steer direction. On every tick, while steering and not paused, first call `movePaddle(direction × 0.035)`, or 4.13 cells. On key release, if no tick moved the paddle during that press, and the game is not paused, do one such move then. So a quick tap moves exactly 4.13 cells. Verified live.
- Up and Down are swallowed. Enter launches. Space still toggles music, and Back and Forward still skip; playback continues behind the game. Escape holds or presses Menu as usual.

## Scoring, balls, levels

- Each brick destroyed: +1. No other scoring. Score carries across levels.
- A ball falling past the bottom costs 1 ball. With balls left, serve again. At 0, game over; the ball stops.
- All bricks gone: level +1, a new wall, serve again. Balls are not refilled. Verified live with a bot: 24 bricks cleared at score 24, level 2 wall has 3 rows, balls unchanged, score continues.
- Wall rows = min(level + 1, 5): 2, 3, 4, 5, 5...

## Serve

Serving puts the ball back at the serve point with starting velocity, not in play, and sets a countdown of round(1000 ÷ tick ms) ticks. At level 1 that is 25 ticks. When it reaches 0, the ball goes into play with no press.

## Tick rate

Tick length in ms = 40 ÷ min(1 + 0.1 × (level − 1), 1.5).

| Level | 1 | 2 | 3 | 4 | 5 | 6 and up |
| --- | --- | --- | --- | --- | --- | --- |
| ms | 40 | 36.36 | 33.33 | 30.77 | 28.57 | 26.67 |

## Game loop

Driven by `requestAnimationFrame`. Add real frame time to an accumulator, capped at 10 ticks' worth. While it holds a tick: subtract one, and unless paused run steer then one physics tick. Physics order is in 19.

Run frames only while needed: ball in play, serve countdown, steering, a redraw pending, or ink still fading (20). The first frame after waking counts 0 ms.

**Paused:** while inert (21) no ticks run. The loop restarts when that ends.
