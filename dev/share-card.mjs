// Renders dev/share-card.html to share-card.png, the 1200×630 image link previews show.
//   make it_run, then: node dev/share-card.mjs [http://127.0.0.1:8080]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep, workDir } from "./cdp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] || "http://127.0.0.1:8080";
const { browser, close } = await launch({ port: 9562, profile: join(workDir(root), "share-card-profile") });
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/dev/share-card.html` });
  await sleep(3500); // past the device's boot gate and the font load
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(root, "share-card.png"), Buffer.from(data, "base64"));
  console.log("share-card.png written");
} finally {
  await close();
}
