# 16. Backlight

## Modes

| Mode | Row | Lit time after activity |
| --- | --- | --- |
| `off` | Off | none |
| `1sec` | 1 second | 1,000 ms |
| `2sec` | 2 seconds | 2,000 ms |
| `3sec` | 3 seconds | 3,000 ms |
| `5sec` | 5 seconds | 5,000 ms |
| `always_on` | Always On | always |

## State

- `lit`: starts true only for `always_on`.
- `litBefore`: the lit value seen by the latest activity. Starts equal to `lit`.
- `forcedOn`, `forcedOff`: start false.
- One pending sleep timer.

## On activity

Activity means the events in 04, each wheel scroll event, each keyboard scroll step, and each effective hold-seek fire.

1. litBefore = lit.
2. If forcedOn: stop here.
3. If forcedOff: clear it, and set lit to true only when the mode is `always_on`.
4. If the mode is timed: cancel the timer, set lit true, start the timer. On expiry lit becomes false.

Modes `off` and `always_on` do nothing at step 4.

## Toggle, from a Menu hold or an Escape hold

1. Cancel the timer.
2. forcedOn = not litBefore.
3. forcedOff = litBefore.
4. litBefore = forcedOn.
5. lit = forcedOn.

Since the press itself was activity, litBefore holds the state from before the press. A timed mode that had gone dark gets relit by the press, and the toggle then keeps it on.

## On mode change

Clear forcedOn and forcedOff, cancel the timer. Then `always_on` sets lit true, `off` sets lit false, and a timed mode acts like one activity.

## Resulting behaviour

| Before pressing | Menu hold | Further activity |
| --- | --- | --- |
| mode off, dark | lit | stays lit; activity does not end it |
| that state, hold again | dark | stays dark, since the mode is off |
| timed, asleep | lit, no timer | stays lit until the next hold |
| that state, hold again | dark | relights with the normal timer |
| timed, awake | dark | relights with the normal timer |
| always on | dark | relights |

Verified live: after choosing 3 seconds, the screen is dark after 3.4 s and a tiny rotation relights it. The Menu hold from dark stays lit past 3.5 s. A second hold, after activity, goes dark.

## Host override

Attribute or property `backlit`: the string `"false"` forces dark, any other value forces lit, absent uses the logic above.

`debugState().backlit` reports the effective look.

The look itself is in 25.
