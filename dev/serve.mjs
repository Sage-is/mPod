// Local dev server for the player and its fixtures.
//   node dev/serve.mjs [port]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] ?? 8431);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wav": "audio/wav", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml" };

function resolve(path) {
  if (path === "/") return join(root, "dev/host.html");
  if (path.startsWith("/fixtures/") || path === "/index.html" || path.startsWith("/src/") || path.startsWith("/dev/")) return join(root, normalize(path));
  return null;
}

createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = resolve(path);
  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  const size = statSync(file).size;
  const headers = { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`dev server on http://127.0.0.1:${port}`));
