# 46. Second review: library and Extras (our own addition)

With 45, this wins over every earlier spec, on the product page only. The Library section applies to both pages.

## Library

- A read error on any read of a file, the first or a later one, rejects `readTags`. Only a damaged tag yields no tags. 44's rule then leaves the record due, so good tags are never written over.
- A link is tied to the folder it matches when it is asked, not when its turn comes. If Remove has taken that folder by then, the link ends.
- Every way out of a link leaves the scan count right. A rejected `isSameEntry` counts as no match.
- Clear reaches the store at once. It does not wait for playback.
- A track that has left the library writes nothing more. A late duration is dropped, and a late failure leaves no mark.
- Remove deletes the folder, its tracks and its lists in one write.
- A walk that has been stopped counts nothing more, at any depth.
- A changed file is not a pure reread, so 44's batches show it. Decide this before the record is updated.

## Skipped marks

A mark lasts as long as its cause.

- Removing a folder removes all its marks, `capped` included.
- A scan that finishes replaces that folder's marks, `capped` included, with what it found. A scan that stops early changes none.
- A file imported again clears its own marks.
- A track that opens clears every mark of its own, not only the `play` one.

## Extras files

- A read in which every file found was skipped keeps the stored data, and stores the new `Skipped` count. With nothing stored, it records the folder as 44 says.
- Each kind has its own generation, so removing one does not end a read of the other.
- A UTF-8 byte order mark is dropped by both decodes, and at the start of any line, so joined files lose no card.

## Calendar

- An all-day event's length is a number of days. Each occurrence ends that many midnights after its own start, so a clock change cannot move its last day.
- The weeks and days of a `DURATION` are calendar days. Its hours, minutes and seconds are exact. A timed `DTEND` stays an exact length.
- `EXDATE` and `RECURRENCE-ID` apply to the first occurrence of any event: one with no rule, or one whose rule keeps only its first occurrence.
- A rule that `COUNT` has run out leaves as one past its `UNTIL` does, before the 2,000 limit, and does not count as skipped.
- `BYMONTHDAY` with `BYDAY` counts as any other rule.

## Tests

Every rule here gets a test that fails first. Also:

- The relink tests read the scan count.
- A tag read fails on a later read, not only the first.
- The `and saving it` test fails if the save before the scan is removed.
- The date tests cross a clock change, with `TZ` set to a zone that has one.
