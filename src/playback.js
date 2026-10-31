import { Channel } from "./audio.js";

const FADE_SECONDS = 2;
const FLIP_AT = 1;
const RESTART_AFTER = 3;

const logRejection = (label) => (err) => {
  if (err?.name !== "AbortError") console.warn(`pod-player: ${label}`, err);
};

function shuffled(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// host: { graph, changed(), trackChanged(), queueChanged(), queueEnded({ids, index}), applyVolume() }
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

  constructor(host) { this.host = host; }

  get song() { return this.queue[this.index] ?? null; }
  get loaded() { return this.connected && !!this.current; }
  get playing() { return this.loaded && !this.paused; }
  get starting() { return this.loading && !this.pendingPause; }
  get displayChannel() { return this.cross ? this.cross.out : this.current; }

  get time() {
    const ch = this.displayChannel;
    return this.connected && ch ? ch.el.currentTime : 0;
  }

  get duration() {
    const ch = this.displayChannel;
    if (!this.connected || !ch) return 0;
    const d = ch.el.duration;
    return Number.isNaN(d) ? 0 : d;
  }

  #run(fn) {
    this.chain = this.chain.then(fn).catch(logRejection("playback command failed"));
    return this.chain;
  }

  #make(pos) {
    const queueIndex = this.order[pos];
    const ch = new Channel(this.host.graph, this.queue[queueIndex], queueIndex, pos);
    ch.on("timeupdate", () => this.#onTime(ch));
    ch.on("durationchange", () => this.#onTime(ch));
    ch.on("ended", () => this.#onEnded(ch));
    return ch;
  }

  #buildOrder(index) {
    const all = this.queue.map((_, i) => i);
    if (this.shuffle) {
      this.order = [index, ...shuffled(all.filter((i) => i !== index))];
      this.pos = this.shownPos = 0;
    } else {
      this.order = all;
      this.pos = this.shownPos = index;
    }
  }

  #discard() {
    this.current?.destroy();
    this.next?.destroy();
    this.current = this.next = this.cross = null;
    for (const f of this.fading) { clearTimeout(f.timer); f.channel.destroy(); }
    this.fading.clear();
    this.armed = false;
  }

  start(songs, index) {
    if (!songs.length) return;
    const at = index ?? (this.shuffle ? Math.floor(Math.random() * songs.length) : 0);
    const token = ++this.startToken;
    this.cancelStart?.();
    this.queue = songs;
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
      this.#buildOrder(at);
      this.host.applyVolume();
      const ch = this.#make(this.pos);
      this.current = ch;
      try {
        const cancelled = new Promise((resolve) => { this.cancelStart = resolve; });
        await Promise.race([ch.play(), cancelled]);
        if (token !== this.startToken) return;
        ch.cutIn();
        this.armed = true;
        this.#connect();
      } catch (err) {
        if (token === this.startToken) logRejection("play failed")(err);
      } finally {
        if (token === this.startToken) {
          this.cancelStart = null;
          this.loading = false;
          this.host.changed();
        }
      }
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
    const p = pos + dir;
    if (p >= 0 && p < this.order.length) return p;
    if (this.repeat !== "all" || !this.order.length) return null;
    return dir > 0 ? 0 : this.order.length - 1;
  }

  #autoTarget() { return this.repeat === "one" ? this.pos : this.#adjacent(this.pos, 1); }

  #prepareNext() {
    if (!this.current) return;
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

  #checkFade() {
    const ch = this.current;
    if (!this.armed) return;
    const d = ch.el.duration;
    if (!Number.isFinite(d) || d <= FADE_SECONDS || ch.el.currentTime < d - FADE_SECONDS) return;
    this.armed = false;
    if (this.next) this.#crossfade();
    else ch.fadeOut(FADE_SECONDS);
  }

  #onEnded(ch) {
    if (ch !== this.current) return;
    if (this.next) this.#crossfade();
    else this.#endQueue();
  }

  #linger(channel, onDone) {
    const entry = { channel, timer: 0 };
    entry.timer = setTimeout(() => {
      this.fading.delete(entry);
      channel.destroy();
      onDone?.();
    }, FADE_SECONDS * 1000);
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
    if (!this.paused) inc.play().catch(logRejection("crossfade play failed"));
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
      target.play().then(() => {
        if (!this.connected && this.current === target) this.#connect();
      }, logRejection("skip play failed"));
    }
    this.trackId += 1;
    this.#prepareNext();
    this.host.queueChanged();
    this.host.trackChanged();
    this.host.changed();
  }

  #restart() {
    this.#undoCross();
    const ch = this.current;
    ch.el.currentTime = 0;
    ch.cutIn();
    this.armed = true;
    if (!this.paused && ch.el.paused) ch.play().catch(logRejection("restart play failed"));
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
    return this.#run(() => { if (this.queue.length) this.#endQueue(); });
  }

  skipForward() {
    return this.#run(() => {
      if (!this.current) return;
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
    return this.#run(() => {
      if (!this.current) return;
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

  seek(t, trackId) {
    return this.#run(() => {
      if (trackId !== this.trackId || !this.current) return;
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
      ch.el.currentTime = t;
      ch.cutIn();
      this.armed = true;
      this.host.changed();
    });
  }

  pause() {
    if (this.loading) { this.pendingPause = true; this.host.changed(); return this.chain; }
    return this.#run(() => {
      if (!this.current) return;
      this.paused = true;
      this.current.el.pause();
      for (const f of this.fading) f.channel.el.pause();
      this.host.changed();
    });
  }

  resume() {
    return this.#run(async () => {
      if (!this.queue.length) return;
      this.paused = false;
      if (!this.current) {
        this.#buildOrder(this.index);
        this.current = this.#make(this.pos);
      }
      const ch = this.current;
      this.host.changed();
      try {
        await ch.play();
        ch.cutIn();
        this.armed = true;
        if (!this.connected && this.current === ch) this.#connect();
      } catch (err) {
        logRejection("resume failed")(err);
      }
      this.host.changed();
    });
  }

  toggle() { return this.paused ? this.resume() : this.pause(); }

  setRepeat(mode) {
    this.repeat = mode;
    this.#run(() => {
      if (this.current) this.#prepareNext();
      this.host.changed();
    });
  }

  setShuffle(on) {
    if (this.shuffle === on) return;
    this.shuffle = on;
    this.#run(() => {
      if (!this.current) return;
      const shown = this.order[this.shownPos];
      const internal = this.order[this.pos];
      const all = this.queue.map((_, i) => i);
      if (on) {
        const lead = this.cross ? [shown, internal] : [shown];
        this.order = [...lead, ...shuffled(all.filter((i) => !lead.includes(i)))];
        this.shownPos = 0;
        this.pos = this.cross ? lead.indexOf(internal) : 0;
      } else {
        this.order = all;
        this.shownPos = shown;
        this.pos = internal;
      }
      if (this.cross) {
        this.cross.outPos = this.shownPos;
        this.current.pos = this.pos;
        this.cross.out.pos = this.shownPos;
      } else {
        this.current.pos = this.pos;
      }
      this.position = this.shownPos + 1;
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
