import { AudioGraph } from "./audio.js";
import { Backlight } from "./backlight.js";
import { BrickView } from "./brick-view.js";
import { Buttons } from "./buttons.js";
import { Catalogue, fetchCatalogue } from "./catalogue.js";
import { ICONS } from "./glyphs.js";
import { Importer } from "./importer.js";
import { RingKeys, ScreenKeys } from "./keys.js";
import { ListView } from "./list-view.js";
import { Modes } from "./modes.js";
import { Navigator } from "./navigator.js";
import { NowPlayingView, timeStrings } from "./now-playing-view.js";
import { Playback } from "./playback.js";
import { settingsStore } from "./settings.js";
import { Slider } from "./slider.js";
import { Strings } from "./strings.js";
import { css } from "./styles.js";
import { grainUrl, template } from "./template.js";
import { deepActiveElement } from "./util.js";
import { Wheel } from "./wheel.js";

const BOOT_MIN = 2000;
const BOOT_MAX = 10000;
const IDLE_JUMP = 10000;
const VOLUME_SAVE = 1000;
const REPEAT_MODES = { off: "none", one: "one", all: "all" };

let instances = 0;
let fontRegistered = false;
let grain = null;

function registerFont() {
  if (fontRegistered) return;
  fontRegistered = true;
  try {
    const file = new URL("./pod-screen.ttf", import.meta.url);
    const face = new FontFace("PodScreen", `url("${file}") format("truetype")`, {
      display: "block", sizeAdjust: "90%", ascentOverride: "88%", descentOverride: "25%", lineGapOverride: "0%",
    });
    document.fonts.add(face);
    face.load().catch((err) => console.warn("pod-player: screen font failed", err));
  } catch (err) {
    console.warn("pod-player: screen font failed", err);
  }
}

export class PodPlayer extends HTMLElement {
  static observedAttributes = ["backlit", "import"];

  navigateToUrl = null;
  baseCatalogue = new Catalogue();
  importerInstance = null;
  status = "idle";
  loading = true;
  offline = false;
  booted = false;
  minDone = false;
  maxDone = false;
  fetchToken = 0;
  view = null;
  brick = null;
  graph = null;
  renderQueued = false;
  idleTimer = 0;
  saveTimer = 0;
  statusReady = false;
  backlitOverride = null;
  rtl = false;
  connected = false;
  usesCatalogue = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    this.titleId = `pod-title-${++instances}`;
    root.innerHTML = `<style>${css}</style>${template(this.titleId)}`;
    const q = (s) => root.querySelector(s);
    this.parts = {
      wrap: q(".wrap"), device: q(".device"), screen: q(".screen"), scaled: q(".scaled"),
      title: q(".title"), state: q(".state"), brickHead: q(".brick-head"),
      brickBalls: q(".brick-balls"), brickScore: q(".brick-score"),
      body: q(".body-clip"), boot: q(".boot"), offline: q(".offline"), offlineText: q(".offline p"),
      live: q(".live"), wheel: q(".wheel"), ring: q(".ring"),
    };
    this.buttonEls = { menu: q(".btn.menu"), back: q(".btn.back"), forward: q(".btn.forward"), play: q(".btn.play"), select: q(".select") };

    this.strings = new Strings();
    this.settings = settingsStore();
    this.volume = this.#liveFromSetting();
    this.nav = new Navigator(this);
    this.modes = new Modes(this);
    this.backlight = new Backlight(this.settings.values.backlight, () => this.invalidate());
    this.playback = new Playback(this.#playbackHost());
    this.playback.setShuffle(this.settings.values.shuffle === "songs");
    this.playback.setRepeat(REPEAT_MODES[this.settings.values.repeat]);
    this.wheel = new Wheel(this, this.parts.wheel, this.parts.ring);
    this.buttons = new Buttons(this, this.buttonEls);
    this.ringKeys = new RingKeys(this, this.parts.wheel, this.parts.ring);
    this.screenKeys = new ScreenKeys(this, this.parts.body);
    this.slider = new Slider(this.parts.body, () => this.rtl);

    const { device } = this.parts;
    const wake = () => { this.graph?.unlock(); this.activity(); };
    device.addEventListener("pointerdown", wake);
    device.addEventListener("click", wake);
    device.addEventListener("keydown", (e) => {
      if (!e.repeat || e.key.startsWith("Arrow")) wake();
    }, true);

    this.onOnline = () => this.#setOffline(false);
    this.onOffline = () => this.#setOffline(true);
    this.onBlur = () => { this.ringKeys.cancel(); this.screenKeys.resetEscape(); };
  }

  #liveFromSetting() { return Math.round(this.settings.values.volume); }

  #playbackHost() {
    const device = this;
    return {
      get graph() { return device.graph; },
      changed: () => { this.modes.capToDuration(); this.invalidate(); },
      queueChanged: () => this.nav.queueChanged(),
      trackChanged: () => this.modes.trackChanged(),
      queueEnded: (last) => this.nav.queueEnded(last),
      applyVolume: () => this.graph.setVolume(this.volume),
    };
  }

  // Lifecycle

  connectedCallback() {
    this.connected = true;
    registerFont();
    grain ??= grainUrl();
    this.parts.ring.style.setProperty("--grain", grain);
    this.graph = new AudioGraph(this.volume);
    this.unsubscribe = this.settings.subscribe(() => this.#settingsChanged());
    this.buttons.attach();
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("blur", this.onBlur);
    this.#readDirection();
    this.showTop(0, false);
    setTimeout(() => { this.statusReady = true; this.invalidate(); }, 0);

    this.usesCatalogue = this.hasAttribute("catalogue-url");
    this.offline = this.usesCatalogue && !navigator.onLine;
    if (!this.offline) this.#startBoot();
    this.#render();
  }

  disconnectedCallback() {
    this.connected = false;
    if (this.saveTimer) this.#flushVolume();
    this.unsubscribe?.();
    this.buttons.detach();
    this.ringKeys.cancel();
    this.screenKeys.resetEscape();
    this.modes.stop();
    this.backlight.stop();
    clearTimeout(this.minTimer);
    clearTimeout(this.maxTimer);
    clearTimeout(this.idleTimer);
    this.idleTimer = 0;
    this.playback.stop();
    this.slider.clear();
    this.view = null;
    this.brick = null;
    this.graph.close();
    this.graph = null;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("blur", this.onBlur);
  }

  attributeChangedCallback(name, _, value) {
    if (name === "backlit") this.backlitOverride = value;
    this.invalidate();
  }

  // Boot, data, offline

  get importEnabled() { return this.hasAttribute("import"); }

  get importer() {
    if (!this.importEnabled) return null;
    return (this.importerInstance ??= new Importer(this));
  }

  get catalogue() {
    return this.importer?.view(this.baseCatalogue) ?? this.baseCatalogue;
  }

  importFiles(files) {
    return this.importer?.add(Array.from(files ?? [])) ?? Promise.resolve();
  }

  get settled() { return this.status === "ready" || this.status === "error"; }
  get inert() { return this.loading || this.offline; }

  #startBoot() {
    this.minDone = false;
    this.maxDone = false;
    clearTimeout(this.minTimer);
    clearTimeout(this.maxTimer);
    this.minTimer = setTimeout(() => { this.minDone = true; this.#updateBoot(); }, BOOT_MIN);
    this.maxTimer = setTimeout(() => { this.maxDone = true; this.#updateBoot(); }, BOOT_MAX);
    if (!this.usesCatalogue) this.status = "ready";
    else if (this.status !== "ready") this.#load();
  }

  #updateBoot() {
    if (this.booted) return;
    this.loading = (!this.settled && !this.maxDone) || !this.minDone;
    if (!this.loading) {
      this.booted = true;
      clearTimeout(this.maxTimer);
    }
    this.invalidate();
  }

  async #load() {
    const token = ++this.fetchToken;
    this.status = "loading";
    try {
      const catalogue = await fetchCatalogue(this.getAttribute("catalogue-url"));
      if (token !== this.fetchToken) return;
      this.baseCatalogue = catalogue;
      this.status = "ready";
    } catch (err) {
      if (token !== this.fetchToken) return;
      console.warn("pod-player: catalogue failed", err);
      this.status = "error";
    }
    this.#updateBoot();
    this.invalidate();
  }

  #setOffline(offline) {
    if (!this.usesCatalogue || this.offline === offline) return;
    this.offline = offline;
    if (offline) {
      if (!this.booted) {
        clearTimeout(this.minTimer);
        clearTimeout(this.maxTimer);
      }
      if (this.playback.loaded || this.playback.loading) this.playback.pause();
    } else if (!this.booted) {
      this.#startBoot();
    } else if (this.status !== "ready") {
      this.#load();
    }
    this.invalidate();
  }

  // Shared state

  get scrollTarget() {
    if (this.modes.scrubActive) return "seek";
    const { kind } = this.nav;
    if (kind === "list") return "list";
    return kind === "now-playing" ? "volume" : "brick";
  }

  get deviceScale() {
    const width = this.clientWidth;
    if (width >= 440) return 1;
    if (width >= 400) return 0.9;
    if (width >= 360) return 0.8;
    return 0.75;
  }

  get backlit() {
    const force = this.backlitOverride;
    if (force !== null && force !== undefined) return force !== "false";
    return this.backlight.lit;
  }

  set backlit(value) {
    this.backlitOverride = value === null || value === undefined ? null : String(value);
    this.invalidate();
  }

  get dragStepDegrees() { return this.wheel.dragStepDegrees; }
  set dragStepDegrees(value) { this.wheel.dragStepDegrees = value; }
  get i18n() { return this.strings.i18n; }
  set i18n(value) { this.strings.i18n = value; this.invalidate(); }
  get locale() { return this.strings.locale; }
  set locale(value) { this.strings.locale = value; this.invalidate(); }

  invalidate() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (this.connected) this.#render();
    });
  }

  activity() {
    this.backlight.activity();
    if (this.idleTimer) this.#armIdle();
  }

  click(count) {
    if (this.settings.values.clicker !== "on" || !this.graph) return;
    for (let i = 0; i < count; i++) this.graph.click();
  }

  setLiveVolume(value) {
    if (value === this.volume) return false;
    this.volume = value;
    this.graph?.setVolume(value);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.#flushVolume(), VOLUME_SAVE);
    this.invalidate();
    return true;
  }

  #flushVolume() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    this.settings.set("volume", this.volume);
  }

  resetSettings() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    this.settings.reset();
    this.volume = 50;
    this.graph?.setVolume(50);
    this.invalidate();
  }

  #settingsChanged() {
    const v = this.settings.values;
    this.backlight.setMode(v.backlight);
    this.playback.setShuffle(v.shuffle === "songs");
    this.playback.setRepeat(REPEAT_MODES[v.repeat]);
    this.invalidate();
  }

  // Idle jump

  #armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = 0;
      if (this.#idleEligible()) this.nav.push({ key: "nowPlaying" }, { idle: true });
    }, IDLE_JUMP);
  }

  #idleEligible() {
    const { key } = this.nav.top;
    return this.playback.playing && !this.inert && key !== "nowPlaying" && key !== "brick";
  }

  #updateIdle() {
    const eligible = this.#idleEligible();
    if (eligible && !this.idleTimer) this.#armIdle();
    else if (!eligible && this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = 0;
    }
  }

  // Actions

  press(name) {
    if (this.inert) return;
    if (name === "menu") this.nav.pop();
    else if (name === "select") this.select();
    else if (name === "play") this.#playPause();
    else if (!this.modes.scrubActive && this.playback.queue.length) {
      if (name === "back") this.playback.skipBack();
      else this.playback.skipForward();
    }
  }

  select() {
    if (this.inert) return;
    const { kind } = this.nav;
    if (kind === "list") this.nav.activate();
    else if (kind === "game") this.brick?.select();
    else if (this.modes.volumeActive) this.modes.leaveVolume();
    else if (this.playback.loaded) this.modes.toggleScrub();
  }

  #playPause() {
    const pb = this.playback;
    if (pb.loaded) pb.toggle();
    else if (pb.loading) pb.pause();
    else this.nav.playSelection();
  }

  openBrick() {
    if (this.inert || this.nav.top.key !== "about") return;
    this.nav.push({ key: "brick" });
  }

  // Views and focus

  shouldTakeFocus(idle) {
    const active = deepActiveElement();
    const inside = !!active && this.parts.screen.contains(active);
    if (idle) return inside;
    const outside = !!active && active !== document.body && !inside;
    return !outside;
  }

  #readDirection() {
    this.rtl = getComputedStyle(this).direction === "rtl";
    this.parts.wrap.toggleAttribute("data-rtl", this.rtl);
  }

  showTop(dir, takeFocus) {
    const { kind } = this.nav;
    const view = kind === "list" ? new ListView(this) : kind === "now-playing" ? new NowPlayingView(this) : new BrickView(this);
    this.brick = view instanceof BrickView ? view : null;
    this.view = view;
    this.#readDirection();
    this.slider.show(view, dir);
    if (takeFocus) view.focusTarget?.focus({ preventScroll: true });
    view.update();
    this.nav.scrollRestore = null;
    this.invalidate();
  }

  #render() {
    const { nav, playback: pb, parts, strings: s, buttonEls } = this;
    const screen = parts.screen;
    const inert = this.inert;
    screen.classList.toggle("lit", this.backlit);
    screen.classList.toggle("inert", inert);
    parts.boot.hidden = !(this.loading && !this.offline);
    parts.offline.hidden = !this.offline;
    parts.offlineText.textContent = s.t("offline");

    nav.clampSelection();
    const isBrick = nav.kind === "game";
    parts.title.hidden = isBrick;
    parts.title.textContent = nav.title;
    parts.brickHead.hidden = !isBrick;
    if (this.brick) {
      parts.brickBalls.textContent = s.number(this.brick.game.balls);
      parts.brickScore.textContent = s.number(this.brick.game.score);
    }

    const state = parts.state;
    state.hidden = !pb.loaded;
    if (pb.loaded) {
      const name = pb.playing ? "playing" : "paused";
      if (!state.classList.contains(name)) {
        state.className = `state ${name}`;
        state.innerHTML = pb.playing ? ICONS.play : ICONS.pause;
      }
    }

    const scrubbing = this.modes.scrubActive;
    const label = { menu: "menu", back: "back", forward: "forward", select: "select", play: pb.playing || pb.starting ? "pause" : "play" };
    for (const [name, btn] of Object.entries(buttonEls)) {
      const disabled = inert || (scrubbing && (name === "back" || name === "forward"));
      btn.setAttribute("aria-label", s.t(label[name]));
      if (disabled) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
      if (inert) btn.tabIndex = -1;
      else btn.removeAttribute("tabindex");
    }

    this.buttons.refresh();
    if (inert) this.screenKeys.resetEscape();
    this.view?.update();
    if (this.statusReady) {
      const text = this.offline ? s.t("offline") : s.t(this.loading ? "loading" : "ready");
      if (parts.live.textContent !== text) parts.live.textContent = text;
    }
    this.#updateIdle();
  }

  // Test surface

  debugState() {
    const { nav, playback: pb, modes, strings: s, settings } = this;
    const top = nav.kind;
    const view = this.offline ? "offline" : this.loading ? "loading" : top === "list" ? "list" : top === "now-playing" ? "now-playing" : "brick";
    const rows = top === "list"
      ? nav.rows.map((row, i) => ({
        text: row.text, value: row.value, selected: i === nav.selection, arrow: row.kind === "navigate",
      }))
      : [];
    let nowPlaying = null;
    if (top === "now-playing") {
      const song = pb.song;
      const { elapsed, remaining } = timeStrings(this, modes.displayTime);
      nowPlaying = {
        index: pb.position,
        total: pb.queue.length,
        title: song?.name ?? "",
        artist: song?.artistName ?? "",
        album: song?.albumName ?? "",
        elapsed,
        remaining,
        mode: modes.mode,
        playing: pb.playing,
        volume: this.volume,
      };
    }
    let brick = null;
    if (this.brick) {
      brick = { balls: this.brick.game.balls, score: this.brick.game.score, message: this.brick.message };
    }
    const { shuffle, repeat, clicker, volume, backlight } = settings.values;
    return {
      view,
      title: nav.title,
      rows,
      nowPlaying,
      brick,
      settings: { shuffle, repeat, clicker, volume, backlight },
      backlit: this.backlit,
    };
  }

  getWheelRect() {
    const r = this.parts.wheel.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width };
  }
}

if (!customElements.get("pod-player")) customElements.define("pod-player", PodPlayer);
