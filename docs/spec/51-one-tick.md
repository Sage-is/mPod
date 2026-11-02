# 51. One tick per press (our own addition)

Alexander's ruling, 2026-11-02, after trying 49 on the Fold4. Product page only. This wins over 49 where they differ.

- A press of any of the five buttons gives one tick as it goes down: `navigator.vibrate(10)`. Nothing comes as it goes up.
- While a finger is down, nothing else may vibrate, whether the press is short or a hold. On the Fold4 a tick sometimes came mid-hold, before release.
- A long press anywhere on the device must give the phone nothing to answer: no context menu, no text selection and no callout, from the first moment of the touch, not only once a hold has started. Android buzzes for its own long press.
- The wheel's 4 ms tick per step stays. A resting finger that drifts a little must not turn the wheel. Use a drift allowance large enough for a resting thumb on a phone, and say what you chose.

## Tests

Each rule fails first: each button held 2.5 s calls `vibrate` once, with 10; a quick tap calls it once; `contextmenu` on any part of the device is cancelled at once, with no hold running; a finger that drifts within the allowance during a hold turns nothing and ticks nothing.
