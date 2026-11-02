// iCalendar events, with the recurrence that specs 38 and 44 support and no more.
import { contentLine, splitEscaped, unescapeText, unfold } from "./content-lines.js";

const DAY_MS = 86400000;
const WINDOW_DAYS = 60;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQUENCIES = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const RULE_PARTS = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "WKST", "BYMONTH", "BYMONTHDAY", "BYSETPOS"]);
const ORDINAL_DAY = /^([+-]?[1-5])?(SU|MO|TU|WE|TH|FR|SA)$/;
const DURATION = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const zones = new Map();

function zoneFormat(zone) {
  if (!zones.has(zone)) {
    let format = null;
    try {
      format = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric",
      });
    } catch { /* an unknown zone is taken as local */ }
    zones.set(zone, format);
  }
  return zones.get(zone);
}

function zoneOffset(instant, zone) {
  const p = Object.fromEntries(zoneFormat(zone).formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

function stamp(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = 0, mi = 0, s = 0, utc] = m;
  const out = { y: Number(y), mo: Number(mo), d: Number(d), h: Number(h), mi: Number(mi), s: Number(s) };
  if (m[4] === undefined || params?.VALUE?.toUpperCase() === "DATE") return { ...out, h: 0, mi: 0, s: 0, kind: "date" };
  if (utc) return { ...out, kind: "utc" };
  const zone = params?.TZID?.replace(/^\//, "");
  return zone && zoneFormat(zone) ? { ...out, kind: "zone", zone } : { ...out, kind: "local" };
}

function instantOf(t) {
  if (t.kind === "date" || t.kind === "local") return new Date(t.y, t.mo - 1, t.d, t.h, t.mi, t.s).getTime();
  const wall = Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi, t.s);
  if (t.kind === "utc") return wall;
  return wall - zoneOffset(wall - zoneOffset(wall, t.zone), t.zone);
}

const dayOf = (t) => Date.UTC(t.y, t.mo - 1, t.d) / DAY_MS;

function onDay(t, day) {
  const date = new Date(day * DAY_MS);
  return { ...t, y: date.getUTCFullYear(), mo: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

const startOfDay = (when) => new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime();

// How far each occurrence runs, or null for an event with no end. Spec 46: days are calendar
// days, which a clock change cannot move, and the rest is exact. An all-day event's end is days
// only. A timed DTEND is exact only. A DURATION can be both, or a plain number of milliseconds
// in an event stored before this was so.
function spanOf({ start, end, duration }) {
  let days = 0;
  let ms = 0;
  if (end && start.kind === "date") days = dayOf(end) - dayOf(start);
  else if (end) ms = instantOf(end) - instantOf(start);
  else if (typeof duration === "number") ms = duration;
  else if (duration) ({ days, ms } = duration);
  return days * DAY_MS + ms > 0 ? { days, ms } : null;
}

// When the occurrence on `day` ends, or null with no end.
const endOn = (start, span, day) => (span ? instantOf(onDay(start, day + span.days)) + span.ms : null);
const reachOf = (span) => (span ? span.days * DAY_MS + span.ms : 0);

function parseDuration(value) {
  const m = DURATION.exec(value.trim().toUpperCase());
  if (!m) return null;
  const [weeks, days, hours, minutes, seconds] = m.slice(1).map((part) => Number(part ?? 0));
  return { days: weeks * 7 + days, ms: (hours * 3600 + minutes * 60 + seconds) * 1000 };
}

// BYDAY=2TU, or BYDAY=TU with BYSETPOS=2.
function ordinalDay(byDay, position) {
  const m = ORDINAL_DAY.exec(byDay);
  if (!m || (m[1] && position) || (position && !/^[+-]?[1-5]$/.test(position))) return null;
  const nth = Number(m[1] ?? position);
  return nth ? { nth, weekday: WEEKDAYS.indexOf(m[2]) } : null;
}

// A rule's BYMONTH or BYMONTHDAY is accepted where matching DTSTART makes it change nothing.
// BYMONTH would narrow a monthly rule, so it counts only on a yearly one.
function matchesStart(fields, freq, start) {
  const month = fields.get("BYMONTH");
  const day = fields.get("BYMONTHDAY");
  if (month !== undefined && (freq !== "YEARLY" || Number(month) !== start.mo)) return false;
  if (day === undefined) return true;
  return (freq === "YEARLY" || freq === "MONTHLY") && Number(day) === start.d;
}

function parseRule(value, start) {
  const fields = new Map(value.split(";").filter(Boolean).map((part) => {
    const equals = part.indexOf("=");
    return [part.slice(0, equals).toUpperCase(), part.slice(equals + 1).toUpperCase()];
  }));
  const freq = fields.get("FREQ");
  if (!FREQUENCIES.has(freq) || [...fields.keys()].some((name) => !RULE_PARTS.has(name))) return null;
  if (fields.has("BYMONTHDAY") && fields.has("BYDAY")) return null;
  const whole = (name, fallback) => {
    if (!fields.has(name)) return fallback;
    return /^[1-9]\d*$/.test(fields.get(name)) ? Number(fields.get(name)) : null;
  };
  const interval = whole("INTERVAL", 1);
  const count = whole("COUNT", Infinity);
  const until = fields.has("UNTIL") ? stamp(fields.get("UNTIL")) : undefined;
  if (interval === null || count === null || until === null || !matchesStart(fields, freq, start)) return null;
  const days = fields.get("BYDAY");
  const position = fields.get("BYSETPOS");
  if (position && (freq !== "MONTHLY" || !days)) return null;
  let byDay = null;
  let ordinal = null;
  if (days && freq === "WEEKLY") {
    byDay = days.split(",").map((day) => WEEKDAYS.indexOf(day));
    if (byDay.includes(-1)) return null;
  } else if (days) {
    ordinal = freq === "MONTHLY" ? ordinalDay(days, position) : null;
    if (!ordinal) return null;
  }
  const weekStart = WEEKDAYS.indexOf(fields.get("WKST") ?? "MO");
  if (weekStart < 0) return null;
  return {
    freq, interval: Math.min(interval, Number.MAX_SAFE_INTEGER), count: Number.isFinite(count) ? count : null,
    until: until ?? null, byDay, ordinal, weekStart,
  };
}

const blank = () => ({
  title: "", location: "", start: null, end: null, duration: null, ruleText: "", except: [], uid: "", recurrence: null, status: "",
});

function read(event, { name, params, value }) {
  switch (name) {
    case "SUMMARY":
      event.title ||= unescapeText(value).trim();
      break;
    case "LOCATION":
      event.location ||= unescapeText(value).trim();
      break;
    case "DTSTART":
      event.start ??= stamp(value, params);
      break;
    case "DTEND":
      event.end ??= stamp(value, params);
      break;
    case "DURATION":
      event.duration ??= parseDuration(value);
      break;
    case "RRULE":
      event.ruleText ||= value;
      break;
    case "UID":
      event.uid ||= value.trim();
      break;
    case "RECURRENCE-ID":
      event.recurrence ??= stamp(value, params);
      break;
    case "STATUS":
      event.status ||= value.trim().toUpperCase();
      break;
    case "EXDATE":
      for (const part of splitEscaped(value, ",")) {
        const excluded = stamp(part, params);
        if (excluded) event.except.push(excluded);
      }
      break;
    default:
      break;
  }
}

// A rule needs DTSTART, which can come after it in the file.
function finish({ ruleText, ...event }) {
  const rule = ruleText ? parseRule(ruleText, event.start) : null;
  return { ...event, rule, otherRule: !!ruleText && !rule };
}

// skipped counts events that could not be used. broken means the text is no calendar at all.
export function parseCalendar(text) {
  const events = [];
  let skipped = 0;
  let event = null;
  let depth = 0;
  let seen = false;
  for (const line of unfold(text).split("\n")) {
    const item = contentLine(line);
    if (!item) continue;
    const word = item.value.trim().toUpperCase();
    if (item.name === "BEGIN") {
      if (word === "VCALENDAR" || word === "VEVENT") seen = true;
      if (event) depth += 1;
      else if (word === "VEVENT") event = blank();
    } else if (item.name === "END") {
      if (event && depth) depth -= 1;
      else if (event && word === "VEVENT") {
        if (event.start) events.push(finish(event));
        else skipped += 1;
        event = null;
      }
    } else if (event && !depth) {
      read(event, item);
    }
  }
  if (event) skipped += 1;
  return { events, skipped, broken: !seen };
}

// Whether the occurrence on `day` is still to end at `from`. With no end, it must start then or later.
const stillOn = (start, span, day, from) => (span ? endOn(start, span, day) > from : instantOf(onDay(start, day)) >= from);

// Whether a rule's COUNT has run out: its last occurrence has ended by `from`. Days before that
// can be counted without converting a time, which is slow for a named zone.
function countRunOut({ start, rule }, span, from) {
  const firstDay = Math.floor((from - reachOf(span)) / DAY_MS) - 1;
  const lastDay = Math.ceil(from / DAY_MS) + 1;
  for (const { day, index } of ruleDays(start, rule, dayOf(start), lastDay)) {
    if (index >= rule.count) return true;
    if (day >= firstDay && stillOn(start, span, day, from)) return false;
  }
  return false;
}

// Spec 46: EXDATE and RECURRENCE-ID reach the first occurrence of an event with no rule. One
// whose rule keeps only that occurrence stays in, so that it still counts as skipped.
function canStillOccur(event, from) {
  const { start, rule, otherRule, except } = event;
  const span = spanOf(event);
  if (!rule) {
    const at = instantOf(start);
    if (!otherRule && except.some((stamp) => instantOf(stamp) === at)) return false;
    return stillOn(start, span, dayOf(start), from);
  }
  const { until } = rule;
  if (until && instantOf(until) + (until.kind === "date" ? DAY_MS : 0) + reachOf(span) <= from) return false;
  return rule.count === null || !countRunOut(event, span, from);
}

// Spec 44: run once over everything read, before any limit. An event with RECURRENCE-ID takes
// the place of that occurrence of its UID, or removes it when cancelled. What can no longer
// occur is left out and not counted. A rule we cannot follow adds one to `skipped`.
export function settleEvents(events, now = new Date()) {
  const from = startOfDay(now);
  const repeating = new Map(events.filter((event) => event.uid && !event.recurrence).map((event) => [event.uid, event]));
  const kept = [];
  for (const event of events) {
    if (event.recurrence) repeating.get(event.uid)?.except.push(event.recurrence);
    if (event.status !== "CANCELLED") kept.push(event);
  }
  const items = kept.filter((event) => canStillOccur(event, from));
  return { items, skipped: items.filter((event) => event.otherRule).length };
}

// Each yields { day, index }, where index counts occurrences from DTSTART. Without COUNT nothing
// reads the index, so the walk can start near today: `skip` is how many whole periods to jump.
// A day that is not a number, from an interval too large for a date, ends the walk.

function* evenDays(first, span, skip, lastDay) {
  for (let n = skip; ; n++) {
    const day = first + n * span;
    if (!(day <= lastDay)) return;
    yield { day, index: n };
  }
}

// 1970-01-01, day 0, was a Thursday.
const weekdayOf = (day) => (((day + 4) % 7) + 7) % 7;

function* weekdays(first, { interval, byDay, weekStart }, skip, lastDay) {
  const sinceStart = (weekdayOf(first) - weekStart + 7) % 7;
  const offsets = [...new Set(byDay.map((d) => (d - weekStart + 7) % 7))].sort((a, b) => a - b);
  let index = 0;
  if (!skip && !offsets.includes(sinceStart)) yield { day: first, index: index++ };
  for (let week = first - sinceStart + skip * 7 * interval; week <= lastDay; week += 7 * interval) {
    for (const offset of offsets) {
      const day = week + offset;
      if (day < first) continue;
      if (day > lastDay) return;
      yield { day, index: index++ };
    }
  }
}

function* monthDays(start, months, skip, lastDay) {
  let index = 0;
  for (let step = skip; ; step++) {
    const day = Date.UTC(start.y, start.mo - 1 + step * months, start.d) / DAY_MS;
    if (!(day <= lastDay)) return;
    // A date that does not exist in this month is passed over, not moved.
    if (new Date(day * DAY_MS).getUTCDate() === start.d) yield { day, index: index++ };
  }
}

// The nth weekday of each month, counted from its end when nth is negative. A month without
// one is passed over. DTSTART counts as the first occurrence, as it does in `weekdays`.
function* ordinalDays(start, { interval, ordinal: { nth, weekday } }, skip, lastDay) {
  const first = dayOf(start);
  let index = 0;
  let leading = !skip;
  for (let step = skip; ; step++) {
    const month = start.mo - 1 + step * interval;
    const begins = Date.UTC(start.y, month, 1) / DAY_MS;
    if (!(begins <= lastDay)) return;
    const ends = Date.UTC(start.y, month + 1, 0) / DAY_MS;
    const day = nth > 0
      ? begins + ((weekday - weekdayOf(begins) + 7) % 7) + (nth - 1) * 7
      : ends - ((weekdayOf(ends) - weekday + 7) % 7) + (nth + 1) * 7;
    if (leading && day !== first) yield { day: first, index: index++ };
    leading = false;
    if (day < begins || day > ends || day < first) continue;
    if (day > lastDay) return;
    yield { day, index: index++ };
  }
}

function ruleDays(start, rule, firstDay, lastDay) {
  const first = dayOf(start);
  const { freq, interval, byDay, ordinal, count } = rule;
  const skip = (gap, span) => (count === null ? Math.max(0, Math.floor(gap / span) - 1) : 0);
  const days = firstDay - first;
  if (freq === "DAILY") return evenDays(first, interval, skip(days, interval), lastDay);
  if (freq === "WEEKLY") {
    const weeks = skip(days, 7 * interval);
    return byDay ? weekdays(first, rule, weeks, lastDay) : evenDays(first, 7 * interval, weeks, lastDay);
  }
  const months = freq === "MONTHLY" ? interval : interval * 12;
  const from = new Date(firstDay * DAY_MS);
  const gap = (from.getUTCFullYear() - start.y) * 12 + from.getUTCMonth() - (start.mo - 1);
  if (ordinal) return ordinalDays(start, rule, skip(gap, months), lastDay);
  return monthDays(start, months, skip(gap, months), lastDay);
}

// Occurrences from `from` to `to`. Spec 44: one is listed until it ends, so it can have begun
// before `from`. With no end, it must start inside. A rule walks the event's own wall clock, so
// a weekly 10:00 in a named zone stays at 10:00 there across a clock change.
export function occurrences(event, from, to) {
  const { start, rule } = event;
  const allDay = start.kind === "date";
  const span = spanOf(event);
  const except = new Set(event.except.map(instantOf));
  const shows = (at, end) => at < to && !except.has(at) && (end === null ? at >= from : end > from);
  const occurrence = (at, end) => ({ title: event.title, location: event.location, at, end, allDay });
  if (!rule) {
    const at = instantOf(start);
    const end = endOn(start, span, dayOf(start));
    return shows(at, end) ? [occurrence(at, end)] : [];
  }
  const until = rule.until && (rule.until.kind === "date" ? null : instantOf(rule.until));
  const untilDay = rule.until?.kind === "date" ? dayOf(rule.until) : Infinity;
  const out = [];
  const firstDay = Math.floor((from - reachOf(span)) / DAY_MS) - 1;
  const lastDay = Math.ceil(to / DAY_MS) + 1;
  for (const { day, index } of ruleDays(start, rule, firstDay, Math.min(lastDay, untilDay))) {
    if (rule.count !== null && index >= rule.count) break;
    if (day < firstDay) continue;
    const at = instantOf(onDay(start, day));
    if (until !== null && until !== undefined && at > until) break;
    if (at >= to) break;
    const end = endOn(start, span, day);
    if (shows(at, end)) out.push(occurrence(at, end));
  }
  return out;
}

// What the Calendar screen lists: for 60 days from the start of today, by time then title.
export function upcoming(events, now = new Date()) {
  const from = startOfDay(now);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + WINDOW_DAYS).getTime();
  return events.flatMap((event) => occurrences(event, from, to))
    .sort((a, b) => a.at - b.at || collator.compare(a.title, b.title));
}
