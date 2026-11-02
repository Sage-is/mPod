import { albumShuffle, newSeed, playOrder, seeded } from "./album-order.js";
import { Channel } from "./audio.js";

const FADE_SECONDS = 2;
const FLIP_AT = 1;
const RESTART_AFTER = 3;

const logRejection = (label) => (err) => {
  if (err?.name !== "AbortError" && err?.name !== "OpenFailed") console.warn(`pod-player: ${label}`, err);
};

// host: { graph, changed(), trackChanged(), queueChanged(), queueEnded({ids, index}), applyVolume() }
// Optional on host: files, opened(song), openFailed(song, cause, undecodable), watchMedia, mediaEvent(),
// durationKnown(song, seconds), after(seconds, fn), product, parkedWaits
export class Playback {
  queue = [];
  index = -1;
  position = 0;
  loading = false;
  paused = false;
  connected = false;
  trackId = 0;
  shuffle = false;
  repeat = "none";

  order = [];
  pos = 0;
  shownPos = 0;
  current = null;
  next = null;
  cross = null;
  fading = new Set();
  armed = false;
  startToken = 0;
  pendingPause = false;
  cancelStart = null;
  chain = Promise.resolve();
  unreadable = new Set();
  parked = null;
  orderVersion = 0;
  built = null;
  queueSeed = null;
  pausesAsked = 0;

  constructor(host) { this.host = host; }

  get song() { return this.queue[this.index] ?? null; }
  get loaded() { return this.connected && !!this.current; }
  get playing() { return this.loaded && !this.paused; }
  get starting() { return this.loading && !this.pendingPause; }
  get opening() { return !!this.queue.length && !this.loading && !this.connected && !this.paused; }
  // Spec 45: what the last press asked for, which the command chain may not have reached.
  get wanted() {
    if (!this.host.product) return this.playing || this.starting;
    return this.loading ? !this.pendingPause : !!this.queue.length && !this.paused;
  }
  // Whether Play/Pause acts on this track, and not on the selected row.
  get toggles() { return this.loaded || (!!this.host.product && (this.loading || this.opening || !!this.current)); }
  get displayChannel() { return this.cross ? this.cross.out : this.current; }

  get time() {
    if (this.parked) return this.parked.time;
    const ch = this.displayChannel;
    return this.connected && ch ? ch.el.currentTime : 0;
  }

  get duration() {
    const ch = this.displayChannel;
    const known = this.parked ? this.song?.duration ?? 0 : 0;
    if (!this.connected || !ch) return known;
    const d = ch.el.duration;
    return Number.isNaN(d) ? known : d;
  }

  #run(fn) {
    this.chain = this.chain.then(fn).catch(logRejection("playback command failed"));
    return this.chain;
  }

  // Spec 45: what was asked of one queue does nothing to the next.
  #forQueue(fn) {
    const token = this.startToken;
    return this.#run(() => (this.host.product && token !== this.startToken ? undefined : fn()));
  }

  // A new queue ends this wait, so that it waits for no file.
  #hold(work) {
    return Promise.race([work, new Promise((resolve) => { this.cancelStart = resolve; })]);
  }

  #make(pos) {
    const queueIndex = this.order[pos];
    const ch = new Channel(this.host.graph, this.queue[queueIndex], queueIndex, pos, this.host.files);
    const { product } = this.host;
    ch.ready?.then(() => { if (!product) this.host.opened?.(ch.song); }, (err) => this.#openFailed(ch, err));
    if (product) {
      // Spec 45: an element can read a file and still refuse it, so its metadata says it opened.
      ch.on("loadedmetadata", () => this.host.opened?.(ch.song));
      ch.on("error", () => this.#openFailed(ch));
    }
    ch.on("timeupdate", () => this.#onTime(ch));
    ch.on("durationchange", () => this.#onTime(ch));
    ch.on("ended", () => this.#onEnded(ch));
    if (this.host.watchMedia) {
      for (const type of ["durationchange", "play", "pause", "seeked", "ratechange"]) ch.on(type, () => this.#mediaEvent(ch, type));
    }
    return ch;
  }

  // Spec 43: a pause from any source wins over a file that is still opening. The channel stays
  // silent, and the first resume after that starts it. A pause cuts off a play() in progress with
  // an AbortError, so a Play that came after that pause has to ask again.
  async #play(ch) {
    if (!this.host.product) return ch.play();
    await ch.ready;
    while (!ch.dead && !this.paused && !this.pendingPause) {
      try {
        return await ch.el.play();
      } catch (err) {
        if (err?.name !== "AbortError") throw err;
      }
    }
    return undefined;
  }

  // Spec 45: after a failed play() nothing is still opening, so the first press of Play retries
  // (12). An element's error comes first, and the rejection after it is that same failure.
  #playFailed(ch, label) {
    return (err) => {
      const { product } = this.host;
      if (product && (ch.failed || ch.el.error)) return;
      logRejection(label)(err);
      if (!product || ch !== this.current) return;
      this.paused = true;
      this.#silence();
      this.host.changed();
    };
  }

  #silence() {
    this.current?.el.pause();
    for (const f of this.fading) f.channel.el.pause();
  }

  // A file that will not open is left out of this queue, and the queue moves on. On the product
  // page that includes a file the element refuses, which is reported with no err (45).
  #openFailed(ch, err) {
    if (ch.dead || ch.failed) return;
    ch.failed = true;
    if (ch.quiet) {
      this.#run(() => this.#closeParked(ch));
      return;
    }
    this.unreadable.add(ch.queueIndex);
    this.host.openFailed?.(ch.song, err?.cause, !err);
    this.#run(() => {
      if (ch.dead) return;
      if (ch === this.next) {
        ch.destroy();
        this.next = null;
        this.#prepareNext();
      } else if (ch === this.current) {
        const t = this.#adjacent(this.pos, 1);
        if (t === null) this.#endQueue();
        else this.#goTo(t);
      }
    });
  }

  // The system can pause an element for a phone call or another app.
  #mediaEvent(ch, type) {
    if (type === "durationchange" && Number.isFinite(ch.el.duration)) this.host.durationKnown?.(ch.song, ch.el.duration);
    if (type === "pause" && ch === this.current && this.connected && !this.paused && ch.el.paused && !ch.el.ended) {
      this.paused = true;
      for (const f of this.fading) f.channel.el.pause();
      this.host.changed();
    }
    if (ch === this.displayChannel) this.host.mediaEvent?.();
  }

  // On the product page, the seed is kept so that Resume can build this same order again.
  #shuffleOrder(lead) {
    const seed = this.host.product ? newSeed() : null;
    this.built = { mode: this.shuffle, lead, seed };
    return playOrder(this.queue, this.shuffle, lead, seed ? seeded(seed) : Math.random);
  }

  #buildOrder(index) {
    if (this.shuffle) {
      this.order = this.#shuffleOrder([index]);
      this.pos = this.shownPos = 0;
    } else {
      this.built = null;
      this.order = this.queue.map((_, i) => i);
      this.pos = this.shownPos = index;
    }
    this.orderVersion += 1;
  }

  #discard() {
    this.parked = null;
    this.current?.destroy();
    this.next?.destroy();
    this.current = this.next = this.cross = null;
    for (const f of this.fading) { clearTimeout(f.timer); f.channel.destroy(); }
    this.fading.clear();
    this.armed = false;
  }

  #firstIndex(songs) {
    if (!this.shuffle) return 0;
    return this.shuffle === "albums" ? albumShuffle(songs)[0] : Math.floor(Math.random() * songs.length);
  }

  // A queueSeed says the list is already in its own random order, which the Shuffle setting
  // leaves alone until it next changes.
  start(songs, index, queueSeed = null) {
    if (!songs.length) return;
    const at = index ?? this.#firstIndex(songs);
    const token = ++this.startToken;
    this.cancelStart?.();
    this.parked = null;
    this.queue = songs;
    this.queueSeed = queueSeed;
    this.unreadable = new Set();
    this.index = at;
    this.position = this.shuffle ? 1 : at + 1;
    this.loading = true;
    this.pendingPause = false;
    this.connected = false;
    this.paused = false;
    this.host.queueChanged();
    this.host.changed();
    this.#run(async () => {
      if (token !== this.startToken) return;
      this.#discard();
      if (queueSeed === null) {
        this.#buildOrder(at);
      } else {
        this.built = null;
        this.order = songs.map((_, i) => i);
        this.pos = this.shownPos = at;
        this.orderVersion += 1;
      }
      this.host.applyVolume();
      const ch = this.#make(this.pos);
      this.current = ch;
      try {
        await this.#hold(this.#play(ch));
        if (token !== this.startToken) return;
        ch.cutIn();
        this.armed = true;
        this.#connect();
      } catch (err) {
        if (token === this.startToken) this.#playFailed(ch, "play failed")(err);
      } finally {
        if (token === this.startToken) {
          this.cancelStart = null;
          this.loading = false;
          this.host.changed();
        }
      }
    });
  }

  // Spec 36: a queue comes back paused at its place. Nothing opens until unpark() or a press.
  park({ queue, order, index, time, built, queueSeed }) {
    this.queue = queue;
    this.order = order;
    this.built = built;
    this.queueSeed = queueSeed;
    this.index = index;
    this.pos = this.shownPos = order.indexOf(index);
    this.position = this.pos + 1;
    this.paused = true;
    this.parked = { time };
    this.orderVersion += 1;
    this.host.queueChanged();
    this.host.changed();
  }

  // quiet: nobody asked for this open, so a failure says nothing. The track stays parked,
  // and it is gone only if a rescan takes it out of the index.
  #openParked(quiet = false) {
    const { parked } = this;
    const ch = this.#make(this.pos);
    ch.quiet = quiet;
    this.current = ch;
    this.armed = true;
    ch.cutIn();
    ch.on("loadedmetadata", () => {
      if (this.parked !== parked) return;
      ch.el.currentTime = parked.time;
      this.parked = null;
      ch.quiet = false;
      this.#prepareNext();
      this.host.changed();
    });
  }

  #closeParked(ch) {
    if (ch !== this.current) return;
    ch.destroy();
    this.next?.destroy();
    this.current = this.next = null;
    this.connected = false;
    this.paused = true;
    this.host.changed();
  }

  unpark() {
    return this.#forQueue(() => {
      if (!this.parked || this.current) return;
      this.#openParked(true);
      this.#connect();
    });
  }

  #connect() {
    this.connected = true;
    this.trackId += 1;
    if (this.pendingPause) {
      this.pendingPause = false;
      this.paused = true;
      this.current.el.pause();
    }
    this.#prepareNext();
    this.host.changed();
  }

  #adjacent(pos, dir) {
    let p = pos;
    for (let tries = this.order.length; tries > 0; tries--) {
      p += dir;
      if (p < 0 || p >= this.order.length) {
        if (this.repeat !== "all") return null;
        p = dir > 0 ? 0 : this.order.length - 1;
      }
      if (!this.unreadable.has(this.order[p])) return p;
    }
    return null;
  }

  // A file left out of the queue is not tried again, even by Repeat One, or a track that keeps
  // failing would keep being made.
  #autoTarget() {
    const left = this.host.product && this.unreadable.has(this.order[this.pos]);
    return this.repeat === "one" && !left ? this.pos : this.#adjacent(this.pos, 1);
  }

  // A quiet open prepares nothing until its own file has opened (45).
  #prepareNext() {
    if (!this.current || this.current.quiet) return;
    const target = this.#autoTarget();
    const wanted = target === null ? null : this.order[target];
    if (this.next && this.next.queueIndex === wanted) {
      this.next.pos = target;
      return;
    }
    this.next?.destroy();
    this.next = target === null ? null : this.#make(target);
  }

  #onTime(ch) {
    if (this.cross?.inc === ch && ch.el.currentTime >= FLIP_AT) this.#showCross();
    if (ch === this.current) this.#checkFade();
    if (ch === this.displayChannel) this.host.changed();
  }

  // Spec 45: a paused track starts no fade. It stays armed, so Play carries on from here.
  #checkFade() {
    const ch = this.current;
    if (!this.armed || (this.host.product && (this.paused || !this.connected))) return;
    const d = ch.el.duration;
    if (!Number.isFinite(d) || d <= FADE_SECONDS || ch.el.currentTime < d - FADE_SECONDS) return;
    this.armed = false;
    if (this.next) this.#crossfade();
    else ch.fadeOut(FADE_SECONDS);
  }

  #onEnded(ch) {
    if (ch !== this.current) return;
    if (this.host.product && this.paused && this.next) return;
    if (this.next) this.#crossfade();
    else this.#endQueue();
  }

  #linger(channel, onDone) {
    const entry = { channel, timer: 0 };
    const finish = () => {
      if (!this.fading.delete(entry)) return;
      clearTimeout(entry.timer);
      channel.destroy();
      onDone?.();
    };
    entry.timer = setTimeout(finish, FADE_SECONDS * 1000);
    this.host.after?.(FADE_SECONDS, finish);
    this.fading.add(entry);
    return entry;
  }

  #crossfade() {
    this.#showCross();
    const out = this.current;
    const inc = this.next;
    this.next = null;
    const outPos = this.pos;
    this.current = inc;
    this.pos = inc.pos;
    this.armed = true;
    out.fadeOut(FADE_SECONDS);
    const entry = this.#linger(out, () => { if (this.cross?.out === out) this.#showCross(); });
    this.cross = { out, inc, outPos, entry };
    inc.fadeIn(FADE_SECONDS);
    if (!this.paused) this.#play(inc).catch(this.#playFailed(inc, "crossfade play failed"));
    this.#prepareNext();
  }

  #showCross() {
    if (!this.cross) return;
    this.cross = null;
    this.shownPos = this.pos;
    this.index = this.order[this.pos];
    this.position = this.pos + 1;
    this.trackId += 1;
    this.host.queueChanged();
    this.host.trackChanged();
    this.host.changed();
  }

  #undoCross() {
    const c = this.cross;
    if (!c) return;
    this.cross = null;
    clearTimeout(c.entry.timer);
    this.fading.delete(c.entry);
    c.inc.destroy();
    this.current = c.out;
    this.pos = c.outPos;
    c.out.cutIn();
    this.armed = true;
    this.#prepareNext();
  }

  #goTo(pos) {
    const reuse = this.next?.pos === pos && this.next.queueIndex === this.order[pos];
    const ready = reuse ? this.next : null;
    if (reuse) this.next = null;
    this.#discard();
    this.current = ready ?? this.#make(pos);
    this.pos = this.shownPos = pos;
    this.index = this.order[pos];
    this.position = pos + 1;
    this.armed = true;
    this.current.cutIn();
    const target = this.current;
    if (!this.paused) {
      this.#play(target).then(() => {
        if (!this.connected && this.current === target) this.#connect();
      }, this.#playFailed(target, "skip play failed"));
    }
    this.trackId += 1;
    this.#prepareNext();
    this.host.queueChanged();
    this.host.trackChanged();
    this.host.changed();
  }

  #restart() {
    if (!this.current) {
      this.#goTo(this.pos);
      return;
    }
    this.#undoCross();
    const ch = this.current;
    ch.el.currentTime = 0;
    ch.cutIn();
    this.armed = true;
    if (!this.paused && ch.el.paused) this.#play(ch).catch(this.#playFailed(ch, "restart play failed"));
    this.host.changed();
  }

  #endQueue() {
    const last = { ids: this.queue.map((s) => s.id), index: this.index };
    this.startToken += 1;
    this.cancelStart?.();
    this.#discard();
    this.queue = [];
    this.order = [];
    this.index = -1;
    this.position = 0;
    this.pos = this.shownPos = 0;
    this.connected = false;
    this.loading = false;
    this.paused = false;
    this.pendingPause = false;
    this.trackId += 1;
    this.host.queueEnded(last);
    this.host.changed();
  }

  clear() {
    return this.#forQueue(() => { if (this.queue.length) this.#endQueue(); });
  }

  // Spec 45: a quiet open that failed leaves a paused queue with nothing open. A skip goes on from
  // it as from any paused queue. While its folder waits, 43 stands and a skip does nothing.
  #canSkip() {
    if (this.current) return true;
    if (!this.parked || this.host.parkedWaits) return false;
    this.connected = true;
    return true;
  }

  skipForward() {
    return this.#forQueue(() => {
      if (!this.#canSkip()) return;
      if (this.repeat === "one") { this.#restart(); return; }
      const t = this.#adjacent(this.pos, 1);
      if (t === null) {
        if (!this.cross) this.#endQueue();
        return;
      }
      this.#goTo(t);
    });
  }

  skipBack() {
    return this.#forQueue(() => {
      if (!this.#canSkip()) return;
      if (this.repeat === "one") { this.#restart(); return; }
      if (!this.paused && this.time > RESTART_AFTER) { this.#restart(); return; }
      const t = this.#adjacent(this.shownPos, -1);
      if (t === null) {
        if (!this.cross) this.#endQueue();
        return;
      }
      this.#goTo(t);
    });
  }

  seek(t, trackId, fast = false) {
    return this.#forQueue(() => {
      if (trackId !== this.trackId || !this.current) return;
      const crossing = !!this.cross;
      this.#undoCross();
      const ch = this.current;
      const d = ch.el.duration;
      if (Number.isFinite(d) && d > FADE_SECONDS && t >= d - FADE_SECONDS) {
        const target = this.#autoTarget();
        if (target !== null) {
          if (this.repeat === "one") this.#restart();
          else this.#goTo(target);
          return;
        }
      }
      if (fast && ch.el.fastSeek) ch.el.fastSeek(t);
      else ch.el.currentTime = t;
      ch.cutIn();
      this.armed = true;
      // Spec 45: the outgoing track can run out under its fade, so it is started again.
      if (this.host.product && crossing && !this.paused && ch.el.paused) this.#play(ch).catch(this.#playFailed(ch, "seek play failed"));
      this.host.changed();
    });
  }

  // Specs 43 and 45: it takes hold now, not when the chain reaches it. A resume can be holding the
  // chain, waiting on a file, and the element, the screen and the lock screen must not wait with it.
  pause() {
    if (this.host.product) {
      this.pausesAsked += 1;
      if (this.loading) this.pendingPause = true;
      else this.paused = true;
      this.#silence();
      this.host.changed();
      return this.chain;
    }
    if (this.loading) { this.pendingPause = true; this.host.changed(); return this.chain; }
    return this.#run(() => {
      if (!this.current) return;
      this.paused = true;
      this.#silence();
      this.host.changed();
    });
  }

  // Spec 45: Play takes hold now too, so the next press reads what this one asked for. A press
  // during a quiet open makes it a press-driven one, whose failure counts.
  resume() {
    const { product } = this.host;
    if (product && this.loading) {
      this.pendingPause = false;
      this.host.changed();
      return this.chain;
    }
    if (product) {
      if (this.queue.length) this.paused = false;
      if (this.current) this.current.quiet = false;
      this.host.changed();
    }
    const asked = this.pausesAsked;
    const token = this.startToken;
    return this.#forQueue(async () => {
      if (!this.queue.length || asked !== this.pausesAsked) return;
      this.paused = false;
      if (this.parked && !this.current) {
        this.#openParked();
      } else if (!this.current) {
        this.#buildOrder(this.index);
        this.current = this.#make(this.pos);
      }
      const ch = this.current;
      ch.quiet = false;
      this.host.changed();
      try {
        await (product ? this.#hold(this.#play(ch)) : this.#play(ch));
        if (product && token !== this.startToken) return;
        ch.cutIn();
        this.armed = true;
        if (!this.connected && this.current === ch) this.#connect();
      } catch (err) {
        if (!product || token === this.startToken) this.#playFailed(ch, "resume failed")(err);
      } finally {
        if (token === this.startToken) this.cancelStart = null;
      }
      this.host.changed();
    });
  }

  toggle() {
    if (this.host.product) return this.wanted ? this.pause() : this.resume();
    return this.paused ? this.resume() : this.pause();
  }

  setRepeat(mode) {
    this.repeat = mode;
    this.#forQueue(() => {
      if (this.current) this.#prepareNext();
      this.host.changed();
    });
  }

  // on: false, true for Songs, or "albums". A parked queue with no channel reorders too (43).
  setShuffle(on) {
    if (this.shuffle === on) return;
    this.shuffle = on;
    this.#forQueue(() => {
      if (!this.current && !this.parked) return;
      const shown = this.order[this.shownPos];
      const internal = this.order[this.pos];
      const all = this.queue.map((_, i) => i);
      if (on) {
        const lead = this.cross ? [shown, internal] : [shown];
        this.order = this.#shuffleOrder(lead);
        this.shownPos = 0;
        this.pos = this.cross ? lead.indexOf(internal) : 0;
      } else {
        this.built = null;
        this.order = all;
        this.shownPos = shown;
        this.pos = internal;
      }
      if (this.cross) {
        this.cross.outPos = this.shownPos;
        this.current.pos = this.pos;
        this.cross.out.pos = this.shownPos;
      } else if (this.current) {
        this.current.pos = this.pos;
      }
      this.position = this.shownPos + 1;
      this.orderVersion += 1;
      this.#prepareNext();
      this.host.changed();
    });
  }

  stop() {
    this.startToken += 1;
    this.cancelStart?.();
    this.#discard();
  }
}
