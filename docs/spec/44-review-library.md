# 44. Review rulings: library and Extras (our own addition)

With 43, this wins over every earlier spec, on the product page only. The Library section applies to both pages.

## Library

- `nextId` at start is the larger of the stored value and the highest number in any stored folder, list or track id. A kill during a scan must not reuse an id.
- If reading the stored library fails at start, write nothing for the life of that page. The library is session-only.
- Removing the last folder clears the activation latch on the library, as it did before the split, so a later link switches to Imported.
- A store write on a closed connection rejects. It does not throw.
- Clear and Remove are final. A link or a read in flight checks before it adds or saves anything.
- Linking a folder that is already linked keeps the new handle, saves it, and counts as Reconnect for that folder.
- A track that cannot open because its folder waits is skipped in the queue, and is not counted under `Skipped`.
- A track that opens clears its own failed mark.

## Composer reread

- It stores progress every 100 files, so a restart carries on where it stopped.
- A batch of pure rereads does not bump the view. The view updates once, when the scan ends.
- A read error leaves the record due, so the next start tries it again.

## Extras files

- The limit per file becomes 64 MB.
- A read error on any file keeps the stored data, whatever the error. Only a file that was read but cannot be parsed, or that is too large, counts as skipped.
- A read that finds no file of this kind keeps the stored data. With nothing stored, a linked folder still records its handle.
- Text that is not valid UTF-8 reads as Windows-1252, for a whole file and for a quoted-printable value with no `CHARSET`.
- A fold that splits a UTF-8 character is removed before decoding. Only that case: a 2.1 quoted-printable line can start with a space.
- Quoted-printable text works by code point, and joins soft breaks in one pass, so a large value stays linear.

## Contacts

A card with no name or organisation shows its first phone, or else its first email. A card with none of these is skipped.

## Calendar

- Read `UID` and `RECURRENCE-ID`. That event replaces the occurrence of the same `UID` starting at that time. With no match, it stands alone.
- Read `STATUS`. A `CANCELLED` event is left out. With `RECURRENCE-ID`, it removes that occurrence.
- After that matching, and before the 2,000 limit, leave out events that can no longer occur: a single event that ended before today, or a rule whose `UNTIL` has passed. They do not count as skipped.
- List an event until it ends: its end falls after the start of today. With no end, its start must be today or later.
- Read `DURATION` when there is no `DTEND`.
- Read `WKST`. It changes only a weekly rule with `INTERVAL` above 1 and `BYDAY`. This replaces the line in 42.
- `BYMONTH` and `BYMONTHDAY` that match `DTSTART` change nothing, so they are accepted.
- `BYDAY` works when monthly with one ordinal day, such as `2TU` or `-1FR`. One day plus `BYSETPOS` means the same.
- Any other rule keeps its first occurrence and adds one to `Skipped`.
- An interval too large for a date ends the walk. Days before the window take no zone conversion.
- A range ending on another day shows the short date of its end.
- A `TZID` that `Intl` does not know stays local, including Windows zone names.
