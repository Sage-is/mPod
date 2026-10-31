import { clamp } from "./util.js";

const IDLE_MS = 5000;
const COMMIT_MS = 1000;
const HOLD_STEPS = [5, 5, 5, 10, 10, 10, 20];

export class Modes {
  volumeActive = false;
  volumeHeld = false;
  scrubActive = false;
  scrubHeld = false;
  preview = null;
  pending = null;
  changeSeq = 0;
  dragging = false;
  layer = "scrub";
  hold = null;
  volumeTimer = 0;
  scrubTimer = 0;
  commitTimer = 0;

  constructor(device) { this.device = device; }

  get mode() {
    if (this.volumeActive) return "volume";
    return this.scrubActive ? "scrub" : "progress";
  }

  get displayTime() {
    const { playback } = this.device;
    return this.scrubActive && this.preview !== null ? this.preview : playback.time;
  }

  stop() {
    clearTimeout(this.volumeTimer);
    clearTimeout(this.scrubTimer);
    clearTimeout(this.commitTimer);
  }

  #armVolume() {
    clearTimeout(this.volumeTimer);
    this.volumeTimer = 0;
    if (this.volumeHeld) return;
    this.volumeTimer = setTimeout(() => this.leaveVolume(), IDLE_MS);
  }

  leaveVolume() {
    clearTimeout(this.volumeTimer);
    this.volumeTimer = 0;
    this.volumeHeld = false;
    if (!this.volumeActive) return;
    this.volumeActive = false;
    this.device.invalidate();
  }

  volumeStep(delta) {
    const d = this.device;
    if (this.scrubActive) return false;
    this.volumeActive = true;
    this.layer = "volume";
    this.#armVolume();
    d.invalidate();
    return d.setLiveVolume(clamp(d.volume + delta, 0, 100));
  }

  volumeInputFocus() {
    this.exitScrub();
    this.volumeActive = true;
    this.layer = "volume";
    this.volumeHeld = true;
    clearTimeout(this.volumeTimer);
    this.device.invalidate();
  }

  volumeInputInput(value) {
    this.volumeInputFocus();
    this.device.setLiveVolume(clamp(Math.round(value), 0, 100));
  }

  volumeInputBlur() {
    if (!this.volumeActive) return;
    this.volumeHeld = false;
    this.#armVolume();
  }

  #armScrub() {
    clearTimeout(this.scrubTimer);
    this.scrubTimer = 0;
    if (this.scrubHeld) return;
    this.scrubTimer = setTimeout(() => this.exitScrub(), IDLE_MS);
  }

  touchScrub() { if (this.scrubActive) this.#armScrub(); }

  enterScrub() {
    const { playback } = this.device;
    this.scrubActive = true;
    this.layer = "scrub";
    this.scrubTrack = playback.trackId;
    this.preview = null;
    this.pending = null;
    this.hold = null;
    this.#armScrub();
    this.device.invalidate();
  }

  toggleScrub() {
    if (this.scrubActive) this.exitScrub();
    else this.enterScrub();
  }

  scrubStep(delta) {
    const base = this.preview ?? Math.floor(this.device.playback.time);
    this.#request(base + delta, base);
  }

  #request(wanted, base) {
    const { duration } = this.device.playback;
    const upper = duration > 0 ? duration : Infinity;
    const value = clamp(Math.round(wanted), 0, upper);
    this.#armScrub();
    if (value === base) return;
    this.preview = value;
    this.pending = value;
    this.changeSeq += 1;
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    if (!this.dragging) this.commitTimer = setTimeout(() => this.commit(), COMMIT_MS);
    this.device.invalidate();
  }

  commit() {
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    if (this.pending === null) return;
    const { playback } = this.device;
    const value = this.pending;
    const seq = this.changeSeq;
    this.pending = null;
    playback.seek(value, this.scrubTrack).then(() => {
      if (seq === this.changeSeq) this.preview = null;
      this.device.invalidate();
    });
  }

  exitScrub() {
    if (!this.scrubActive) return;
    this.commit();
    clearTimeout(this.scrubTimer);
    this.scrubTimer = 0;
    this.scrubActive = false;
    this.scrubHeld = false;
    this.preview = null;
    this.pending = null;
    this.device.invalidate();
  }

  dragStart() { this.dragging = true; }

  dragEnd() {
    this.dragging = false;
    if (this.pending === null) return;
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), COMMIT_MS);
  }

  scrubInputFocus() {
    if (!this.device.playback.loaded) return;
    this.leaveVolume();
    if (!this.scrubActive) this.enterScrub();
    this.scrubHeld = true;
    clearTimeout(this.scrubTimer);
    this.scrubTimer = 0;
    this.device.invalidate();
  }

  scrubInputInput(value) {
    this.scrubInputFocus();
    if (!this.scrubActive) return;
    this.#request(value, this.preview ?? Math.floor(this.device.playback.time));
  }

  scrubInputBlur() {
    if (!this.scrubActive) return;
    this.commit();
    this.scrubHeld = false;
    this.#armScrub();
  }

  trackChanged() {
    if (!this.scrubActive) return;
    const { playback } = this.device;
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    this.pending = null;
    this.preview = null;
    this.changeSeq += 1;
    if (playback.loaded && this.scrubHeld) {
      this.scrubTrack = playback.trackId;
      this.device.invalidate();
    } else {
      this.exitScrub();
    }
  }

  capToDuration() {
    const { duration } = this.device.playback;
    if (!(duration > 0)) return;
    if (this.preview !== null && this.preview > duration) this.preview = duration;
    if (this.pending !== null && this.pending > duration) this.pending = duration;
  }

  screenChanged(onNowPlaying) {
    if (onNowPlaying) return;
    this.exitScrub();
    this.leaveVolume();
  }

  holdSeek(dir, first) {
    const d = this.device;
    const pb = d.playback;
    if (first) this.hold = d.inert ? null : { base: pb.time, track: pb.trackId, fires: 0 };
    const h = this.hold;
    if (!h || d.inert || this.scrubActive || !pb.loaded) return;
    const { duration } = pb;
    if (!(duration > 0) || pb.trackId !== h.track) return;
    const step = HOLD_STEPS[Math.min(h.fires, HOLD_STEPS.length - 1)];
    h.fires += 1;
    const t = clamp(h.base + dir * step, 0, duration);
    if (t > 0 && t < duration) h.base = t;
    else this.hold = null;
    d.activity();
    pb.seek(t, pb.trackId);
  }
}
