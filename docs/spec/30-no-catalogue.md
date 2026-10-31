# 30. Running with no catalogue (our own addition)

mPod ships with no music of its own. The catalogue attribute becomes optional and exists for tests.

## Behaviour

- Without `catalogue-url`, the element boots normally with an empty library. This is not an error: no offline overlay, no error state, no request.
- The boot sequence and its timing stay as they are.
- The root menu keeps its usual rows. Playlists, Artists and Songs show the existing No Music screen.
- About reports 0 songs.
- Import works exactly as in 29. With no catalogue, `Library` still toggles, and `All` and `Imported` show the same music.
- With `catalogue-url` set, nothing changes, including every load error in 21.

## Product page

`index.html` at the project root is the page people open. It fills the viewport, loads `src/pod-player.js`, and creates `<pod-player import>` with no catalogue attribute.

The test page stays separate and keeps passing `catalogue-url`.
