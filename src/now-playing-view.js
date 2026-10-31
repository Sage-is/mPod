import { ICONS } from "./glyphs.js";
import { Marquee } from "./marquee.js";
import { el } from "./util.js";

const MODE_TEXT = { "none-on": "shuffleOn", "one-off": "repeatOne", "all-off": "repeatAll", "one-on": "shuffleRepeatOne", "all-on": "shuffleRepeatAll" };

export function timeStrings(device, t) {
  const { duration } = device.playback;
  const s = device.strings;
  return {
    elapsed: duration > 0 ? s.time(Math.floor(t)) : "",
    remaining: Number.isFinite(duration) && duration > 0 ? `-${s.time(Math.ceil(duration - t))}` : "",
  };
}

const percentOf = (t, duration) => (duration > 0 ? Math.min(100, t * 100 / duration) : 0);

export class NowPlayingView {
  constructor(device) {
    this.device = device;
    this.el = el("div", "pane np", { role: "group", tabindex: "0", "aria-labelledby": device.titleId });
    this.el.innerHTML = `
      <div class="np-body">
        <div class="np-pos"><span class="np-index"></span><span class="np-icons" aria-hidden="true"></span></div>
        <span class="vh np-modes"></span>
        <div class="np-info">
          <div class="np-title"></div>
          <div class="np-artist" dir="auto"></div>
          <div class="np-album" dir="auto"></div>
        </div>
        <div class="np-window">
          <div class="np-strip">
            <div class="np-panel np-progress" aria-hidden="true">
              <div class="bar" dir="ltr"><i class="bar-fill"></i></div>
              <div class="times" dir="ltr"><span class="t-elapsed"></span><span class="t-remaining"></span></div>
            </div>
            <div class="np-panel np-layers">
              <div class="layer layer-scrub">
                <div class="bar-wrap" dir="ltr">
                  <div class="bar bar-open"></div>
                  <i class="diamond"></i>
                  <input class="range range-scrub" type="range" min="0" tabindex="0">
                </div>
                <div class="times" dir="ltr" aria-hidden="true"><span class="t-elapsed"></span><span class="t-remaining"></span></div>
              </div>
              <div class="layer layer-volume" dir="ltr">
                <span class="spk" aria-hidden="true">${ICONS.speakerSmall}</span>
                <div class="bar-wrap vol-wrap">
                  <div class="bar vol-bar"><i class="bar-fill vol-fill"></i></div>
                  <input class="range range-volume" type="range" min="0" max="100" tabindex="0">
                </div>
                <span class="spk" aria-hidden="true">${ICONS.speakerLarge}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    const q = (s) => this.el.querySelector(s);
    this.index = q(".np-index");
    this.icons = q(".np-icons");
    this.modes = q(".np-modes");
    this.artist = q(".np-artist");
    this.album = q(".np-album");
    this.strip = q(".np-strip");
    this.progressFill = q(".np-progress .bar-fill");
    this.elapsed = this.el.querySelectorAll(".t-elapsed");
    this.remaining = this.el.querySelectorAll(".t-remaining");
    this.diamond = q(".diamond");
    this.volFill = q(".vol-fill");
    this.layerScrub = q(".layer-scrub");
    this.layerVolume = q(".layer-volume");
    this.scrubInput = q(".range-scrub");
    this.volumeInput = q(".range-volume");
    this.iconKey = null;

    this.marquee = new Marquee();
    q(".np-title").append(this.marquee.el);
    this.marquee.onActivate = (e, a) => this.#link(e, a);

    const { modes } = device;
    this.scrubInput.addEventListener("focus", () => modes.scrubInputFocus());
    this.scrubInput.addEventListener("blur", () => modes.scrubInputBlur());
    this.scrubInput.addEventListener("input", () => modes.scrubInputInput(Number(this.scrubInput.value)));
    this.scrubInput.addEventListener("change", () => modes.commit());
    this.volumeInput.addEventListener("focus", () => modes.volumeInputFocus());
    this.volumeInput.addEventListener("blur", () => modes.volumeInputBlur());
    this.volumeInput.addEventListener("input", () => modes.volumeInputInput(Number(this.volumeInput.value)));
  }

  get focusTarget() { return this.el; }

  #link(e, a) {
    const { navigateToUrl } = this.device;
    if (typeof navigateToUrl !== "function") return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try {
      const out = navigateToUrl(a.getAttribute("href"));
      Promise.resolve(out).catch((err) => console.warn("pod-player: navigateToUrl failed", err));
    } catch (err) {
      console.warn("pod-player: navigateToUrl failed", err);
    }
  }

  update() {
    const d = this.device;
    const { playback: pb, strings: s, modes } = d;
    const song = pb.song;
    const values = d.settings.values;

    this.index.textContent = pb.queue.length
      ? s.t("position", { index: s.number(pb.position), total: s.number(pb.queue.length) })
      : "";

    const repeat = values.repeat === "off" ? "none" : values.repeat;
    const shuffle = values.shuffle === "off" ? "off" : "on";
    const iconKey = `${repeat}-${shuffle}`;
    if (iconKey !== this.iconKey) {
      this.iconKey = iconKey;
      const parts = [];
      if (repeat === "one") parts.push(ICONS.repeatOne);
      if (repeat === "all") parts.push(ICONS.repeatAll);
      if (shuffle === "on") parts.push(ICONS.shuffle);
      this.icons.innerHTML = parts.join("");
    }
    this.modes.textContent = MODE_TEXT[iconKey] ? s.t(MODE_TEXT[iconKey]) : "";

    if (song) this.marquee.set(song.name ?? "", `${pb.index}|${song.id}`, song.url);
    this.marquee.el.parentElement.hidden = !song?.name;
    this.artist.textContent = song?.artistName ?? "";
    this.artist.hidden = !song?.artistName;
    this.album.textContent = song?.albumName ?? "";
    this.album.hidden = !song?.albumName;

    const t = modes.displayTime;
    const { duration } = pb;
    const { elapsed, remaining } = timeStrings(d, t);
    this.elapsed.forEach((n) => { n.textContent = elapsed; });
    this.remaining.forEach((n) => { n.textContent = remaining; });
    const percent = percentOf(t, duration);
    this.progressFill.style.width = `${percent}%`;
    this.diamond.style.left = `${percent}%`;
    this.volFill.style.width = `${d.volume}%`;
    this.volumeInput.value = d.volume;
    this.volumeInput.setAttribute("aria-label", s.t("volume"));
    this.volumeInput.setAttribute("aria-valuetext", s.percent(d.volume));

    const input = this.scrubInput;
    input.disabled = !pb.loaded;
    input.max = duration > 0 && Number.isFinite(duration) ? duration : 0;
    input.value = duration > 0 ? Math.floor(t) : 0;
    input.setAttribute("aria-label", s.t("playbackProgress"));
    input.setAttribute("aria-valuetext", s.rangeText(duration > 0 ? t : 0));

    const mode = modes.mode;
    this.strip.classList.toggle("shifted", mode !== "progress");
    this.layerScrub.classList.toggle("on", modes.layer === "scrub");
    this.layerVolume.classList.toggle("on", modes.layer === "volume");
  }

  destroy() { this.marquee.destroy(); }
}
