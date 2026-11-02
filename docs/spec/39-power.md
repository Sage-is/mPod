# 39. Power, battery and restart (our own addition)

Only without `catalogue-url`. The test page keeps its still, full battery, no Play hold, and no auto-off.

## Off

A new state in which the screen shows nothing but a solid `#111`. The device body stays visible.

**Entering:**

- Hold Play/Pause for 2,000 ms. On the ring, Space becomes a hold with this time; released earlier, it acts as a press. A focused Play/Pause button follows 04's keyboard rule for Menu.
- Auto-off: 2 minutes of no activity (04), with no track playing. It does not fire during Brick.

On entering, pause any track and keep its position. Stop the idle jump and backlight timers, and turn the backlight off.

**Waking:**

- Any button press, ring touch or key inside the device wakes it. That input only wakes: it does not act, and its click is swallowed as after a hold.
- The same screen, selection and paused track return. Backlight follows its setting.
- A Media Session action wakes the device and acts.

## Battery icon

Read `navigator.getBattery()`.

- Show `ceil(level × 4)` bars, updated on level and charging events.
- While charging below full, step the bars from 1 to 4 and round again, every 500 ms. With `prefers-reduced-motion: reduce`, show the level, still.
- A missing or refused API hides the icon. Never show a level we do not know.

A computer without a battery reports full and charging, so it shows four still bars.

## Charging screen

While off and charging, the screen shows the title `Charging` and a large drawn battery, animated like the icon. At full charge the title reads `Charged` and the battery is still. When charging stops, the screen returns to solid `#111`. Any press wakes the device as above.

Draw the battery with the screen's own ink colours.

## Restart

Hold Play/Pause and Menu together for 5,000 ms. On the ring, this is Space and Escape together. Two touches on the wheel must work, so a second press must not cancel the first hold.

- The timer starts when both are down. From then on, neither single hold fires. A single hold that already fired stands.
- Releasing early does nothing, and neither click runs.
- It also works while off, and presses that wake count towards it.
- When it fires: send a waiting service worker a `skipWaiting` message, wait for the new worker up to 1,000 ms, then reload the page.

`sw.js` gains the message listener. On-start updates in 34 otherwise stand. No stored data changes. Resume in 36 brings the track back.

## Tests

Use a stubbed battery object for level, charging, full, and missing. Cover both ways into off, waking with no action, the media action, Charging and Charged, two-pointer restart, early release, and restart with a waiting worker.
