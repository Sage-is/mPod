# 38. Extras: Contacts and Calendar (our own addition)

Only without `catalogue-url`. `Extras` opens `Contacts` and `Calendar`. Nothing here uses the network.

## Folders

Each has one folder of its own, picked here and separate from music.

- No folder yet: the lines `No contacts yet` or `No events yet`, and one selectable row, `Add Contacts Folder` or `Add Calendar Folder`, which opens the picker in read mode inside the press. Read every depth.
- Without `showDirectoryPicker`, use the file input from 29. There is then no rescan, and the Add row stays.
- Parse once and store the result, with the handle, in the `mpod` database. The screen then opens at once, offline, with no permission. Start never reads these folders.
- The last row of each list is `Contacts Folder` or `Calendar Folder`. It offers `Rescan`, `Remove` and `Cancel`, with `Cancel` preselected, plus an info row `Skipped` when a file failed. `Rescan` asks for permission inside the press. `Remove` forgets the handle and the stored data, and never touches disk.
- `Clear Imported` and `Reset All Settings` leave these alone.
- Limits: 1,000 contacts, 2,000 events, 5 MB per file. Past a limit, the rest count as skipped.

## Contacts

Read `.vcf` in any case, with any number of cards per file: vCard 2.1, 3.0 and 4.0. Unfold lines, and decode quoted-printable, UTF-8 and backslash escapes. Read `FN`, `N`, `ORG`, `TEL`, `EMAIL` and `ADR`. Ignore photos.

The list is sorted by family name, then given name. A row shows the full name, or else the organisation. A card with neither is skipped.

Selecting one opens a list titled with the name: one row per value, in the order organisation, phones, emails, addresses, with address parts joined by commas. The selected row scrolls as a marquee (10). The rows do nothing when selected.

## Calendar

Read `.ics` in any case. For each `VEVENT`, read `SUMMARY`, `DTSTART`, `DTEND`, `LOCATION`, `RRULE` and `EXDATE`. Unfold lines and remove escapes.

- `VALUE=DATE` is an all-day event.
- A time ending in `Z` converts to local time. A known `TZID` converts through `Intl`. Anything else is taken as local.
- `RRULE` supports `FREQ` of daily, weekly, monthly and yearly, with `INTERVAL`, `COUNT`, `UNTIL`, and `BYDAY` when weekly. Any other rule keeps only the first occurrence.
- Expand when the screen opens, never more than 60 days ahead.

The list shows events from the start of today for 60 days, by time, then by title. A row shows the title, with a short local date as its value. Nothing ahead: the line `No upcoming events`, above the folder row.

Selecting one opens a list: title, full date, time range or `All Day`, and location if there is one. Rows behave as in Contacts.

## Tests

Add a Node suite with cards and events in each format above, including folded lines, quoted-printable, a repeating event with an exclusion, and a broken file. Add fake handles through the seam in 32 for pick, rescan, remove and the file input path.
