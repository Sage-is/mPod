# 49. Haptics (our own addition)

Alexander's ruling, 2026-11-02. Product page only, where `navigator.vibrate` exists. The iPod had no vibration motor, so these stand in for its mechanical switches and its speaker tick.

## Buttons

Menu, Back, Forward, Play/Pause and the centre button feel like switches. Each press gives `navigator.vibrate(8)` as it goes down and `navigator.vibrate(4)` as it comes up. All five feel the same. This holds when the device is off, so the press that wakes it ticks too. The wheel's limit of 25 per second does not drop a button's ticks.

## Wheel

The tick from 34 stays at 4 ms per step, at most 25 per second. A tick goes with a move: at a list's end, where nothing moves, there is none.

## Nothing else

A hold that takes (Play to turn off, the restart chord, Select on About for Brick) adds no pulse; its press still ticks down and up. Brick adds none.

## Setting

Clicker turns all of this on and off, as it does the wheel's tick today.

## Tests

Each rule gets a test that fails first, with a stubbed `navigator.vibrate`: the down and up lengths for each button, none with Clicker off, the wheel's 4 ms per move and none at a list's end, and no extra pulse when a hold takes.
