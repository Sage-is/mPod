// Spec 38: Contacts and Calendar on the device, through the fake handles of 32.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, boot, sleep, T, waitFor } from "./h.mjs";
import { FAKES, file, P, product, ROOT } from "./product.mjs";

const { browser, page, close, logs } = await boot();
const a = product(page);
const { d } = a;
const t = new T();
const only = process.argv[2];
const section = async (name, fn) => {
  if (only && name !== only) return;
  console.log("# " + name);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKES + PICKER });
  await fn();
  await page.resetSection();
};
const IMPORT = BASE + "?import";
const PICKER = `
window.__picks = [];
window.__picked = "C";
window.showDirectoryPicker = (options) => {
  window.__picks.push({ options, active: navigator.userActivation.isActive });
  return Promise.resolve(window.__fake(window.__picked));
};`;

const card = (full, family, given, ...rest) => ["BEGIN:VCARD", "VERSION:3.0", `FN:${full}`, `N:${family};${given};;;`, ...rest, "END:VCARD"].join("\r\n");
const LONG = "1234 The Very Long Road Name That Never Seems To End At All";
const CARDS = {
  "people.vcf": file({ text: [card("Grace Hopper", "Hopper", "Grace", "ORG:Navy", "TEL:555 0100", "TEL:555 0101", "EMAIL:grace@example.invalid", `ADR:;;${LONG};Arlington;VA;22201;`), card("Ada Lovelace", "Lovelace", "Ada")].join("\r\n") }),
  deep: { er: { "UPPER.VCF": file({ text: card("Alan Turing", "Turing", "Alan") }) } },
  "notes.txt": file({ text: "not a card" }),
  "acme.vcf": file({ text: "BEGIN:VCARD\r\nVERSION:3.0\r\nORG:Acme\r\nEND:VCARD" }),
};
const WITH_BROKEN = { ...CARDS, "broken.vcf": file({ text: "nothing to see" }) };

const pad = (n) => String(n).padStart(2, "0");
const ahead = (days) => {
  const when = new Date();
  when.setDate(when.getDate() + days);
  return when;
};
const ymd = (days) => { const w = ahead(days); return `${w.getFullYear()}${pad(w.getMonth() + 1)}${pad(w.getDate())}`; };
const event = (...body) => ["BEGIN:VEVENT", ...body, "END:VEVENT"].join("\r\n");
const calendar = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
const EVENTS = {
  "main.ics": file({ text: calendar(
    event("SUMMARY:Later", `DTSTART:${ymd(3)}T100000`, `DTEND:${ymd(3)}T113000`, "LOCATION:The Hall"),
    event("SUMMARY:Sooner", `DTSTART;VALUE=DATE:${ymd(1)}`),
    event("SUMMARY:Past", `DTSTART:${ymd(-3)}T100000`),
    event("SUMMARY:Far", `DTSTART:${ymd(90)}T100000`),
  ) }),
  sub: { "REPEAT.ICS": file({ text: calendar(event("SUMMARY:Weekly", `DTSTART:${ymd(2)}T090000`, "RRULE:FREQ=DAILY;INTERVAL=7;COUNT=3", `EXDATE:${ymd(9)}T090000`)) }) },
};
const toContacts = async () => { await a.focusRing(); await a.pick("Extras"); await a.pick("Contacts"); };
const toCalendar = async () => { await a.focusRing(); await a.pick("Extras"); await a.pick("Calendar"); };
const linkContacts = async (tree = CARDS) => {
  await a.setTree("C", tree);
  await page.evaluate(`${P}.extras.link("contacts",__fake("C")).then(()=>1)`);
};
const linkCalendar = async (tree = EVENTS) => {
  await a.setTree("E", tree);
  await page.evaluate(`${P}.extras.link("calendar",__fake("E")).then(()=>1)`);
};
const shortDate = (when) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(when);

try {
  await section("empty", async () => {
    await a.open();
    await a.focusRing();
    await a.pick("Extras");
    t.eq("Extras opens both", [(await a.state()).title, await a.titles()], ["Extras", ["Contacts", "Calendar"]]);
    await a.pick("Contacts");
    let s = await a.state();
    t.eq("no folder yet: Contacts", [s.title, s.rows.map((r) => [r.text, r.selected])], ["Contacts", [["No contacts yet", false], ["Add Contacts Folder", true]]]);
    await d.key("ArrowUp");
    t.eq("one selectable row", (await a.state()).rows[1].selected, true);
    await a.back();
    await a.pick("Calendar");
    s = await a.state();
    t.eq("no folder yet: Calendar", [s.title, s.rows.map((r) => [r.text, r.selected])], ["Calendar", [["No events yet", false], ["Add Calendar Folder", true]]]);
    await d.shot("extras-empty");
  });

  await section("pick", async () => {
    await a.open();
    await a.setTree("C", CARDS);
    await toContacts();
    await d.press("select");
    await sleep(200);
    t.eq("the picker opens in read mode, inside the press", await page.evaluate("window.__picks"), [{ options: { mode: "read" }, active: true }]);
    t.eq("every depth, any case, by family then given, the last row is the folder", await a.titles(), ["Acme", "Grace Hopper", "Ada Lovelace", "Alan Turing", "Contacts Folder"]);
    t.eq("first row selected", (await a.state()).rows.findIndex((r) => r.selected), 0);
    t.eq("separate from music", await page.evaluate(`${P}.importer.folders.size`), 0);
    await d.shot("extras-contacts");

    console.log("# one contact");
    await a.pick("Grace Hopper");
    const s = await a.state();
    t.eq("a list titled with the name, in order", [s.title, s.rows.map((r) => r.text)], ["Grace Hopper", ["Navy", "555 0100", "555 0101", "grace@example.invalid", `${LONG}, Arlington, VA, 22201`]]);
    t.eq("no arrows", s.rows.some((r) => r.arrow), false);
    await d.press("select");
    await sleep(100);
    t.eq("rows do nothing when selected", (await a.state()).title, "Grace Hopper");
    for (let i = 0; i < 4; i++) await d.key("ArrowDown");
    await sleep(120);
    t.ok("the selected row scrolls as a marquee", await waitFor(() => page.evaluate(`${ROOT}.querySelector('.row.selected .marquee.overflow') !== null`), 1000));
    const anim = await page.evaluate(`(()=>{const k=${ROOT}.querySelector('.row.selected .marquee-track');const a=k.getAnimations()[0];return [!!a,k.children.length,a?.effect.getTiming().delay]})()`);
    t.eq("with the marquee's own animation", anim, [true, 3, 2000]);
    await d.shot("extras-marquee");
    await d.key("ArrowUp");
    await sleep(60);
    t.eq("only the selected row", await page.evaluate(`${ROOT}.querySelectorAll('.marquee').length`), 1);
    t.eq("the row it left shows its text again", await page.evaluate(`${ROOT}.querySelectorAll('.row')[4].textContent`), `${LONG}, Arlington, VA, 22201`);
    await d.key("ArrowDown");
    await a.back();
    t.eq("back on the list, on that row", (await a.state()).rows.find((r) => r.selected).text, "Grace Hopper");
    t.eq("console clean", logs, []);
  });

  await section("folder", async () => {
    await a.open();
    await linkContacts(WITH_BROKEN);
    await toContacts();
    await a.pick("Contacts Folder");
    let s = await a.state();
    t.eq("the folder row's choices, Cancel preselected", [s.title, s.rows.map((r) => [r.text, r.value, r.selected])], ["Contacts Folder", [["Rescan", null, false], ["Remove", null, false], ["Cancel", null, true], ["Skipped", "1", false]]]);
    await d.press("select"); await sleep(280);
    t.eq("Cancel changes nothing", [(await a.state()).title, (await a.titles()).length], ["Contacts", 5]);

    console.log("# Rescan");
    await page.evaluate(`window.__tree.C["new.vcf"]={file:true,text:${JSON.stringify(card("Zed New", "New", "Zed"))}};delete window.__tree.C["broken.vcf"];__saveTree();0`);
    await a.pick("Contacts Folder");
    await a.pick("Rescan");
    await sleep(200);
    t.eq("Rescan asks inside the press", await page.evaluate("window.__requests"), [{ testId: "C", active: true }]);
    t.eq("and reads the folder", await a.titles(), ["Acme", "Grace Hopper", "Ada Lovelace", "Zed New", "Alan Turing", "Contacts Folder"]);
    await a.pick("Contacts Folder");
    t.eq("no Skipped row once nothing failed", await a.titles(), ["Rescan", "Remove", "Cancel"]);
    await d.press("menu"); await sleep(280);

    console.log("# refused");
    await page.evaluate(`window.__answer="denied";window.__tree.C["more.vcf"]={file:true,text:${JSON.stringify(card("Late Comer", "Comer", "Late"))}};__saveTree();0`);
    await a.pick("Contacts Folder");
    await a.pick("Rescan");
    await sleep(200);
    t.eq("refused: the list stands", (await a.titles()).length, 6);
    await page.evaluate("window.__answer='granted';0");

    console.log("# errors keep what is stored");
    const stored = (await a.meta()).contacts.items.length;
    await page.evaluate(`window.__tree.C["locked.vcf"]={file:true,refused:true};window.__tree.C["zz.vcf"]={file:true,text:${JSON.stringify(card("Zz Last", "Last", "Zz"))}};__saveTree();0`);
    await a.pick("Contacts Folder");
    await a.pick("Rescan");
    await sleep(200);
    t.eq("a refusal halfway through a read keeps it all", [(await a.titles()).length, (await a.meta()).contacts.items.length], [6, stored]);
    logs.length = 0;
    await page.evaluate(`delete window.__tree.C["locked.vcf"];delete window.__tree.C["zz.vcf"];delete window.__tree.C["more.vcf"];__saveTree();window.__gone=["C"];0`);
    await a.pick("Contacts Folder");
    await a.pick("Rescan");
    await sleep(200);
    t.eq("a folder that is gone keeps it too", (await a.titles()).length, 6);
    logs.length = 0;
    await page.evaluate("window.__gone=[];0");

    console.log("# Remove");
    await a.pick("Contacts Folder");
    await d.key("ArrowUp");
    await d.key("ArrowRight");
    await sleep(280);
    s = await a.state();
    t.eq("Remove forgets it", [s.title, s.rows.map((r) => r.text)], ["Contacts", ["No contacts yet", "Add Contacts Folder"]]);
    t.eq("the stored data goes", (await a.meta()).contacts, undefined);
    t.ok("and it never touches disk", await page.evaluate(`"people.vcf" in window.__tree.C && "new.vcf" in window.__tree.C`));
    await a.reopen();
    await toContacts();
    t.eq("gone after a reload", await a.titles(), ["No contacts yet", "Add Contacts Folder"]);
  });

  await section("stored", async () => {
    await a.open();
    await linkContacts();
    await linkCalendar();
    const handles = await a.meta();
    t.eq("stored with the handle's seam", [handles.contacts.testId, handles.calendar.testId], ["C", "E"]);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__permission='prompt';" });
    await a.reopen();
    await sleep(200);
    t.eq("start never reads these folders", await page.evaluate("[window.__walks ?? 0, window.__requests.length]"), [0, 0]);
    t.eq("no Reconnect row for them", (await a.titles())[0], "Playlists");
    await toContacts();
    t.eq("the screen opens at once, with no permission", (await a.titles()).length, 5);
    await a.pick("Ada Lovelace");
    t.eq("the details are stored too", await a.titles(), []);
    await page.send("Network.enable").catch(() => {});

    console.log("# Clear Imported and Reset All Settings leave these alone");
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    await a.pick("Settings");
    await a.pick("Import");
    await a.pick("Clear Imported");
    await sleep(200);
    await d.press("menu"); await sleep(280);
    await a.pick("Reset All Settings");
    await d.key("ArrowDown"); await d.key("ArrowRight"); await sleep(280);
    const meta = await a.meta();
    t.eq("still stored, less the event already over (44)", [meta.contacts?.items.length, meta.calendar?.items.length], [4, 4]);
    await a.reopen();
    await toContacts();
    t.eq("still listed", (await a.titles()).length, 5);
  });

  await section("limits", async () => {
    await a.open();
    const cards = Array.from({ length: 1005 }, (_, i) => card(`Person ${i}`, "Family", String(i).padStart(4, "0"))).join("\r\n");
    await linkContacts({ "many.vcf": file({ text: cards }), "huge.vcf": file({ size: 5 * 1024 * 1024 + 1 }) });
    await toContacts();
    t.eq("1,000 contacts", (await a.titles()).length, 1001);
    await a.pick("Contacts Folder");
    t.eq("Skipped shows any skipped count: past the limit, and the 5 MB file", await a.value("Skipped"), "6");
    await d.press("menu"); await sleep(280);
    await d.press("menu"); await sleep(280);
    const events = Array.from({ length: 2003 }, (_, i) => event(`SUMMARY:E${i}`, `DTSTART:${ymd(1)}T100000`)).join("\r\n");
    await linkCalendar({ "many.ics": file({ text: calendar(events) }) });
    await a.pick("Calendar");
    t.eq("2,000 events", (await a.titles()).length, 2001);
    await a.pick("Calendar Folder");
    t.eq("the rest count as skipped", await a.value("Skipped"), "3");
  });

  await section("file-input", async () => {
    const dir = resolve("work/extras-input");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "deep"), { recursive: true });
    writeFileSync(join(dir, "one.vcf"), card("Ada Lovelace", "Lovelace", "Ada"));
    writeFileSync(join(dir, "deep/two.VCF"), card("Alan Turing", "Turing", "Alan"));
    writeFileSync(join(dir, "skip.txt"), "x");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker;" });
    await page.send("Page.enable");
    await page.send("DOM.enable");
    const opened = [];
    browser.on((m) => { if (m.method === "Page.fileChooserOpened") opened.push(m.params); });
    await page.send("Page.setInterceptFileChooserDialog", { enabled: true });
    await a.open();
    await toContacts();
    await d.press("select");
    t.ok("the file input opens inside the press", await waitFor(() => opened.length === 1, 1500));
    t.eq("for a whole folder", opened[0]?.mode, "selectMultiple");
    await page.send("DOM.setFileInputFiles", { backendNodeId: opened[0].backendNodeId, files: [dir] });
    await waitFor(async () => (await a.titles()).length === 3, 2000);
    t.eq("the Add row stays, and there is no rescan", await a.titles(), ["Ada Lovelace", "Alan Turing", "Add Contacts Folder"]);
    await a.reopen();
    await toContacts();
    t.eq("still stored after a reload", await a.titles(), ["Ada Lovelace", "Alan Turing", "Add Contacts Folder"]);
    await page.send("Page.setInterceptFileChooserDialog", { enabled: false });
    rmSync(dir, { recursive: true, force: true });
  });

  await section("calendar", async () => {
    await a.open();
    await a.setTree("E", EVENTS);
    await page.evaluate("window.__picked='E';0");
    await toCalendar();
    await d.press("select");
    await sleep(200);
    const s = await a.state();
    t.eq("by time, past and far left out, a repeat with an exclusion, the folder last", s.rows.map((r) => [r.text, r.value]), [
      ["Sooner", shortDate(ahead(1))], ["Weekly", shortDate(ahead(2))], ["Later", shortDate(ahead(3))], ["Weekly", shortDate(ahead(16))], ["Calendar Folder", null],
    ]);
    await d.shot("extras-calendar");

    console.log("# one event");
    await a.pick("Later");
    const when = ahead(3);
    const time = (h, m) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(when.getFullYear(), when.getMonth(), when.getDate(), h, m)).replace(/\s/g, " ");
    t.eq("title, full date, time range, location", await a.titles(), [
      "Later", new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(when), `${time(10, 0)} – ${time(11, 30)}`, "The Hall",
    ]);
    await d.press("select");
    await sleep(80);
    t.eq("rows do nothing when selected", (await a.state()).title, "Calendar");
    await a.back();
    await d.key("ArrowUp"); await d.key("ArrowUp");
    await d.key("ArrowRight"); await sleep(280);
    t.eq("all day, no location", (await a.titles()).slice(2), ["All Day"]);
    await a.back();

    console.log("# nothing ahead");
    await page.evaluate(`delete window.__tree.E["main.ics"];delete window.__tree.E.sub;window.__tree.E["old.ics"]={file:true,text:${JSON.stringify(calendar(event("SUMMARY:Gone", `DTSTART:${ymd(-30)}T100000`)))}};__saveTree();0`);
    await page.evaluate(`${P}.extras.rescan("calendar")`);
    await sleep(150);
    const none = await a.state();
    t.eq("the line, above the folder row", [none.rows.map((r) => r.text), none.rows.findIndex((r) => r.selected)], [["No upcoming events", "Calendar Folder"], 1]);
    await d.press("select"); await sleep(280);
    t.eq("which still opens", (await a.state()).title, "Calendar Folder");
    t.eq("console clean", logs, []);
  });

  await section("no-network", async () => {
    await a.open();
    await page.send("Network.enable");
    const urls = [];
    browser.on((m) => { if (m.method === "Network.requestWillBeSent") urls.push(m.params.request.url); });
    await linkContacts();
    await linkCalendar();
    await toCalendar();
    await a.pick("Later");
    await sleep(100);
    t.eq("nothing here uses the network", urls.filter((u) => !/^(blob|data):/.test(u) && !u.endsWith("/icons/favicon.png")), []);
  });

  await section("test-page", async () => {
    await page.goto(IMPORT);
    await sleep(2150);
    t.ok("no Extras on the test page", !(await a.titles()).includes("Extras"));
    t.eq("nothing built for it", await page.evaluate(`${P}.extras`), undefined);
  });
} catch (e) {
  console.log(logs.join("\n")); t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
