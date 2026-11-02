# 47. Full screen (our own addition)

The installed app asks for the whole screen. The manifest's `display` is `fullscreen`, so on a phone the system hides its status bar and navigation bar. A swipe from the top or bottom edge shows them for a moment.

- The device keeps clear of a camera cutout, as 34 says.
- Chrome on a desktop opens the installed app in its own window, as before.
- A tab is unchanged.
- An iPhone ignores this value.

The spec side made this change itself, because the manifest has nothing in the original to copy. `t14` checks the value.
