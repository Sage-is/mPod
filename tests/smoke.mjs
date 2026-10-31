import { boot, driver, sleep, T } from "./h.mjs";

const { page, close, logs } = await boot();
const d = driver(page);
const t = new T();
try {
  t.eq("boot screen first", (await d.state()).view, "loading");
  await sleep(2200);
  const s = await d.state();
  t.eq("menu after boot", [s.view, s.title, s.rows.length], ["list", "Pod", 4]);
  t.eq("wheel at harness scale", (await d.rect()).width, 262.5);
  await d.shot("root");
  t.eq("console clean", logs, []);
} catch (e) {
  t.crash(e);
} finally {
  t.done();
  await close();
  process.exit(t.exitCode);
}
