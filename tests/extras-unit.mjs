// Node unit run of the vCard and iCalendar parsers, with the Shuffle Albums order alongside.
import { albumShuffle } from "../src/album-order.js";
import { decodeText } from "../src/content-lines.js";
import { occurrences, parseCalendar, upcoming } from "../src/ics.js";
import { readFileSync } from "node:fs";
import { EQ_PRESETS, eqPreamp } from "../src/eq-presets.js";
import { byFamily, parseVCards } from "../src/vcard.js";
import { T } from "./h.mjs";

const t = new T();
const crlf = (...lines) => lines.join("\r\n");

// vCard
const v21 = crlf(
  "BEGIN:VCARD", "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Lovelace;=41da;;;",
  "FN;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:=41=64=61 Lov=C3=A9lace",
  "ORG:Analytical Engines;Research",
  "TEL;WORK;VOICE:+1 555 0100",
  "TEL;CELL:+1 555 0101",
  "EMAIL;INTERNET:ada@example.invalid",
  "ADR;WORK;ENCODING=QUOTED-PRINTABLE:;;12 Long Street=",
  " Unit 4;London;;N1;UK",
  "PHOTO;ENCODING=BASE64;TYPE=JPEG:/9j/4AAQSkZJRgABAQ",
  " AAAQABAAD",
  " /2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD",
  "",
  "END:VCARD",
);
const [ada] = parseVCards(v21).cards;
t.eq("2.1: quoted-printable, UTF-8 and charset", ada.name, "Ada Lovélace");
t.eq("2.1: N", [ada.family, ada.given], ["Lovelace", "Ada"]);
t.eq("2.1: values in order, photo ignored", ada.values, [
  "Analytical Engines, Research", "+1 555 0100", "+1 555 0101", "ada@example.invalid", "12 Long Street Unit 4, London, N1, UK",
]);

const v3 = crlf(
  "BEGIN:VCARD", "VERSION:3.0", "N:Hopper;Grace;;;", "FN:Grace",
  "  Hopper", "ORG:Navy\\, US", "item1.TEL;TYPE=cell:555\\,0200", "EMAIL;TYPE=\"home:work\":grace@example.invalid",
  "ADR;TYPE=home:;;1 Main St\\nApt 2;Arlington;VA\\;US;22201;", "END:VCARD",
);
const [grace] = parseVCards(v3).cards;
t.eq("3.0: folded lines and escapes", [grace.name, grace.values], ["Grace Hopper", ["Navy, US", "555,0200", "grace@example.invalid", "1 Main St, Apt 2, Arlington, VA;US, 22201"]]);

const v4 = "BEGIN:VCARD\nVERSION:4.0\nFN:Katherine Johnson\nN:Johnson;Katherine;;;\nTEL;VALUE=uri;TYPE=voice:tel:+1-555-0300\nEMAIL;PREF=1:kj@example.invalid\nEND:VCARD\n";
t.eq("4.0: tel uri, plain LF", parseVCards(v4).cards[0].values, ["+1-555-0300", "kj@example.invalid"]);

const many = parseVCards(`${v4}begin:vcard\nversion:3.0\nfn:Lower Case\nend:vcard\n`);
t.eq("any number of cards, any letter case", many.cards.map((c) => c.name), ["Katherine Johnson", "Lower Case"]);
t.eq("organisation stands in for a name", parseVCards("BEGIN:VCARD\nORG:Acme\nTEL:1\nEND:VCARD").cards[0].name, "Acme");
t.eq("N alone gives the name", parseVCards("BEGIN:VCARD\nN:Curie;Marie\nEND:VCARD").cards[0].name, "Marie Curie");
const nameless = parseVCards("BEGIN:VCARD\nNOTE:1\nEND:VCARD\nBEGIN:VCARD\nFN:Fine\nEND:VCARD\nBEGIN:VCARD\nFN:Cut off");
t.eq("nameless and unfinished cards skip", [nameless.cards.map((c) => c.name), nameless.skipped], [["Fine"], 2]);
t.eq("a broken file says so", parseVCards("\u0000\u0001 not a card").broken, true);
t.eq("an empty file is broken too", parseVCards("").broken, true);
const sorted = [
  { name: "Zed Adams", family: "Adams", given: "Zed" }, { name: "Acme", family: "", given: "" },
  { name: "Amy Adams", family: "Adams", given: "Amy" }, { name: "Bea Baker", family: "Baker", given: "Bea" },
].sort(byFamily).map((c) => c.name);
t.eq("family, then given", sorted, ["Acme", "Amy Adams", "Zed Adams", "Bea Baker"]);
t.eq("UTF-8 byte order mark", decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), "A");
t.eq("UTF-16 file", decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0])), "A");

// iCalendar
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = new Date(2026, 5, 15, 13, 0);
const calendar = (...body) => crlf("BEGIN:VCALENDAR", "VERSION:2.0", ...body, "END:VCALENDAR");
const event = (...body) => ["BEGIN:VEVENT", ...body.filter(Boolean), "END:VEVENT"];
const read = (...body) => parseCalendar(calendar(...body));
const days = (list) => list.map((e) => new Date(e.at).toDateString());

const simple = read(...event("SUMMARY:Dentist\\, annual", "LOCATION:12 High St\\nFloor 2", "DTSTART:20260616T090000", "DTEND:20260616T093000"));
const [dentist] = simple.events;
t.eq("escapes removed", [dentist.title, dentist.location], ["Dentist, annual", "12 High St\nFloor 2"]);
const [first] = upcoming(simple.events, NOW);
t.eq("floating time is local", [first.at, first.end, first.allDay], [at(2026, 6, 16, 9), at(2026, 6, 16, 9, 30), false]);

const folded = read(...event("SUMMARY:Long", " er title", "DTSTART;VALUE=DATE:20260620", "DTEND;VALUE=DATE:20260621"));
const [day] = upcoming(folded.events, NOW);
t.eq("folded line, all-day", [day.title, day.allDay, day.at], ["Longer title", true, at(2026, 6, 20)]);

const [utc] = upcoming(read(...event("SUMMARY:U", "DTSTART:20260616T120000Z")).events, NOW);
t.eq("Z converts", utc.at, Date.UTC(2026, 5, 16, 12));
const [zoned] = upcoming(read(...event("SUMMARY:Z", "DTSTART;TZID=Asia/Tokyo:20260616T210000")).events, NOW);
t.eq("a known TZID converts through Intl", zoned.at, Date.UTC(2026, 5, 16, 12));
const [quoted] = upcoming(read(...event("SUMMARY:Q", "DTSTART;TZID=\"America/New_York\":20260616T080000")).events, NOW);
t.eq("a quoted TZID, in summer time", quoted.at, Date.UTC(2026, 5, 16, 12));
const [nowhere] = upcoming(read(...event("SUMMARY:N", "DTSTART;TZID=Mars/Olympus:20260616T080000")).events, NOW);
t.eq("an unknown zone is taken as local", nowhere.at, at(2026, 6, 16, 8));

const repeat = (rule, start = "20260601T100000", ...more) => upcoming(read(...event("SUMMARY:R", `DTSTART:${start}`, `RRULE:${rule}`, ...more)).events, NOW);
t.eq("daily, interval", days(repeat("FREQ=DAILY;INTERVAL=20")).length, 3);
t.eq("daily, count counts from the start", days(repeat("FREQ=DAILY;COUNT=17")), ["Mon Jun 15 2026", "Tue Jun 16 2026", "Wed Jun 17 2026"]);
t.eq("until, UTC", days(repeat("FREQ=WEEKLY;UNTIL=20260625T235959Z")), ["Mon Jun 15 2026", "Mon Jun 22 2026"]);
t.eq("until, a date", days(repeat("FREQ=WEEKLY;UNTIL=20260622")), ["Mon Jun 15 2026", "Mon Jun 22 2026"]);
t.eq("weekly, by day, count from the start", days(repeat("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=8")), ["Tue Jun 16 2026", "Thu Jun 18 2026", "Tue Jun 23 2026"]);
t.eq("fortnightly by day", days(repeat("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6", "20260601T100000")), ["Mon Jun 15 2026", "Wed Jun 17 2026", "Mon Jun 29 2026", "Wed Jul 01 2026"]);
t.eq("a sunday start keeps weeks from Monday", days(repeat("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO", "20260607T100000")).slice(0, 2), ["Mon Jun 15 2026", "Sun Jun 21 2026"]);
t.eq("monthly, day 31 skips short months", days(repeat("FREQ=MONTHLY", "20260131T100000")), ["Fri Jul 31 2026"]);
t.eq("yearly", days(repeat("FREQ=YEARLY", "20200701T100000")), ["Wed Jul 01 2026"]);
const skip = repeat("FREQ=DAILY;COUNT=20", "20260610T100000", "EXDATE:20260616T100000,20260618T100000");
t.eq("repeat with exclusions", days(skip).slice(0, 3), ["Mon Jun 15 2026", "Wed Jun 17 2026", "Fri Jun 19 2026"]);
t.eq("EXDATE matches the start, in any form", days(repeat("FREQ=DAILY;COUNT=20", "20260610T120000Z", "EXDATE;TZID=Asia/Tokyo:20260616T210000")).slice(0, 2), ["Mon Jun 15 2026", "Wed Jun 17 2026"]);
t.eq("a date alone does not remove a timed occurrence", days(repeat("FREQ=DAILY;COUNT=7", "20260610T100000", "EXDATE;VALUE=DATE:20260615")), ["Mon Jun 15 2026", "Tue Jun 16 2026"]);
t.eq("nor another time of that day", days(repeat("FREQ=DAILY;COUNT=7", "20260610T100000", "EXDATE:20260615T110000")), ["Mon Jun 15 2026", "Tue Jun 16 2026"]);
const allDayRule = upcoming(read(...event("SUMMARY:B", "DTSTART;VALUE=DATE:20200616", "RRULE:FREQ=YEARLY", "EXDATE;VALUE=DATE:20270616")).events, new Date(2027, 5, 1));
t.eq("all-day repeat, excluded by date", allDayRule, []);
t.eq("other rule parts keep the first occurrence only", days(repeat("FREQ=MONTHLY;BYDAY=MO", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("so does a BYMONTHDAY away from DTSTART", days(repeat("FREQ=MONTHLY;BYMONTHDAY=17", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("and an hourly rule", days(repeat("FREQ=HOURLY", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("any part beyond those in 38 and 44 counts as another rule", days(repeat("FREQ=DAILY;BYHOUR=9", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("BYDAY works only when weekly: daily", days(repeat("FREQ=DAILY;BYDAY=MO", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("BYDAY works only when weekly: yearly", days(repeat("FREQ=YEARLY;BYDAY=MO", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("a broken weekly day too", days(repeat("FREQ=WEEKLY;BYDAY=XX", "20260616T100000")), ["Tue Jun 16 2026"]);
t.eq("never more than 60 days ahead", days(repeat("FREQ=DAILY", "20260601T100000")).length, 60);
t.eq("the window ends at day 60", days(upcoming(read(...event("SUMMARY:L", "DTSTART;VALUE=DATE:20260814")).events, NOW)), []);
t.eq("an old daily rule stays exact", days(occurrences(read(...event("SUMMARY:O", "DTSTART:19800101T000000", "RRULE:FREQ=DAILY;INTERVAL=7")).events[0], at(2026, 6, 15), at(2026, 6, 22))).length, 1);
const old = (rule) => Array.from({ length: 2000 }, () => event("SUMMARY:O", "DTSTART:16010701T000000", `RRULE:${rule}`)).flat();
for (const rule of ["FREQ=DAILY", "FREQ=WEEKLY", "FREQ=WEEKLY;BYDAY=MO,FR", "FREQ=MONTHLY", "FREQ=YEARLY"]) {
  const { events } = read(...old(rule));
  const began = performance.now();
  const found = upcoming(events, NOW);
  const spent = performance.now() - began;
  console.log(`    ${rule}: ${found.length} occurrences in ${Math.round(spent)} ms`);
  t.ok(`no COUNT: ${rule} jumps to today`, spent < 300 && found.length > 0, spent);
}
t.eq("a jump lands on the same days as a walk", days(repeat("FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH", "19990105T100000")), days(repeat("FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH;COUNT=4000", "19990105T100000")));
t.eq("monthly too", days(repeat("FREQ=MONTHLY;INTERVAL=5", "19990131T100000")), days(repeat("FREQ=MONTHLY;INTERVAL=5;COUNT=400", "19990131T100000")));
t.eq("and yearly", days(repeat("FREQ=YEARLY", "19960229T100000", "")), days(upcoming(read(...event("SUMMARY:R", "DTSTART:19960229T100000", "RRULE:FREQ=YEARLY;COUNT=100")).events, NOW)));
const order = upcoming(read(
  ...event("SUMMARY:Beta", "DTSTART:20260616T100000"), ...event("SUMMARY:Alpha", "DTSTART:20260616T100000"), ...event("SUMMARY:First", "DTSTART:20260616T080000"),
  ...event("SUMMARY:Past", "DTSTART:20260601T080000"),
).events, NOW).map((e) => e.title);
t.eq("by time, then title; the past is left out", order, ["First", "Alpha", "Beta"]);
t.eq("today counts from its start", upcoming(read(...event("SUMMARY:E", "DTSTART:20260615T000000")).events, NOW).length, 1);
const alarm = read(...["BEGIN:VEVENT", "SUMMARY:Real", "DTSTART:20260616T100000", "BEGIN:VALARM", "SUMMARY:Alarm", "ACTION:DISPLAY", "END:VALARM", "LOCATION:Here", "END:VEVENT"]).events[0];
t.eq("a nested alarm is not the event", [alarm.title, alarm.location], ["Real", "Here"]);
const bad = parseCalendar(calendar(...event("SUMMARY:No date"), ...event("SUMMARY:Bad date", "DTSTART:tomorrow"), ...event("SUMMARY:Good", "DTSTART:20260616T100000"), "BEGIN:VEVENT", "SUMMARY:Cut off"));
t.eq("events with no usable date skip", [bad.events.map((e) => e.title), bad.skipped], [["Good"], 3]);
t.eq("a broken file says so", parseCalendar("%PDF-1.7 not a calendar").broken, true);
t.eq("an empty calendar is not broken", parseCalendar(calendar()).broken, false);
t.eq("stored data survives structured clone", upcoming(structuredClone(simple.events), NOW)[0].at, at(2026, 6, 16, 9));

// Shuffle Albums
const song = (album, track, artist = "A", extra = {}) => ({ albumName: album, artistName: artist, track, path: `${album}/${track}`, ...extra });
const queue = [song("One", 2), song("One", 1), song("One", 3), song("Two", 2), song("Two", 1), song("Three", 1), song("One", 1, "B")];
const key = (i) => `${queue[i].albumName}|${queue[i].artistName}|${queue[i].track}`;
const played = albumShuffle(queue, 0).map(key);
t.eq("every song once", [...new Set(played)].length, queue.length);
t.eq("the current song, then the rest of its album", played.slice(0, 2), ["One|A|2", "One|A|3"]);
t.eq("the album's earlier songs come last", played.at(-1), "One|A|1");
const middle = played.slice(2, -1);
t.ok("other albums whole, in track order", middle.join().includes("Two|A|1,Two|A|2"), middle.join());
t.ok("the pair: the same album name by another artist is another album", middle.includes("One|B|1"), middle.join());
const pair = [song("Mix", 1, "A", { albumArtist: "V" }), song("Mix", 2, "B", { albumArtist: "V" })];
t.eq("album artist joins one album", albumShuffle(pair, 0), [0, 1]);
const starts = new Set();
for (let i = 0; i < 40; i++) {
  const [lead] = albumShuffle(queue, null);
  starts.add(key(lead));
}
t.eq("with no start song, the first song of a random album", [...starts].sort(), ["One|A|1", "One|B|1", "Three|A|1", "Two|A|1"]);
// EQ: the table against the spec it came from.
const table = readFileSync("docs/spec/40-sound-and-look.md", "utf8").split("\n").filter((l) => /^\| [A-Z]/.test(l) && !l.startsWith("| Preset"))
  .map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).map(([name, ...gains]) => ({ name, gains: gains.map(Number) }));
t.eq("the EQ table is the spec's, in its order", EQ_PRESETS.map(({ name, gains }) => ({ name, gains })), table);
t.eq("preamp: minus the largest gain, less 1.5 dB, when that is positive", [eqPreamp([5, -1]), eqPreamp([-2, -5]) + 0, eqPreamp([0, 0]) + 0], [-6.5, 0, 0]);
t.done();
process.exit(t.exitCode);
