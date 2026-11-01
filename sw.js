importScripts("sw-precache.js");

const { version, files } = self.MPOD_PRECACHE;
const PREFIX = "mpod-";
const CACHE = `${PREFIX}${version}`;
const NAVIGATION_WAIT = 3000;
const scope = self.registration.scope;
const page = new URL("index.html", scope).href;
const precached = new Set(files.map((file) => new URL(file, scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(files.map((file) => new Request(new URL(file, scope), { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)),
  )));
});

async function cachedPage() {
  const cache = await caches.open(CACHE);
  return cache.match(page);
}

async function navigate(request) {
  const late = new Promise((resolve) => { setTimeout(resolve, NAVIGATION_WAIT, null); });
  try {
    const answer = await Promise.race([fetch(request), late]);
    if (answer) return answer;
  } catch { /* offline: the cached page answers */ }
  // The page's paths are relative to the scope, so a deeper URL has to land there first.
  if (request.url !== scope && request.url !== page) return Response.redirect(scope, 302);
  return (await cachedPage()) ?? fetch(request);
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
}

// Only the app's own precached files are answered. Everything else, imported music
// and object URLs included, never reaches a cache.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  if (request.mode === "navigate") event.respondWith(navigate(request));
  else if (precached.has(request.url.split(/[?#]/)[0])) event.respondWith(fromCache(request));
});
