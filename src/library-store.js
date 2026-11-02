const NAME = "mpod";
const VERSION = 1;
const STORES = { folders: "id", tracks: "id", playlists: "id", meta: "key" };
const NOT_CLEARED = ["contacts", "calendar"];

// Spec 41: a window that lost the lock writes nothing more.
let frozen = false;
export const freezeStore = () => { frozen = true; };

const done = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

class LibraryStore {
  constructor(db) {
    this.db = db;
    db.onversionchange = () => db.close();
  }

  async load() {
    const names = Object.keys(STORES);
    const tx = this.db.transaction(names);
    const [folders, tracks, playlists, meta] = await Promise.all(names.map((n) => done(tx.objectStore(n).getAll())));
    return { folders, tracks, playlists, meta: Object.fromEntries(meta.map((m) => [m.key, m.value])) };
  }

  // One transaction per call: { put: {store: [records]}, remove: {store: [keys]} }
  // Async, so that a connection closed by another tab rejects and does not throw (44).
  async write({ put = {}, remove = {} }) {
    const names = [...new Set([...Object.keys(put), ...Object.keys(remove)])];
    if (frozen || !names.length) return Promise.resolve();
    const tx = this.db.transaction(names, "readwrite");
    for (const [store, records] of Object.entries(put)) {
      const os = tx.objectStore(store);
      for (const record of records) os.put(record);
    }
    for (const [store, keys] of Object.entries(remove)) {
      const os = tx.objectStore(store);
      for (const key of keys) os.delete(key);
    }
    return finished(tx);
  }

  async clear() {
    if (frozen) return Promise.resolve();
    const names = Object.keys(STORES);
    const tx = this.db.transaction(names, "readwrite");
    for (const name of names) if (name !== "meta") tx.objectStore(name).clear();
    const meta = tx.objectStore("meta");
    meta.getAllKeys().onsuccess = (e) => {
      for (const key of e.target.result) if (!NOT_CLEARED.includes(key)) meta.delete(key);
    };
    return finished(tx);
  }
}

export async function openStore() {
  try {
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(STORES)) request.result.createObjectStore(name, { keyPath });
    };
    return new LibraryStore(await done(request));
  } catch (err) {
    console.warn("pod-player: library store unavailable", err?.name ?? err);
    return null;
  }
}
