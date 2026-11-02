// Spec 38: Contacts and Calendar. Each has one folder of its own, read once and stored, so
// the screens open at once with no permission. Nothing here uses the network.
import { decodeText } from "./content-lines.js";
import { parseCalendar, settleEvents, upcoming } from "./ics.js";
import { el } from "./util.js";
import { byFamily, parseVCards } from "./vcard.js";

const FILE_MAX = 64 * 1024 * 1024;
const YIELD_EVERY = 200;
const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });

const KINDS = {
  contacts: {
    extension: ".vcf", limit: 1000, none: "noContactsYet", add: "addContactsFolder", folder: "contactsFolder",
    parse: (text) => { const { cards, skipped, broken } = parseVCards(text); return { items: cards, skipped, broken }; },
    settle: (cards) => ({ items: cards, skipped: 0 }),
    arrange: (cards) => cards.sort(byFamily).map((card, i) => ({ ...card, id: `contact-${i}` })),
  },
  calendar: {
    extension: ".ics", limit: 2000, none: "noEventsYet", add: "addCalendarFolder", folder: "calendarFolder",
    parse: (text) => { const { events, skipped, broken } = parseCalendar(text); return { items: events, skipped, broken }; },
    settle: (events) => settleEvents(events),
    arrange: (events) => events,
  },
};

// A file that was read but cannot be used counts as one skipped.
function parseFile(parse, bytes) {
  try {
    const result = parse(decodeText(bytes));
    return result.broken ? { items: [], skipped: 1 } : result;
  } catch {
    return { items: [], skipped: 1 };
  }
}

export class Extras {
  data = { contacts: null, calendar: null };
  generation = { contacts: 0, calendar: 0 };
  expanded = null;
  version = 0;

  constructor(device) {
    this.device = device;
    this.inputs = {};
    for (const kind of Object.keys(KINDS)) {
      const input = el("input", "", { type: "file", hidden: "", tabindex: "-1", "aria-hidden": "true", webkitdirectory: "", multiple: "" });
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", () => {
        const files = Array.from(input.files);
        input.value = "";
        this.fromFiles(kind, files);
      });
      device.shadowRoot.append(input);
      this.inputs[kind] = input;
    }
  }

  // From the stored library. Start reads nothing from the folders themselves.
  restore(meta) {
    for (const kind of Object.keys(KINDS)) {
      const record = meta[kind];
      if (record) this.data[kind] = { ...record, handle: record.handle ?? window.__podHandles?.[record.testId] ?? null };
    }
    this.#changed();
  }

  #changed() {
    this.version += 1;
    this.expanded = null;
    this.device.invalidate();
  }

  // Must be called inside a press.
  pick(kind) {
    if (typeof window.showDirectoryPicker !== "function") {
      this.inputs[kind].click();
      return;
    }
    window.showDirectoryPicker({ mode: "read" }).then((handle) => this.link(kind, handle), (err) => {
      if (err?.name !== "AbortError") console.warn("pod-player: folder picker failed", err);
    });
  }

  async #walk(dir, extension, found) {
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === "directory") await this.#walk(entry, extension, found);
      else if (!name.startsWith(".") && name.toLowerCase().endsWith(extension)) found.push({ name, entry });
    }
  }

  // Each item of `opens` gives a File. A read error on any of them ends this and keeps what is
  // stored (42, 44). Only a file too large, or one that cannot be parsed, counts as skipped.
  // The limit comes last, after what can no longer occur has left the count.
  async #read(kind, opens) {
    const { limit, parse, settle, arrange } = KINDS[kind];
    const found = [];
    let skipped = 0;
    let used = false;
    for (let i = 0; i < opens.length; i++) {
      const file = await opens[i]();
      if (file.size > FILE_MAX) {
        skipped += 1;
      } else {
        const result = parseFile(parse, new Uint8Array(await file.arrayBuffer()));
        skipped += result.skipped;
        used ||= result.items.length > 0 || !result.skipped;
        for (const item of result.items) found.push(item);
      }
      if ((i + 1) % YIELD_EVERY === 0) await nextTask();
    }
    const settled = settle(found);
    skipped += settled.skipped + Math.max(0, settled.items.length - limit);
    return { items: arrange(settled.items.slice(0, limit)), skipped, used };
  }

  // Spec 46: a read in which every file was skipped keeps what is stored, with the new count.
  // With nothing stored, the folder is still recorded (44).
  async #store(kind, { used, ...record }) {
    const stored = this.data[kind];
    this.data[kind] = stored && !used ? { ...stored, skipped: record.skipped } : record;
    this.#changed();
    await this.#save(kind);
  }

  #save(kind) {
    const store = this.device.importer?.store;
    const { handle, testId, ...rest } = this.data[kind];
    const value = testId ? { ...rest, testId, handle: null } : { ...rest, handle };
    return store?.write({ put: { meta: [{ key: kind, value }] } })
      .catch((err) => console.warn("pod-player: extras save failed", err));
  }

  // A read that finds no file of this kind keeps what is stored. With nothing stored, the
  // folder is still recorded, so its row is there to rescan.
  async #scan(kind, handle, name, generation = this.generation[kind]) {
    const entries = [];
    let result;
    try {
      await this.#walk(handle, KINDS[kind].extension, entries);
      entries.sort((a, b) => (a.name < b.name ? -1 : 1));
      result = await this.#read(kind, entries.map(({ entry }) => () => entry.getFile()));
    } catch (err) {
      console.warn("pod-player: extras folder failed", err?.name ?? err);
      return;
    }
    if (generation !== this.generation[kind] || (!entries.length && this.data[kind])) return;
    await this.#store(kind, { name, handle, testId: handle.testId, scannedAt: Date.now(), ...result });
  }

  link(kind, handle) { return this.#scan(kind, handle, handle.name); }

  async fromFiles(kind, files) {
    const generation = this.generation[kind];
    const wanted = files.filter((file) => !file.name.startsWith(".") && file.name.toLowerCase().endsWith(KINDS[kind].extension));
    if (!wanted.length) return;
    let result;
    try {
      result = await this.#read(kind, wanted.map((file) => () => file));
    } catch (err) {
      console.warn("pod-player: extras file failed", err?.name ?? err);
      return;
    }
    if (generation !== this.generation[kind]) return;
    await this.#store(kind, { name: "", handle: null, scannedAt: Date.now(), ...result });
  }

  // Must be called inside a press. The generation is read now, so that a Remove during the
  // permission prompt stays final.
  rescan(kind) {
    const { handle, name } = this.data[kind];
    const generation = this.generation[kind];
    return Promise.resolve(handle.requestPermission({ mode: "read" })).then((state) => {
      if (state === "granted") return this.#scan(kind, handle, name, generation);
      return undefined;
    }, (err) => console.warn("pod-player: permission request failed", err?.name ?? err));
  }

  remove(kind) {
    this.data[kind] = null;
    this.generation[kind] += 1;
    this.#changed();
    return this.device.importer?.store?.write({ remove: { meta: [kind] } })
      .catch((err) => console.warn("pod-player: extras removal failed", err));
  }

  stop() { for (const kind of Object.keys(KINDS)) this.generation[kind] += 1; }

  // Rows

  #line(key) {
    return { id: key, kind: "info", text: this.device.strings.t(key), value: null, center: true, help: true };
  }

  // The last row of each list: the folder, or the Add row while there is nothing to rescan.
  #lastRow(kind, help) {
    const s = this.device.strings;
    const { add, folder } = KINDS[kind];
    if (this.data[kind]?.handle) {
      return { id: folder, kind: "navigate", text: s.t(folder), value: null, target: { key: "extraFolder", ctx: kind }, help };
    }
    return { id: add, kind: "action", run: () => this.pick(kind), text: s.t(add), value: null, center: help, help };
  }

  #list(kind, rows, noneKey) {
    if (rows.length) return [...rows, this.#lastRow(kind, false)];
    return [this.#line(noneKey), this.#lastRow(kind, true)];
  }

  contactRows() {
    const cards = this.data.contacts?.items ?? [];
    const rows = cards.map((card) => ({ id: card.id, kind: "navigate", text: card.name, value: null, target: { key: "contact", ctx: card.id, card } }));
    return this.#list("contacts", rows, "noContactsYet");
  }

  #upcoming() {
    const day = new Date().toDateString();
    if (this.expanded?.day !== day) this.expanded = { day, list: upcoming(this.data.calendar?.items ?? []) };
    return this.expanded.list;
  }

  eventRows() {
    const s = this.device.strings;
    const rows = this.#upcoming().map((event) => {
      const id = `${event.at}|${event.title}`;
      return { id, kind: "navigate", text: event.title || s.t("untitled"), value: s.shortDate(event.at), target: { key: "event", ctx: id, event } };
    });
    return this.#list("calendar", rows, this.data.calendar ? "noUpcoming" : "noEventsYet");
  }

  folderRows(kind) {
    const s = this.device.strings;
    const { skipped } = this.data[kind] ?? {};
    const rows = [
      { id: "rescan", kind: "action", run: () => this.rescan(kind), pop: true, text: s.t("rescan"), value: null },
      { id: "remove", kind: "action", run: () => this.remove(kind), pop: true, text: s.t("remove"), value: null },
      { id: "cancel", kind: "cancel", text: s.t("cancel"), value: null },
    ];
    if (skipped) rows.push({ id: "skipped", kind: "info", text: s.t("skipped"), value: s.number(skipped) });
    return rows;
  }
}
