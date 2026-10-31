const CURVE_SAMPLES = 50;
const curve = (fn) => Float32Array.from({ length: CURVE_SAMPLES }, (_, i) => fn(i / (CURVE_SAMPLES - 1)));
const FADE_IN = curve((x) => Math.cos((1 - x) * Math.PI / 2));
const FADE_OUT = curve((x) => Math.cos(x * Math.PI / 2));

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
  constructor(volume) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = volume / 100;
    this.master.connect(this.ctx.destination);
    this.clickGain = this.ctx.createGain();
    this.clickGain.gain.value = 0.3;
    this.clickGain.connect(this.ctx.destination);
    this.clickBuffer = tickBuffer(this.ctx);
    this.nextTime = 0;
    this.waitingSince = null;
    this.unlocking = false;
    this.ctx.addEventListener("statechange", () => this.#stateChanged());
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
    if (ctx.state !== "running") return;
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
  constructor(graph, song, queueIndex, pos) {
    this.graph = graph;
    this.song = song;
    this.queueIndex = queueIndex;
    this.pos = pos;
    this.el = new Audio();
    this.el.preload = "auto";
    this.el.crossOrigin = "anonymous";
    this.el.src = song.previewUrl;
    this.source = graph.ctx.createMediaElementSource(this.el);
    this.gain = graph.ctx.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain);
    this.gain.connect(graph.master);
    this.listeners = [];
  }

  on(type, fn) {
    this.el.addEventListener(type, fn);
    this.listeners.push([type, fn]);
  }

  play() { return this.el.play(); }

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
    for (const [type, fn] of this.listeners) this.el.removeEventListener(type, fn);
    this.listeners = [];
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
    this.source.disconnect();
    this.gain.disconnect();
  }
}
