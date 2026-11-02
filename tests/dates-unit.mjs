// Node unit run of the date rules in spec 46, in zones that change their clocks. Each zone's short
// and long days are found from the zone itself, so no date here depends on where the tests run.
import { T } from "./h.mjs";

const t = new T();
const ics = await import("../src/ics.js");
const strings = await import("../src/strings.js");
const s = new strings.Strings();

const pad = (n) => String(n).padStart(2, "0");
const ymd = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
const local = (day, h = 0, mi = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi).getTime();
const plus = (day, days) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
const hoursIn = (day) => (local(plus(day, 1)) - local(day)) / 3600000;
const event = (...body) => ["BEGIN:VEVENT", ...body, "END:VEVENT"];
const parse = (...events) => ics.parseCalendar(["BEGIN:VCALENDAR", ...events.flat(), "END:VCALENDAR"].join("\r\n")).events;
const list = (now, ...events) => ics.upcoming(ics.settleEvents(parse(...events), now).items, now);
const kept = (now, ...events) => ics.settleEvents(parse(...events), now).items.map((e) => e.title);
const date = (name, day) => `${name};VALUE=DATE:${ymd(day)}`;
const timed = (name, day, h = 10) => `${name}:${ymd(day)}T${pad(h)}0000`;
const allDay = (from, to) => s.allDayRange(from, to).replace(/\s/g, " ");

function checkChange(zone, kind, day) {
  const label = (text) => `${zone}, ${kind} day: ${text}`;
  const before = plus(day, -14);
  const now = new Date(local(before));
  const single = (start, ...more) => list(new Date(local(plus(start, -1), 12)), ...more);

  const rows = (start, end) => [local(start), end];
  t.eq(label("a three-day all-day event ends at a midnight"), list(new Date(local(plus(day, -1), 12)), event("SUMMARY:A", date("DTSTART", plus(day, -1)), date("DTEND", plus(day, 2)))).map((e) => [e.at, e.end]), [rows(plus(day, -1), local(plus(day, 2)))]);

  for (const [how, ends] of [["DTEND", (first) => date("DTEND", plus(first, 3))], ["DURATION", () => "DURATION:P3D"], ["weeks", () => "DURATION:P0W3D"]]) {
    const first = plus(day, -8);
    const found = list(now, event("SUMMARY:A", date("DTSTART", first), ends(first), "RRULE:FREQ=WEEKLY;COUNT=2"));
    t.eq(label(`each occurrence ends its own midnights after its start (${how})`), found.map((e) => [e.at, e.end]), [
      rows(first, local(plus(first, 3))), rows(plus(day, -1), local(plus(day, 2))),
    ]);
    t.eq(label(`so its last day stays (${how})`), allDay(found[1].at, found[1].end), allDay(local(plus(day, -1)), local(plus(day, 2))));
  }

  const oneDay = list(now, event("SUMMARY:A", date("DTSTART", plus(day, -7)), date("DTEND", plus(day, -6)), "RRULE:FREQ=WEEKLY;COUNT=2"));
  t.eq(label("one day stays one day"), [oneDay[1].end, s.allDayRange(oneDay[1].at, oneDay[1].end)], [local(plus(day, 1)), "All Day"]);

  const end = (...more) => single(plus(day, -1), event("SUMMARY:T", timed("DTSTART", plus(day, -1)), ...more))[0].end;
  const start = local(plus(day, -1), 10);
  t.eq(label("the days of a DURATION are calendar days"), end("DURATION:P1D"), local(day, 10));
  t.eq(label("its weeks too"), end("DURATION:P1W"), local(plus(day, 6), 10));
  t.eq(label("its hours are exact"), end("DURATION:PT24H"), start + 24 * 3600000);
  t.eq(label("with both, days first and then exact time"), end("DURATION:P1DT1H"), local(day, 10) + 3600000);
  t.eq(label("a timed DTEND stays an exact length"), end(timed("DTEND", day)), local(day, 10));
  const length = local(day, 10) - start;
  const repeated = list(now, event("SUMMARY:T", timed("DTSTART", plus(day, -1)), timed("DTEND", day), "RRULE:FREQ=WEEKLY;COUNT=2"));
  t.eq(label("on every occurrence of a rule"), repeated[1].end - repeated[1].at, length);

  const over = new Date(local(plus(day, 2), 12));
  const trip = event("SUMMARY:A", date("DTSTART", plus(day, -1)), date("DTEND", plus(day, 2)));
  t.eq(label("an all-day event is over at its last midnight"), [kept(over, trip), list(over, trip).length], [[], 0]);
  const last = new Date(local(plus(day, 1), 12));
  t.eq(label("and listed through its last day"), [kept(last, trip), list(last, trip).length], [["A"], 1]);

  const ran = event("SUMMARY:C", date("DTSTART", plus(day, -3)), date("DTEND", plus(day, -2)), "RRULE:FREQ=DAILY;COUNT=3");
  t.eq(label("an all-day rule that COUNT runs out on this day stays through it"), kept(new Date(local(plus(day, -1), 12)), ran), ["C"]);
  t.eq(label("and has left by the next"), kept(new Date(local(day, 12)), ran), []);
}

for (const zone of ["America/Toronto", "Australia/Sydney", "Australia/Lord_Howe"]) {
  process.env.TZ = zone;
  const days = Array.from({ length: 365 }, (_, i) => new Date(2026, 0, 1 + i));
  const short = days.find((day) => hoursIn(day) < 24);
  const long = days.find((day) => hoursIn(day) > 24);
  t.ok(`${zone} changes its clocks`, short && long, `${short} ${long}`);
  checkChange(zone, "short", short);
  checkChange(zone, "long", long);
}

// A named zone keeps its own wall clock, wherever the device is.
process.env.TZ = "Asia/Tokyo";
{
  const now = new Date(Date.UTC(2026, 2, 20));
  const [found] = list(now, event("SUMMARY:T", "DTSTART;TZID=Europe/Paris:20260328T100000", "DURATION:P1D"));
  t.eq("a DURATION's days follow the event's own zone across its clock change", found.end, Date.UTC(2026, 2, 29, 8));
  const [utc] = list(now, event("SUMMARY:U", "DTSTART:20260328T100000Z", "DURATION:P1D"));
  t.eq("UTC has no clock change", utc.end - utc.at, 86400000);
}

t.done();
process.exit(t.exitCode);
