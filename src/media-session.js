import { embeddedArt, scaleArt } from "./art.js";
import { clamp } from "./util.js";

const PLACEHOLDER = new URL("../icons/icon-512.png", import.meta.url).href;
const SEEK_STEP = 10;
const ART_CACHE = 50;
const LIVE_URLS = 2;

export class MediaControls {
  song = null;
  state = null;
  positionKey = null;
  token = 0;
  art = new Map();
  urls = [];

  constructor(device) {
    this.device = device;
    this.session = navigator.mediaSession ?? null;
    this.onVisible = () => { if (document.visibilityState === "visible" && device.playback.playing) device.graph?.unlock(); };
  }

  start() {
    document.addEventListener("visibilitychange", this.onVisible);
    if (!this.session) return;
    const d = this.device;
    const pb = d.playback;
    const act = (fn) => (details) => {
      d.graph?.unlock();
      d.activity();
      fn(details);
    };
    const skip = (button) => act(() => {
      d.modes.exitScrub();
      d.press(button);
    });
    const seek = (t, fast) => {
      const { duration } = pb;
      if (!pb.loaded || !(duration > 0)) return;
      pb.seek(clamp(t, 0, duration), pb.trackId, fast);
    };
    this.actions = {
      play: act(() => { if (!pb.playing && !pb.starting) d.press("play"); }),
      pause: act(() => { if (pb.playing || pb.starting) d.press("play"); }),
      previoustrack: skip("back"),
      nexttrack: skip("forward"),
      seekbackward: act(() => seek(pb.time - SEEK_STEP, false)),
      seekforward: act(() => seek(pb.time + SEEK_STEP, false)),
      seekto: act((e) => seek(e.seekTime, !!e.fastSeek)),
    };
    for (const [name, handler] of Object.entries(this.actions)) this.#register(name, handler);
  }

  #register(name, handler) {
    try {
      this.session.setActionHandler(name, handler);
    } catch { /* a browser may refuse an action */ }
  }

  stop() {
    document.removeEventListener("visibilitychange", this.onVisible);
    this.token += 1;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    if (!this.session) return;
    for (const name of Object.keys(this.actions ?? {})) this.#register(name, null);
    this.session.metadata = null;
    this.session.playbackState = "none";
  }

  // The context dropped out underneath a playing track, so the device must say so.
  suspended() {
    const { playback: pb } = this.device;
    if (pb.playing) pb.pause();
  }

  sync(force = false) {
    if (!this.session) return;
    const pb = this.device.playback;
    const song = pb.song;
    if (song !== this.song) {
      this.song = song;
      this.#publish(song);
    }
    const state = !song ? "none" : pb.playing || pb.starting ? "playing" : "paused";
    if (state !== this.state) {
      this.state = state;
      this.session.playbackState = state;
    }
    this.#position(force);
  }

  // The title goes out at once, and artwork follows when ready. The token stops a slow
  // read from dressing a later track in earlier art.
  #publish(song) {
    const token = ++this.token;
    if (!song) {
      this.session.metadata = null;
      return;
    }
    const cached = this.art.get(song.id);
    this.#metadata(song, cached ? this.#urlOf(cached) : null);
    if (!song.imported || this.art.has(song.id)) return;
    this.#loadArt(song).then((scaled) => {
      this.#remember(song.id, scaled);
      if (scaled && token === this.token) this.#metadata(song, this.#urlOf(scaled));
    });
  }

  #metadata(song, url) {
    const artwork = url
      ? [{ src: url, sizes: "512x512", type: "image/jpeg" }]
      : [{ src: PLACEHOLDER, sizes: "512x512", type: "image/png" }];
    this.session.metadata = new MediaMetadata({
      title: song.name ?? "", artist: song.artistName ?? "", album: song.albumName ?? "", artwork,
    });
  }

  async #loadArt(song) {
    const { importer } = this.device;
    if (!importer) return null;
    const tries = [
      async () => (song.hasArt ? embeddedArt(await importer.fileOf(song)) : null),
      () => importer.folderImage(song),
    ];
    for (const find of tries) {
      try {
        const source = await find();
        if (source) return await scaleArt(source);
      } catch { /* try the next source */ }
    }
    return null;
  }

  #remember(id, scaled) {
    this.art.delete(id);
    this.art.set(id, scaled);
    if (this.art.size > ART_CACHE) this.art.delete(this.art.keys().next().value);
  }

  // The browser fetches artwork after a delay, so a URL must outlive its publish.
  #urlOf(scaled) {
    const url = URL.createObjectURL(scaled);
    this.urls.push(url);
    while (this.urls.length > LIVE_URLS) URL.revokeObjectURL(this.urls.shift());
    return url;
  }

  #position(force) {
    const pb = this.device.playback;
    const { duration } = pb;
    const usable = pb.loaded && Number.isFinite(duration) && duration > 0;
    const rate = pb.displayChannel?.el.playbackRate || 1;
    const key = usable ? `${pb.song?.id}|${duration}|${pb.paused}|${rate}` : "";
    if (key === this.positionKey && !force) return;
    this.positionKey = key;
    try {
      if (usable) this.session.setPositionState({ duration, playbackRate: rate, position: clamp(pb.time, 0, duration) });
      else this.session.setPositionState();
    } catch (err) {
      console.warn("pod-player: position state refused", err);
    }
  }
}
