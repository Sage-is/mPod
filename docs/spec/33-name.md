# 33. The device name (our own addition)

## Default

The product name is `mPod`. The root title shows the stored name, defaulting to `mPod`. This replaces `Pod` in 00.

`debugState().title` keeps returning `Pod` on the test page, so the comparison with the original stays valid: when the element has attribute `catalogue-url` and no stored name, the default is `Pod`.

## Setting

Settings gains row `Name`, with the current name as its value, directly above `About`. The value truncates like any other. It appears only with the `import` attribute.

Selecting it opens a screen titled `Name`:

- The current name, with a block cursor at the end.
- Below it, one highlighted letter from this ring: `A-Z`, `a-z`, `0-9`, space, `- . ' &`, then `Delete`, then `Done`.
- The wheel moves through the ring, wrapping, with clicks.
- Select adds the letter, or acts on `Delete` or `Done`.
- Menu leaves without saving.
- On desktop, typing, Backspace and Enter also work while this screen is open.
- A physical keyboard is not required. Do not open the phone's on-screen keyboard.

Names are 1 to 12 characters. Empty on `Done` restores the default. Surrounding spaces are trimmed.

## Storage

Store the name in the settings key. `Reset All Settings` restores the default.

The document title follows the name. The installed app's label stays `mPod`, because a manifest cannot change per person.
