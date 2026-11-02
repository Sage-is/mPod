import { playOrder, seeded, shuffled } from "./album-order.js";
import { refOf } from "./track-library.js";

const SAVE_EVERY = 5000;
const refFor = (song) => refOf(song.folderId, song.path);

// Says whether a list is still the one a queue started from, without storing the list.
function listKey(songs) {
  let hash = 0;
  for (const song of songs) {
    for (const c of refFor(song)) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  }
  return `${songs.length}:${hash}`;
}

// Specs 36 and 42: where the music was, so that a new start finds it paused at the same place.
// What the queue is goes in once, when it starts. The timer writes only the track and position.
export class Resume {
  everyMs = SAVE_EVERY;
  timer = 0;
  stopped = false;
  held = false;
  queueSaved = -1;
  place = null;

  constructor(device) { this.device = device; }

  get #store() { return this.stopped ? null : this.device.importer?.store ?? null; }

  // A parked track in a waiting folder: only a press can ask for it.
  get waiting() {
    const { importer, playback: pb } = this.device;
    return !!pb.parked && !!importer?.waiting.has(pb.song?.folderId);
  }

  // Spec 45: the stored place moves once a track has connected. Until then only a parked place,
  // which has not moved, is true. A failed play() never connects, so it leaves the place alone.
  // Spec 46: a track that has left the library writes nothing more.
  get #placed() {
    const pb = this.device.playback;
    return !pb.song?.left && (pb.connected || !!pb.parked);
  }

  // From every change in playback.
  sync() {
    const pb = this.device.playback;
    if (pb.queue.length && !pb.loading && this.#placed && pb.orderVersion !== this.queueSaved) this.#saveQueue();
    if (pb.playing) {
      if (!this.timer) this.timer = setInterval(() => this.save(), this.everyMs);
      return;
    }
    clearInterval(this.timer);
    this.timer = 0;
    if (!pb.queue.length) this.#forget();
    else if (!pb.loading && pb.connected && !pb.parked && this.#moved) this.save();
  }

  // Spec 43: a paused seek or track change is stored at once, as a pause is.
  get #moved() {
    const pb = this.device.playback;
    return !!pb.song && (this.place?.track !== refFor(pb.song) || this.place.time !== pb.time);
  }

  #saveQueue() {
    const store = this.#store;
    const { nav, playback: pb } = this.device;
    if (!store || !pb.song?.stored) return;
    this.queueSaved = pb.orderVersion;
    this.held = true;
    const { key, ctx, titleKey } = nav.source?.entry ?? {};
    const { built, queue, queueSeed } = pb;
    const value = {
      source: key ? { key, ctx, titleKey } : null,
      list: listKey(key ? nav.songsOf(nav.source.entry) : []),
      queueSeed,
      built: built && { ...built, lead: built.lead.map((i) => refFor(queue[i])) },
    };
    store.write({ put: { meta: [{ key: "resumeQueue", value }] } })
      .catch((err) => console.warn("pod-player: resume save failed", err));
    this.save();
  }

  save() {
    const store = this.#store;
    const pb = this.device.playback;
    const { song } = pb;
    if (!store || !song?.stored || !this.#placed) return Promise.resolve();
    this.held = true;
    this.place = { track: refFor(song), time: pb.time };
    return store.write({ put: { meta: [{ key: "resume", value: this.place }] } })
      .catch((err) => console.warn("pod-player: resume save failed", err));
  }

  #forget() {
    if (!this.held) return;
    this.held = false;
    this.queueSaved = -1;
    this.#store?.write({ remove: { meta: ["resume", "resumeQueue"] } })
      .catch((err) => console.warn("pod-player: resume clear failed", err));
  }

  // The same list gives the same order, from its seed. A changed list cannot, so the resumed
  // track goes first. A track is gone only once it has left the stored index.
  async restore() {
    const { importer, nav, playback: pb } = this.device;
    const { resume: place, resumeQueue: saved } = importer.storedMeta;
    if (!place || pb.queue.length) return;
    this.held = true;
    this.place = place;
    await importer.permissionsChecked;
    const song = importer.songAt(place.track);
    if (!song) {
      this.#forget();
      return;
    }
    const source = saved?.source ?? null;
    const list = source ? nav.songsOf(source) : [];
    const same = saved?.list === listKey(list) && list.includes(song);
    const mixed = saved?.queueSeed ? shuffled(list, seeded(saved.queueSeed)) : list;
    const queue = mixed.includes(song) ? mixed : [song, ...mixed];
    const index = queue.indexOf(song);
    let built = null;
    let order;
    if (saved?.built) {
      const lead = same ? saved.built.lead.map((ref) => queue.findIndex((item) => refFor(item) === ref)) : [index];
      built = { ...saved.built, lead };
      order = playOrder(queue, built.mode, lead, seeded(built.seed));
    } else {
      order = queue.map((_, i) => (same ? i : (i + index) % queue.length));
    }
    if (source) nav.setSource(source);
    pb.park({ queue, order, index, time: place.time, built, queueSeed: saved?.queueSeed ?? null });
    if (!importer.waiting.has(song.folderId)) pb.unpark();
  }

  // Reconnect brought back the folder a parked track waits on.
  folderBack(folder) {
    const pb = this.device.playback;
    if (!pb.parked || pb.song?.folderId !== folder.id) return;
    pb.unpark();
    this.device.media?.publishAgain();
  }

  // A rescan took the parked track out of the index, so now it is gone.
  dropped(gone) {
    const pb = this.device.playback;
    if (pb.parked && gone.has(pb.song)) pb.clear();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = 0;
  }
}
