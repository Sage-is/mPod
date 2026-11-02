// Node unit run of the review rulings in specs 43, 44 and 46: tags, EQ, text, contacts and calendar.
import { T } from "./h.mjs";
import { tagged } from "./product.mjs";

const t = new T();
const content = await import("../src/content-lines.js");
const ics = await import("../src/ics.js");
const vcard = await import("../src/vcard.js");
const tags = await import("../src/tags.js");
const eq = await import("../src/eq-presets.js");
const strings = await import("../src/strings.js");
const genres = await import("../src/id3-genres.js").catch(() => ({}));

// A rule not built yet fails its own line, and the rest of the file still runs.
const check = (label, fn, want) => {
  const value = (of) => {
    try {
      return of();
    } catch (err) {
      return `threw ${err.name}: ${err.message}`;
    }
  };
  t.eq(label, value(fn), typeof want === "function" ? value(want) : want);
};
const checkAsync = async (label, fn, want) => {
  let got;
  try {
    got = await fn();
  } catch (err) {
    got = `threw ${err.name}: ${err.message}`;
  }
  t.eq(label, got, want);
};

// Tags
const blob = (fields) => new Blob([Buffer.from(tagged(fields, 2), "base64")]);
const utf8 = (text) => Buffer.from(text, "utf8").toString("latin1");
const read = async (fields, repair) => tags.readTags(blob(fields), "mp3", repair);
await checkAsync("ID3 Latin-1 that is valid UTF-8 reads as UTF-8", async () => (await read({ title: utf8("Café Ünï") }, true)).title, "Café Ünï");
await checkAsync("true Latin-1 stays Latin-1", async () => (await read({ title: "Café" }, true)).title, "Café");
await checkAsync("plain ASCII is untouched", async () => (await read({ title: "Plain" }, true)).title, "Plain");
await checkAsync("the test page path is unchanged", async () => (await read({ title: utf8("Café") })).title, utf8("Café"));
const genre = async (value, repair = true) => (await read({ title: "x", genre: value }, repair)).genre ?? null;
for (const [value, want] of [["17", "Rock"], ["(17)", "Rock"], ["0", "Blues"], ["(0)", "Blues"], ["80", "Folk"], ["147", "Synthpop"], ["191", "Psybient"], ["(191)", "Psybient"], ["192", null], ["(192)", null], ["999", null], ["(17)Rock", "Rock"], ["Rock", "Rock"], ["Hip-Hop", "Hip-Hop"]]) {
  await checkAsync(`genre ${value}`, () => genre(value), want);
}
await checkAsync("the test page keeps stripping (17)", () => genre("(17)", false), null);
await checkAsync("and keeps a bare 17", () => genre("17", false), "17");

// Spec 46: only a damaged tag yields no tags. A title too long for the first window needs a second read.
const failing = (good, after) => {
  let reads = 0;
  return {
    size: good.size,
    slice(...args) {
      reads += 1;
      return reads > after ? { arrayBuffer: async () => { throw new DOMException("gone", "NotReadableError"); } } : good.slice(...args);
    },
  };
};
const long = blob({ title: "x".repeat(70000), artist: "Art" });
const outcome = (file) => tags.readTags(file, "mp3").then((found) => Object.keys(found).filter((key) => found[key] !== undefined).sort(), (err) => `rejects ${err.name}`);
await checkAsync("a read error on the first read rejects", () => outcome(failing(long, 0)), "rejects NotReadableError");
await checkAsync("so does one on a later read", () => outcome(failing(long, 1)), "rejects NotReadableError");
await checkAsync("with every read good, the tags come back", () => outcome(failing(long, 9)), ["artist", "title"]);
const damaged = new Blob([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])]);
await checkAsync("a damaged tag yields no tags", () => outcome(damaged), []);
check("the ID3v1 table runs from 0 to 191", () => genres.ID3V1_GENRES.length, 192);
check("its anchors", () => [0, 17, 79, 80, 125, 147, 148, 191].map((n) => genres.ID3V1_GENRES[n]), ["Blues", "Rock", "Hard Rock", "Folk", "Dance Hall", "Synthpop", "Abstract", "Psybient"]);

// EQ
check("preamp: minus the largest gain, less 1.5 dB", () => eq.eqPreamp([5, -1, 2]), -6.5);
check("no boost, no preamp", () => [eq.eqPreamp([-2, -5]) + 0, eq.eqPreamp([0, 0]) + 0], [0, 0]);

// Text
const bytes = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));
check("a whole file that is not UTF-8 reads as Windows-1252", () => content.decodeText(bytes("Caf", [0xe9], " ", [0x80])), "Café €");
check("valid UTF-8 stays UTF-8", () => content.decodeText(bytes("Caf", [0xc3, 0xa9])), "Café");
check("a fold that splits a character is removed", () => content.decodeText(bytes("Caf", [0xc3], "\r\n ", [0xa9], "!")), "Café!");
check("with a tab and a bare newline too", () => content.decodeText(bytes([0xe2, 0x82], "\n\t", [0xac])), "€");
check("any other fold stays for the parser", () => content.decodeText(bytes("Ada\r\n Lovelace")), "Ada\r\n Lovelace");
check("a Windows-1252 file with a fold keeps it", () => content.decodeText(bytes([0xe9], "\r\n ", [0xa9], [0xff])), "é\r\n ©ÿ");
const BOM = [0xef, 0xbb, 0xbf];
check("a byte order mark goes from valid UTF-8", () => [content.decodeText(bytes(BOM, "Caf", [0xc3, 0xa9])), content.decodeBytes(bytes(BOM, "Caf", [0xc3, 0xa9]))], ["Café", "Café"]);
check("and from Windows-1252, in both decodes", () => [content.decodeText(bytes(BOM, "Caf", [0xe9])), content.decodeBytes(bytes(BOM, "Caf", [0xe9]))], ["Café", "Café"]);
check("at the start of any line", () => content.decodeText(bytes("A\r\n", BOM, "B\n", BOM, "C\r", BOM, "D")), "A\r\nB\nC\rD");
check("in Windows-1252 too", () => content.decodeText(bytes([0xe9], "\r\n", BOM, "B")), "é\r\nB");
check("after a UTF-16 mark", () => content.decodeText(Uint8Array.from(Buffer.from("﻿A\n﻿B", "utf16le"))), "A\nB");
check("inside a line it stays", () => content.decodeText(bytes("A", BOM, "B")), "A﻿B");
const joined = (...cards) => bytes(...cards.flatMap((c) => [BOM, `BEGIN:VCARD\r\nFN:${c}\r\nEND:VCARD\r\n`]));
check("joined files lose no card", () => vcard.parseVCards(content.decodeText(joined("Ada", "Bea", "Cy"))).cards.map((c) => c.name), ["Ada", "Bea", "Cy"]);
check("nor when one of them is Windows-1252", () => vcard.parseVCards(content.decodeText(joined("Ada", "Zo\xe9"))).cards.map((c) => c.name), ["Ada", "Zoé"]);
check("no event either", () => ics.parseCalendar(content.decodeText(bytes(BOM, "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:A\r\nDTSTART:20260616T100000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", BOM, "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:B\r\nDTSTART:20260617T100000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"))).events.map((e) => e.title), ["A", "B"]);
const card = (...lines) => ["BEGIN:VCARD", "VERSION:2.1", ...lines, "END:VCARD"].join("\r\n");
const name = (text) => vcard.parseVCards(text).cards[0]?.name;
check("a split fold in a whole card", () => vcard.parseVCards(content.decodeText(bytes("BEGIN:VCARD\r\nFN:Caf", [0xc3], "\r\n ", [0xa9], "\r\nEND:VCARD\r\n"))).cards[0].name, "Café");
check("quoted-printable with no CHARSET falls back to Windows-1252", () => name(card("FN;ENCODING=QUOTED-PRINTABLE:Caf=E9")), "Café");
check("and reads UTF-8 when it is", () => name(card("FN;ENCODING=QUOTED-PRINTABLE:Caf=C3=A9")), "Café");
check("a named CHARSET is used", () => name(card("FN;ENCODING=QUOTED-PRINTABLE;CHARSET=ISO-8859-2:=A1")), "Ą");
check("quoted-printable keeps a whole code point", () => name(card("FN;ENCODING=QUOTED-PRINTABLE:Hi 😀 =C3=A9")), "Hi 😀 é");
check("a 2.1 soft break keeps the next line's leading space", () => vcard.parseVCards(card("ADR;ENCODING=QUOTED-PRINTABLE:;;Long Street=", " Unit 4;City;;;", "FN:A")).cards[0].values, ["Long Street Unit 4, City"]);
{
  const long = Array.from({ length: 60000 }, () => "abcdefghijklmnopqrstuvwxyz=C3=A9abcdefghijklmnopqrstuvwxyz=").join("\r\n");
  const text = card(`NOTE;ENCODING=QUOTED-PRINTABLE:${long}x`, `FN;ENCODING=QUOTED-PRINTABLE:${long}x`);
  const began = performance.now();
  const parsed = vcard.parseVCards(text).cards[0];
  const spent = performance.now() - began;
  console.log(`    ${Math.round(text.length / 1e6)} MB of soft breaks in ${Math.round(spent)} ms`);
  t.ok("a large quoted-printable value stays linear", spent < 2500 && parsed.name.length > 3000000, spent);
}

// Contacts
const shown = (...lines) => vcard.parseVCards(["BEGIN:VCARD", ...lines, "END:VCARD"].join("\n"));
check("no name or organisation: the first phone", () => shown("TEL:555 0100", "TEL:555 0101", "EMAIL:a@b.invalid").cards[0].name, "555 0100");
check("or else the first email", () => shown("EMAIL:a@b.invalid").cards[0].name, "a@b.invalid");
check("none of these is skipped", () => [shown("NOTE:x").cards.length, shown("NOTE:x").skipped], [0, 1]);
check("a name still wins", () => shown("FN:Ada", "TEL:1").cards[0].name, "Ada");

// Calendar
const NOW = new Date(2026, 5, 15, 13, 0);
const at = (mo, d, h = 0, mi = 0) => new Date(2026, mo - 1, d, h, mi).getTime();
const calendar = (...body) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...body.flat(), "END:VCALENDAR"].join("\r\n");
const event = (...body) => ["BEGIN:VEVENT", ...body, "END:VEVENT"];
const settled = (...body) => ics.settleEvents(ics.parseCalendar(calendar(...body)).events, NOW);
const listed = (...body) => ics.upcoming(settled(...body).items, NOW);
const titled = (...body) => listed(...body).map((e) => `${e.title} ${new Date(e.at).toDateString().slice(4, 10)}`);

check("RECURRENCE-ID replaces the occurrence of its UID", () => titled(
  event("UID:u1", "SUMMARY:Daily", "DTSTART:20260615T100000", "RRULE:FREQ=DAILY;COUNT=3"),
  event("UID:u1", "SUMMARY:Moved", "RECURRENCE-ID:20260616T100000", "DTSTART:20260616T150000"),
), ["Daily Jun 15", "Moved Jun 16", "Daily Jun 17"]);
check("in another zone, the same instant", () => titled(
  event("UID:u1", "SUMMARY:Daily", "DTSTART:20260615T100000Z", "RRULE:FREQ=DAILY;COUNT=2"),
  event("UID:u1", "SUMMARY:Moved", "RECURRENCE-ID;TZID=Asia/Tokyo:20260616T190000", "DTSTART:20260616T150000Z"),
), ["Daily Jun 15", "Moved Jun 16"]);
check("with no match it stands alone", () => titled(event("UID:u2", "SUMMARY:Alone", "RECURRENCE-ID:20260616T100000", "DTSTART:20260616T150000")), ["Alone Jun 16"]);
check("another UID does not touch it", () => titled(
  event("UID:u1", "SUMMARY:Daily", "DTSTART:20260615T100000", "RRULE:FREQ=DAILY;COUNT=2"),
  event("UID:u9", "SUMMARY:Other", "RECURRENCE-ID:20260616T100000", "DTSTART:20260616T150000"),
), ["Daily Jun 15", "Daily Jun 16", "Other Jun 16"]);
check("a CANCELLED event is left out", () => titled(event("SUMMARY:Off", "STATUS:CANCELLED", "DTSTART:20260616T100000"), event("SUMMARY:On", "STATUS:CONFIRMED", "DTSTART:20260616T100000")), ["On Jun 16"]);
check("with RECURRENCE-ID it removes that occurrence", () => titled(
  event("UID:u1", "SUMMARY:Daily", "DTSTART:20260615T100000", "RRULE:FREQ=DAILY;COUNT=3"),
  event("UID:u1", "SUMMARY:Off", "STATUS:CANCELLED", "RECURRENCE-ID:20260616T100000", "DTSTART:20260616T100000"),
), ["Daily Jun 15", "Daily Jun 17"]);
check("what can no longer occur is left out, and not skipped", () => {
  const { items, skipped } = settled(
    event("SUMMARY:Ended", "DTSTART:20260601T100000", "DTEND:20260601T110000"),
    event("SUMMARY:Past", "DTSTART:20260601T100000"),
    event("SUMMARY:Rule over", "DTSTART:20260501T100000", "RRULE:FREQ=DAILY;UNTIL=20260601T000000Z"),
    event("SUMMARY:Rule on", "DTSTART:20260501T100000", "RRULE:FREQ=DAILY"),
    event("SUMMARY:Ahead", "DTSTART:20260701T100000"),
    event("SUMMARY:Today", "DTSTART:20260615T010000"),
  );
  return [items.map((e) => e.title), skipped];
}, [["Rule on", "Ahead", "Today"], 0]);
check("listed until it ends: begun before today", () => listed(event("SUMMARY:Long", "DTSTART:20260614T100000", "DTEND:20260616T100000")).map((e) => e.at), [at(6, 14, 10)]);
check("not once it has ended", () => listed(event("SUMMARY:Gone", "DTSTART:20260614T100000", "DTEND:20260614T235900")), []);
check("an end exactly at today's start is over", () => listed(event("SUMMARY:Gone", "DTSTART;VALUE=DATE:20260614", "DTEND;VALUE=DATE:20260615")), []);
check("a multi-day all-day event still running", () => listed(event("SUMMARY:Trip", "DTSTART;VALUE=DATE:20260613", "DTEND;VALUE=DATE:20260617")).length, 1);
check("with no end, today or later", () => listed(event("SUMMARY:Y", "DTSTART:20260614T235900"), event("SUMMARY:T", "DTSTART:20260615T000000")).map((e) => e.title), ["T"]);
check("a repeat that runs across today's start", () => listed(event("SUMMARY:Night", "DTSTART:20260614T230000", "DTEND:20260615T020000", "RRULE:FREQ=DAILY;COUNT=2")).map((e) => e.at), [at(6, 14, 23), at(6, 15, 23)]);
check("DURATION gives the end", () => listed(event("SUMMARY:D", "DTSTART:20260616T100000", "DURATION:PT1H30M"))[0].end, at(6, 16, 11, 30));
check("in days and weeks", () => [listed(event("SUMMARY:D", "DTSTART;VALUE=DATE:20260616", "DURATION:P1D"))[0].end, listed(event("SUMMARY:D", "DTSTART:20260616T100000", "DURATION:P1W"))[0].end], [at(6, 17), at(6, 23, 10)]);
check("DTEND wins", () => listed(event("SUMMARY:D", "DTSTART:20260616T100000", "DURATION:PT1H", "DTEND:20260616T120000"))[0].end, at(6, 16, 12));
check("DURATION keeps a running event listed", () => listed(event("SUMMARY:D", "DTSTART:20260614T100000", "DURATION:P2D")).length, 1);

const rule = (value, start = "20260601T100000", ...more) => titled(event("SUMMARY:R", `DTSTART:${start}`, `RRULE:${value}`, ...more));
check("WKST moves the weeks of a fortnightly BYDAY rule", () => rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU", "20260607T100000").slice(0, 3), ["R Jun 21", "R Jun 22", "R Jul 05"]);
check("Monday is the week's start without it", () => rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO", "20260607T100000").slice(0, 3), ["R Jun 15", "R Jun 21", "R Jun 29"]);
check("it changes nothing with INTERVAL 1", () => rule("FREQ=WEEKLY;BYDAY=SU,MO;WKST=SU;COUNT=9", "20260607T100000"), () => ["R Jun 15", "R Jun 21", "R Jun 22", "R Jun 28", "R Jun 29", "R Jul 05"]);
check("nor with no BYDAY", () => rule("FREQ=WEEKLY;INTERVAL=2;WKST=SU;COUNT=9"), () => ["R Jun 15", "R Jun 29", "R Jul 13", "R Jul 27", "R Aug 10"]);
check("BYMONTH and BYMONTHDAY that match DTSTART are accepted", () => rule("FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=20", "20200620T100000"), ["R Jun 20"]);
check("BYMONTHDAY on a monthly rule", () => rule("FREQ=MONTHLY;BYMONTHDAY=20;COUNT=3", "20260520T100000"), ["R Jun 20", "R Jul 20"]);
check("a BYMONTHDAY that does not match is another rule", () => {
  const { skipped, items } = settled(event("SUMMARY:R", "DTSTART:20260620T100000", "RRULE:FREQ=MONTHLY;BYMONTHDAY=21"));
  return [skipped, ics.upcoming(items, NOW).length];
}, [1, 1]);
check("a BYMONTH on a monthly rule narrows it, so it is another rule", () => settled(event("SUMMARY:R", "DTSTART:20260620T100000", "RRULE:FREQ=MONTHLY;BYMONTH=6")).skipped, 1);
check("monthly BYDAY, second Tuesday", () => rule("FREQ=MONTHLY;BYDAY=2TU", "20260512T100000"), ["R Jul 14", "R Aug 11"]);
check("from the first month in the window", () => rule("FREQ=MONTHLY;BYDAY=3MO", "20260518T100000"), ["R Jun 15", "R Jul 20"]);
check("last Friday", () => rule("FREQ=MONTHLY;BYDAY=-1FR", "20260529T100000"), ["R Jun 26", "R Jul 31"]);
check("BYSETPOS means the same", () => rule("FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1", "20260529T100000"), ["R Jun 26", "R Jul 31"]);
check("a month with no fifth Monday passes over", () => rule("FREQ=MONTHLY;BYDAY=5MO", "20260601T100000"), ["R Jun 29"]);
check("with COUNT", () => rule("FREQ=MONTHLY;BYDAY=3MO;COUNT=2", "20260518T100000"), ["R Jun 15"]);
for (const value of ["FREQ=MONTHLY;BYDAY=MO", "FREQ=MONTHLY;BYDAY=1MO,2TU", "FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=1", "FREQ=DAILY;BYHOUR=9", "FREQ=HOURLY"]) {
  check(`another rule keeps its first occurrence and adds one to Skipped: ${value}`, () => {
    const { skipped, items } = settled(event("SUMMARY:R", "DTSTART:20260616T100000", `RRULE:${value}`));
    return [skipped, ics.upcoming(items, NOW).length];
  }, [1, 1]);
}
check("one that has ended does not count", () => settled(event("SUMMARY:R", "DTSTART:20200616T100000", "RRULE:FREQ=HOURLY")).skipped, 0);
for (const value of ["FREQ=DAILY;INTERVAL=99999999999", "FREQ=WEEKLY;INTERVAL=99999999999", "FREQ=WEEKLY;INTERVAL=99999999999;BYDAY=MO", "FREQ=MONTHLY;INTERVAL=99999999999", "FREQ=YEARLY;INTERVAL=99999999999", "FREQ=MONTHLY;BYDAY=2TU;INTERVAL=99999999999", `FREQ=YEARLY;INTERVAL=${"9".repeat(400)}`]) {
  check(`an interval too large for a date ends the walk: ${value.slice(0, 44)}`, () => rule(value, "20260616T100000"), ["R Jun 16"]);
}
check("days before the window take no zone conversion", () => {
  let conversions = 0;
  const parts = Intl.DateTimeFormat.prototype.formatToParts;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { conversions += 1; return parts.apply(this, args); };
  try {
    const found = listed(event("SUMMARY:Z", "DTSTART;TZID=Asia/Tokyo:19900101T100000", "RRULE:FREQ=DAILY;COUNT=20000"));
    return [found.length, conversions < 800];
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = parts;
  }
}, [60, true]);
check("a TZID that Intl does not know stays local", () => listed(event("SUMMARY:W", "DTSTART;TZID=Eastern Standard Time:20260616T080000"))[0].at, at(6, 16, 8));
check("a stored event survives structured clone", () => ics.upcoming(structuredClone(settled(event("SUMMARY:D", "DTSTART:20260616T100000", "DURATION:PT1H")).items), NOW)[0].end, at(6, 16, 11));
check("an event stored with its DURATION in milliseconds still reads", () => ics.upcoming([{ ...settled(event("SUMMARY:D", "DTSTART:20260616T100000", "DURATION:PT1H")).items[0], duration: 3600000 }], NOW)[0].end, at(6, 16, 11));

// Spec 46
const shownWith = (...body) => { const { items, skipped } = settled(...body); return [ics.upcoming(items, NOW).map((e) => e.title), skipped]; };
check("EXDATE removes the one occurrence of an event with no rule", () => titled(event("SUMMARY:Off", "DTSTART:20260616T100000", "EXDATE:20260616T100000"), event("SUMMARY:On", "DTSTART:20260617T100000", "EXDATE:20260616T100000")), ["On Jun 17"]);
check("and leaves it out before the limit", () => settled(event("SUMMARY:Off", "DTSTART:20260616T100000", "EXDATE:20260616T100000")).items.length, 0);
check("on an all-day event too", () => titled(event("SUMMARY:Off", "DTSTART;VALUE=DATE:20260616", "EXDATE;VALUE=DATE:20260616")), []);
check("and the first of a rule that keeps only its first", () => shownWith(event("SUMMARY:Off", "DTSTART:20260616T100000", "RRULE:FREQ=HOURLY", "EXDATE:20260616T100000")), [[], 1]);
check("RECURRENCE-ID replaces an event with no rule", () => titled(
  event("UID:s1", "SUMMARY:First", "DTSTART:20260616T100000"),
  event("UID:s1", "SUMMARY:Moved", "RECURRENCE-ID:20260616T100000", "DTSTART:20260617T100000"),
), ["Moved Jun 17"]);
check("or removes it when cancelled", () => titled(
  event("UID:s1", "SUMMARY:First", "DTSTART:20260616T100000"),
  event("UID:s1", "SUMMARY:Off", "STATUS:CANCELLED", "RECURRENCE-ID:20260616T100000", "DTSTART:20260616T100000"),
), []);
check("and the first of a rule that keeps only its first", () => titled(
  event("UID:s2", "SUMMARY:First", "DTSTART:20260616T100000", "RRULE:FREQ=HOURLY"),
  event("UID:s2", "SUMMARY:Moved", "RECURRENCE-ID:20260616T100000", "DTSTART:20260617T100000"),
), ["Moved Jun 17"]);
check("BYMONTHDAY with BYDAY counts as any other rule", () => shownWith(event("SUMMARY:R", "DTSTART:20260616T100000", "RRULE:FREQ=MONTHLY;BYDAY=3TU;BYMONTHDAY=16")), [["R"], 1]);
check("even when they agree with DTSTART on a yearly rule", () => shownWith(event("SUMMARY:R", "DTSTART:20260616T100000", "RRULE:FREQ=YEARLY;BYMONTH=6;BYDAY=TU;BYMONTHDAY=16")), [["R"], 1]);
check("a rule that COUNT has run out leaves, and is not skipped", () => {
  const { items, skipped } = settled(
    event("SUMMARY:Over", "DTSTART:20260501T100000", "RRULE:FREQ=DAILY;COUNT=3"),
    event("SUMMARY:Weeks over", "DTSTART:20260501T100000", "RRULE:FREQ=WEEKLY;BYDAY=MO,FR;COUNT=4"),
    event("SUMMARY:Months over", "DTSTART:20260115T100000", "RRULE:FREQ=MONTHLY;COUNT=3"),
    event("SUMMARY:Nth over", "DTSTART:20260113T100000", "RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3"),
    event("SUMMARY:Last today", "DTSTART:20260613T100000", "RRULE:FREQ=DAILY;COUNT=3"),
    event("SUMMARY:Runs into today", "DTSTART:20260613T230000", "DTEND:20260614T020000", "RRULE:FREQ=DAILY;COUNT=2"),
    event("SUMMARY:Still going", "DTSTART:20260501T100000", "RRULE:FREQ=WEEKLY;COUNT=20"),
    event("SUMMARY:Ended yesterday", "DTSTART:20260612T100000", "DTEND:20260612T110000", "RRULE:FREQ=DAILY;COUNT=3"),
  );
  return [items.map((e) => e.title), skipped];
}, [["Last today", "Runs into today", "Still going"], 0]);
check("a rule past its UNTIL still leaves with a COUNT left over", () => settled(event("SUMMARY:R", "DTSTART:20260501T100000", "RRULE:FREQ=DAILY;COUNT=500;UNTIL=20260510T000000Z")).items.length, 0);
check("a long COUNT from long ago stays cheap", () => {
  let conversions = 0;
  const parts = Intl.DateTimeFormat.prototype.formatToParts;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { conversions += 1; return parts.apply(this, args); };
  try {
    const { items } = settled(event("SUMMARY:Z", "DTSTART;TZID=Asia/Tokyo:19900101T100000", "RRULE:FREQ=DAILY;COUNT=20000"));
    return [items.length, conversions < 400];
  } finally {
    Intl.DateTimeFormat.prototype.formatToParts = parts;
  }
}, [1, true]);

// Time ranges
const s = new strings.Strings();
const clock = (when) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(when).replace(/\s/g, " ");
check("a range on one day", () => s.timeRange(at(6, 16, 10), at(6, 16, 11)).replace(/\s/g, " "), `${clock(at(6, 16, 10))} – ${clock(at(6, 16, 11))}`);
check("a range ending on another day shows the short date of its end", () => s.timeRange(at(6, 16, 22), at(6, 17, 2)).replace(/\s/g, " "), `${clock(at(6, 16, 22))} – Jun 17 ${clock(at(6, 17, 2))}`);
check("an all-day event on one day", () => s.allDayRange(at(6, 16), at(6, 17)), "All Day");
check("over several days", () => s.allDayRange(at(6, 16), at(6, 19)), "All Day – Jun 18");
check("with no end", () => s.allDayRange(at(6, 16), null), "All Day");

t.done();
process.exit(t.exitCode);
