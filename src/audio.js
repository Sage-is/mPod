import { EQ_BANDS, eqPreamp } from "./eq-presets.js";

const CURVE_SAMPLES = 50;
const curve = (fn) => Float32Array.from({ length: CURVE_SAMPLES }, (_, i) => fn(i / (CURVE_SAMPLES - 1)));
const FADE_IN = curve((x) => Math.cos((1 - x) * Math.PI / 2));
const FADE_OUT = curve((x) => Math.cos(x * Math.PI / 2));
const EQ_Q = 1.4;
const EQ_TIME = 0.02;

function tickBuffer(ctx) {
  const rate = ctx.sampleRate;
  const length = Math.ceil(rate * 0.006);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let seed = 22;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 1073741823.5 - 1;
  };
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const body = Math.sin(2 * Math.PI * 3100 * t) * 0.55 + noise() * 0.45;
    data[i] = body * Math.exp(-t / 0.0011);
  }
  return buffer;
}

export class AudioGraph {
  constructor(volume, withEq = false) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = volume / 100;
    this.master.connect(this.ctx.destination);
    this.input = withEq ? this.#buildEq() : this.master;
    this.clickGain = this.ctx.createGain();
    this.clickGain.gain.value = 0.3;
    this.clickGain.connect(this.ctx.destination);
    this.clickBuffer = tickBuffer(this.ctx);
    this.silent = this.ctx.createGain();
    this.silent.gain.value = 0;
    this.silent.connect(this.ctx.destination);
    this.nextTime = 0;
    this.waitingSince = null;
    this.unlocking = false;
    this.onSuspend = null;
    this.ctx.addEventListener("statechange", () => this.#stateChanged());
  }

  // Spec 40: fade gain, preamp, ten filters, master. Returns where the channels connect.
  #buildEq() {
    const { ctx } = this;
    this.preamp = ctx.createGain();
    this.filters = EQ_BANDS.map((frequency, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = EQ_Q;
      return filter;
    });
    [this.preamp, ...this.filters, this.master].reduce((from, to) => from.connect(to));
    return this.preamp;
  }

  setEq(gains) {
    const at = this.ctx.currentTime;
    this.filters.forEach((filter, i) => filter.gain.setTargetAtTime(gains[i], at, EQ_TIME));
    this.preamp.gain.setTargetAtTime(10 ** (eqPreamp(gains) / 20), at, EQ_TIME);
  }

  // Calls back on the audio clock, which hidden pages do not throttle.
  after(seconds, fn) {
    const tick = this.ctx.createConstantSource();
    tick.connect(this.silent);
    tick.onended = () => { tick.disconnect(); fn(); };
    tick.start();
    tick.stop(this.ctx.currentTime + seconds);
  }

  setVolume(volume) {
    this.master.gain.setTargetAtTime(volume / 100, this.ctx.currentTime, 0.01);
  }

  unlock() {
    const { ctx } = this;
    if (ctx.state === "running" || ctx.state === "closed" || this.unlocking) return;
    this.unlocking = true;
    const done = () => { this.unlocking = false; clearTimeout(guard); };
    const guard = setTimeout(done, 1000);
    ctx.resume().then(done, done);
  }

  #stateChanged() {
    const { ctx } = this;
    if (ctx.state !== "running") {
      if (ctx.state !== "closed") this.onSuspend?.();
      return;
    }
    this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.08);
    if (this.waitingSince === null) return;
    const age = performance.now() - this.waitingSince;
    this.waitingSince = null;
    if (age <= 200) this.click();
  }

  click() {
    const { ctx } = this;
    if (ctx.state !== "running") {
      this.unlock();
      this.waitingSince ??= performance.now();
      return;
    }
    if (this.nextTime - ctx.currentTime >= 0.15) return;
    const at = Math.max(ctx.currentTime, this.nextTime);
    const source = ctx.createBufferSource();
    source.buffer = this.clickBuffer;
    source.connect(this.clickGain);
    source.start(at);
    this.nextTime = at + 0.05;
  }

  close() {
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}

export class Channel {
  dead = false;
  ready = null;

  // A linked song has no URL until its file opens. source: { acquire(song), release(song) }
  constructor(graph, song, queueIndex, pos, source) {
    this.graph = graph;
    this.song = song;
    this.queueIndex = queueIndex;
    this.pos = pos;
    this.el = new Audio();
    this.el.preload = "auto";
    this.el.crossOrigin = "anonymous";
    if (song.linked) {
      this.files = source;
      this.ready = source.acquire(song).then((url) => {
        if (!this.dead) this.el.src = url;
      }, (cause) => {
        const err = new Error(`could not open ${song.name}`, { cause });
        err.name = "OpenFailed";
        throw err;
      });
    } else {
      this.el.src = song.previewUrl;
    }
    this.source = graph.ctx.createMediaElementSource(this.el);
    this.gain = graph.ctx.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain);
    this.gain.connect(graph.input);
    this.listeners = [];
  }

  on(type, fn) {
    this.el.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  play() { return this.ready ? this.ready.then(() => this.el.play()) : this.el.play(); }

  #fade(values, seconds) {
    const { gain } = this.gain;
    gain.cancelScheduledValues(0);
    gain.setValueCurveAtTime(values, this.graph.ctx.currentTime, seconds);
  }

  fadeIn(seconds) { this.#fade(FADE_IN, seconds); }
  fadeOut(seconds) { this.#fade(FADE_OUT, seconds); }

  cutIn() {
    const { gain } = this.gain;
    gain.cancelScheduledValues(0);
    gain.value = 1;
  }

  destroy() {
    this.dead = true;
    for (const [type, fn] of this.listeners) this.el.removeEventListener(type, fn);
    this.listeners = [];
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.source.disconnect();
    this.gain.disconnect();
    this.files?.release(this.song);
  }
}
