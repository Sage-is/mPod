# 50. The wheel only turns (our own addition)

Alexander's ruling, 2026-11-02. Product page only. On the 1G and 2G iPod the wheel could not be pressed: it only turned.

- A touch on the ring never presses a button, never holds one and never joins the restart chord. If it moves, it turns the wheel. If it does not, it does nothing.
- The four outer buttons and Select are pressed only on their own areas, by touch as by mouse. This replaces the still touch on the ring that pressed the wedge under it, which was a reading of 34's 44 px rule.
- A touch that starts on an outer button and moves still turns the wheel, as 34 says.
- 49 follows from this: a touch on the ring gives no switch tick. Its turn gives only the wheel's 4 ms ticks.
- Keys on a focused ring stay as they are, for keyboard use.

## Tests

Each rule gets a test that fails first: a still touch on the ring presses nothing and ticks nothing; a turn that starts on the ring has no 8 ms tick; a touch on each outer button presses it and ticks down and up; Play held on its own button still turns the device off; the restart chord works with two touches on the Menu and Play buttons.
