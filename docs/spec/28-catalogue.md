# 28. Catalogue format

A single JSON file fetched from `catalogue-url`. The test fixture is at `fixtures/catalogue.json`, and you may read it.

## Top level

| Field | Type | Use |
| --- | --- | --- |
| `schemaVersion` | number | must equal 3, else error state (21) |
| `storefront` | string | ignored |
| `language` | string | ignored by the UI |
| `songs` | array | required |
| `artists` | array | required |
| `playlists` | array | required |

## Song

| Field | Use |
| --- | --- |
| `id` | row id, identity for queue match and memory |
| `name` | row title and Now Playing title |
| `artistName` | Now Playing artist |
| `albumName` | Now Playing album |
| `previewUrl` | audio source |
| `url` | if present, the Now Playing title is a link |
| `playParams.id` | track id for the player, falling back to `id` |
| `durationInMillis` | ignored; duration comes from the audio element |
| `artistIds` | ignored |
| `playParams.kind` | ignored |

The audio server must allow CORS: elements use `crossOrigin="anonymous"`, and go through Web Audio. It should honour byte ranges, for seeking. The test server does.

## Artist

| Field | Use |
| --- | --- |
| `id` | context id, row id |
| `name` | row title and screen title |
| `songIds` | ordered song ids |

## Playlist

| Field | Use |
| --- | --- |
| `id` | context id, row id |
| `name` | row title and screen title |
| `songIds` | ordered song ids |
| `url`, `trackCount`, `curatorName` | ignored |

## Rules

- Lists show catalogue order, unsorted.
- A `songIds` entry with no matching song is dropped silently.
- Look songs up by id, cached per catalogue object.
- The Artists list and Songs list are unrelated: All opens all songs in `songs` order, under the title `All Songs`.

## Fixture facts

48 songs, 12 artists with 4 songs each, 4 playlists with 12 songs each. Six 30 s audio tones at 8 kHz, reused. Five songs carry a long title for marquee testing, the first being `Paper Rivers 00 (Extended Fixture Mix For Marquee Testing)`.
