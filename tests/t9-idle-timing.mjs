// Measures the scrub idle timer by polling, so a slow machine cannot fake a pass or a failure.
import { boot, driver, sleep, T } from "./h.mjs";

const { page, close, logs } = await boot();
const d = driver(page);
const t = new T();
const np = async () => (await d.state()).nowPlaying;
const runs = Number(process.argv[2] ?? 4);
try {
  await d.fresh();
  await d.rotate(32); await d.press("play"); await sleep(300); await d.press("play"); await sleep(50);
  for (let i = 0; i < runs; i++) {
    await d.press("select");
    t.eq(`run ${i + 1} entered scrub`, (await np()).mode, "scrub");
    const ms = await d.timed(async () => (await np()).mode !== "scrub", 9000);
    t.ok(`run ${i + 1} left scrub about 5 s in (${ms} ms)`, ms > 4600 && ms < 5800, ms);
    await sleep(100);
  }
  t.eq("page in front", await page.evaluate("document.visibilityState"), "visible");
  t.eq("console clean", logs, []);
} catch (e) {
  t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
