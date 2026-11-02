import { AudioGraph } from "./audio.js";
import { Backlight } from "./backlight.js";
import { Battery } from "./battery.js";
import { BrickView } from "./brick-view.js";
import { Buttons } from "./buttons.js";
import { Catalogue, fetchCatalogue } from "./catalogue.js";
import { CONTRASTS, eqGains } from "./eq-presets.js";
import { Extras } from "./extras.js";
import { ICONS } from "./glyphs.js";
import { Importer } from "./importer.js";
import { RingKeys, ScreenKeys } from "./keys.js";
import { freezeStore } from "./library-store.js";
import { ListView } from "./list-view.js";
import { MediaControls } from "./media-session.js";
import { Menus } from "./menus.js";
import { Modes } from "./modes.js";
import { NameView } from "./name-view.js";
import { Navigator } from "./navigator.js";
import { NowPlayingView, timeStrings } from "./now-playing-view.js";
import { OneWindow } from "./one-window.js";
import { Playback } from "./playback.js";
import { Power } from "./power.js";
import { Resume } from "./resume.js";
import { settingsStore } from "./settings.js";
import { Slider } from "./slider.js";
import { Strings } from "./strings.js";
import { css } from "./styles.js";
import { grainUrl, template } from "./template.js";
import { deepActiveElement, el } from "./util.js";
import { Wheel } from "./wheel.js";

const BOOT_MIN = 2000;
const BOOT_MAX = 10000;
const IDLE_JUMP = 10000;
const VOLUME_SAVE = 1000;
const REPEAT_MODES = { off: "none", one: "one", all: "all" };
const SHUFFLE_MODES = { off: false, songs: true, albums: "albums" };
const HAPTIC_GAP = 40;
const BODY_WIDTH = 421;
const BODY_HEIGHT = 698;
const FIT_MARGIN = 4;
const FIT_MIN = 0.45;

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
  libraryLoading = false;
  media = null;
  fitScale = null;
  fitObserver = null;
  lastHaptic = -Infinity;
  product = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    this.titleId = `pod-title-${++instances}`;
    root.innerHTML = `<style>${css}</style>${template(this.titleId)}`;
    const q = (s) => root.querySelector(s);
    this.parts = {
      wrap: q(".wrap"), box: q(".box"), device: q(".device"), screen: q(".screen"), scaled: q(".scaled"),
      title: q(".title"), state: q(".state"), brickHead: q(".brick-head"),
      brickBalls: q(".brick-balls"), brickScore: q(".brick-score"),
      body: q(".body-clip"), boot: q(".boot"), bootName: q(".boot span"), offline: q(".offline"), offlineText: q(".offline p"),
      live: q(".live"), wheel: q(".wheel"), ring: q(".ring"), battery: q(".battery"),
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
      changed: () => { this.modes.capToDuration(); this.media?.sync(); this.resume?.sync(); this.invalidate(); },
      queueChanged: () => this.nav.queueChanged(),
      trackChanged: () => this.modes.trackChanged(),
      queueEnded: (last) => this.nav.queueEnded(last),
      applyVolume: () => this.graph.setVolume(this.volume),
      get files() { return device.importer; },
      get watchMedia() { return device.importEnabled; },
      get product() { return device.product; },
      get parkedWaits() { return !!device.resume?.waiting; },
      opened: (song) => this.importer?.opened(song),
      openFailed: (song, cause, undecodable) => this.importer?.openFailed(song, cause, undecodable),
      durationKnown: (song, seconds) => this.importer?.noteDuration(song, seconds),
      mediaEvent: () => this.media?.sync(true),
      get after() { return device.importEnabled ? (seconds, fn) => device.graph?.after(seconds, fn) : null; },
    };
  }

  // Lifecycle

  connectedCallback() {
    this.connected = true;
    this.product = this.importEnabled && !this.isTestPage;
    registerFont();
    grain ??= grainUrl();
    this.parts.ring.style.setProperty("--grain", grain);
    if (this.product) this.#startProduct();
    else this.settings.useDefaults();
    this.graph = new AudioGraph(this.volume, this.product);
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
    this.#startLibrary();
    if (!this.offline) this.#startBoot();
    if (this.hasAttribute("fit")) this.#startFit();
    if (this.product) this.#settingsChanged();
    this.#render();
  }

  // Specs 36 to 41 exist only on the product page, so their parts are built here.
  #startProduct() {
    const { screen, device } = this.parts;
    this.settings.useProduct();
    if (!this.parts.lost) {
      const lost = el("div", "overlay offline lost", { hidden: "" });
      lost.innerHTML = `${ICONS.sadPlayer}<p><span class="lost-line"></span><span class="lost-line"></span></p>`;
      screen.append(lost);
      this.parts.lost = lost;
      this.parts.lostLines = lost.querySelectorAll(".lost-line");
      const power = el("div", "power", { hidden: "" });
      power.innerHTML = '<span class="power-title"></span><span class="battery"><i></i><i></i><i></i><i></i></span>';
      screen.append(power);
      this.parts.power = power;
      this.parts.powerTitle = power.querySelector(".power-title");
      this.parts.powerBattery = power.querySelector(".battery");
    }
    this.oneWindow = new OneWindow(() => this.#lose());
    this.oneWindow.start(device);
    this.resume = new Resume(this);
    this.menus = new Menus(this);
    this.extras ??= new Extras(this);
    this.battery = new Battery(() => this.invalidate());
    this.battery.start();
    this.power = new Power(this);
    this.power.start();
    // Spec 51: a long press gives the phone nothing to answer, from its first moment, so
    // Android has no long press of its own to buzz for.
    device.classList.add("product");
    device.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // Spec 41: another window took over. Nothing here plays or writes from now on.
  #lose() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    this.settings.freeze();
    freezeStore();
    this.importer?.stopScans();
    this.extras.stop();
    this.resume.stop();
    this.power.wake();
    if (this.playback.queue.length) this.playback.pause();
    this.media?.stop();
    this.media = null;
    this.invalidate();
  }

  #startLibrary() {
    const started = this.importer?.start();
    if (!started) return;
    if (!this.media) {
      this.media = new MediaControls(this);
      this.media.start();
      this.graph.onSuspend = () => this.media?.suspended();
    }
    this.libraryLoading = true;
    const ready = this.resume
      ? started.then(() => this.resume.restore()).catch((err) => console.warn("pod-player: resume failed", err))
      : started;
    ready.finally(() => {
      this.libraryLoading = false;
      this.#updateBoot();
      this.invalidate();
    });
  }

  disconnectedCallback() {
    this.connected = false;
    this.oneWindow?.stop();
    this.resume?.stop();
    this.power?.stop();
    this.battery?.stop();
    this.fitObserver?.disconnect();
    this.fitObserver = null;
    this.media?.stop();
    this.media = null;
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
    if (name === "import" && value !== null && this.connected) this.#startLibrary();
    this.invalidate();
  }

  // Boot, data, offline

  get importEnabled() { return this.hasAttribute("import"); }

  get importer() {
    if (!this.importEnabled) return null;
    this.importerInstance ??= new Importer(this);
    this.importerInstance.start();
    return this.importerInstance;
  }

  get isTestPage() { return this.hasAttribute("catalogue-url"); }
  get lost() { return !!this.oneWindow?.lost; }
  get off() { return !!this.power?.off; }
  get defaultName() { return this.isTestPage ? "Pod" : "mPod"; }
  get deviceName() { return this.settings.values.name || this.defaultName; }
  get showsHelp() { return !this.isTestPage && !!this.importer?.nothing; }

  get catalogue() {
    return this.importer?.view(this.baseCatalogue) ?? this.baseCatalogue;
  }

  importFiles(files) {
    return this.importer?.add(Array.from(files ?? [])) ?? Promise.resolve();
  }

  // Test seam for spec 32: links a directory handle, real or fake, as the picker would.
  linkFolder(handle) { return this.importer?.link(handle) ?? Promise.resolve(); }

  get settled() { return !this.libraryLoading && (this.status === "ready" || this.status === "error"); }
  get inert() { return this.loading || this.offline || this.off; }
  get halted() { return this.inert || this.lost; }

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
    if (kind === "name") return "letter";
    return kind === "now-playing" ? "volume" : "brick";
  }

  get deviceScale() {
    if (this.fitScale !== null) return this.fitScale;
    const width = this.clientWidth;
    if (width >= 440) return 1;
    if (width >= 400) return 0.9;
    if (width >= 360) return 0.8;
    return 0.75;
  }

  get backlit() {
    if (this.off) return false;
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
    if (this.off) return;
    this.backlight.activity();
    if (this.idleTimer) this.#armIdle();
    this.power?.activity();
  }

  click(count) {
    if (this.settings.values.clicker !== "on" || !this.graph) return;
    for (let i = 0; i < count; i++) this.graph.click();
    if (this.importEnabled) this.#haptic();
  }

  // Spec 49: a button's switch, felt going down and coming up. The wheel's limit is not for it.
  buzz(ms) {
    if (this.product && this.settings.values.clicker === "on") navigator.vibrate?.(ms);
  }

  #haptic() {
    const now = performance.now();
    if (now - this.lastHaptic < HAPTIC_GAP || !navigator.vibrate || this.power?.pressing) return;
    this.lastHaptic = now;
    navigator.vibrate(4);
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
    this.playback.setShuffle(SHUFFLE_MODES[v.shuffle]);
    this.playback.setRepeat(REPEAT_MODES[v.repeat]);
    if (this.product) {
      this.graph?.setEq(eqGains(v.eq));
      const contrast = CONTRASTS.find((choice) => choice.id === v.contrast).value;
      this.parts.screen.toggleAttribute("data-contrast", contrast !== 1);
      this.parts.screen.style.setProperty("--contrast", contrast);
    }
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
    return this.playback.playing && !this.inert && key !== "nowPlaying" && key !== "brick" && key !== "name";
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
    else if (name === "play") {
      if (!this.product || !this.nav.playHighlighted()) this.#playPause();
    }
    else if (!this.modes.scrubActive && this.playback.queue.length) {
      if (name === "back") this.playback.skipBack();
      else this.playback.skipForward();
    }
  }

  select() {
    if (this.inert) return;
    const { kind } = this.nav;
    if (kind === "list") this.nav.activate();
    else if (kind === "name") this.view.select();
    else if (kind === "game") this.brick?.select();
    else if (this.modes.volumeActive) this.modes.leaveVolume();
    else if (this.playback.loaded) this.modes.toggleScrub();
  }

  // A media key means the track, so it skips the rule for a highlighted list, and a parked
  // track resumes whatever row is showing (43). With no queue, 08 stands.
  playPause() {
    if (this.inert) return;
    if (this.playback.parked && !this.playback.toggles) this.playback.resume();
    else this.#playPause();
  }

  #playPause() {
    const pb = this.playback;
    if (pb.toggles) pb.toggle();
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
    const Views = { list: ListView, "now-playing": NowPlayingView, name: NameView, game: BrickView };
    const view = new Views[kind](this);
    this.brick = view instanceof BrickView ? view : null;
    this.view = view;
    this.#readDirection();
    this.slider.show(view, dir);
    if (takeFocus) view.focusTarget?.focus({ preventScroll: true });
    view.update();
    this.nav.scrollRestore = null;
    this.invalidate();
  }

  // Product page only: the device fits the space it is given, width and height.
  #startFit() {
    const fit = () => {
      const width = this.clientWidth;
      const height = this.clientHeight;
      if (!width || !height) return;
      const room = Math.min((width - FIT_MARGIN * 2) / BODY_WIDTH, (height - FIT_MARGIN * 2) / BODY_HEIGHT);
      this.fitScale = Math.max(FIT_MIN, Math.min(1, room));
      this.parts.scaled.style.scale = this.fitScale;
      this.parts.box.style.marginTop = `${Math.max(FIT_MARGIN, (height - 692 * this.fitScale) / 2)}px`;
    };
    fit();
    this.fitObserver = new ResizeObserver(fit);
    this.fitObserver.observe(this);
  }

  #render() {
    const { nav, playback: pb, parts, strings: s, buttonEls } = this;
    const screen = parts.screen;
    const inert = this.inert;
    screen.classList.toggle("lit", this.backlit);
    screen.classList.toggle("inert", inert);
    screen.classList.toggle("off", this.off);
    parts.boot.hidden = !(this.loading && !this.offline && !this.lost);
    const name = this.deviceName;
    if (parts.bootName.textContent !== name) parts.bootName.textContent = name;
    if (this.importEnabled && document.title !== name) document.title = name;
    parts.offline.hidden = !this.offline;
    parts.offlineText.textContent = s.t("offline");
    if (parts.lost) {
      screen.classList.toggle("taken", this.lost);
      parts.lost.hidden = !this.lost;
      parts.lostLines[0].textContent = s.t("playingIn");
      parts.lostLines[1].textContent = s.t("anotherWindow");
      this.power.render();
    }

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
    state.hidden = !pb.loaded && !pb.parked;
    if (!state.hidden) {
      const name = pb.playing ? "playing" : "paused";
      if (!state.classList.contains(name)) {
        state.className = `state ${name}`;
        state.innerHTML = pb.playing ? ICONS.play : ICONS.pause;
      }
    }

    const scrubbing = this.modes.scrubActive;
    const label = { menu: "menu", back: "back", forward: "forward", select: "select", play: pb.wanted ? "pause" : "play" };
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
      const text = this.lost ? `${s.t("playingIn")} ${s.t("anotherWindow")}`
        : this.offline ? s.t("offline") : s.t(this.loading ? "loading" : "ready");
      if (parts.live.textContent !== text) parts.live.textContent = text;
    }
    this.#updateIdle();
    this.power?.update();
  }

  // Test surface

  debugState() {
    const { nav, playback: pb, modes, strings: s, settings } = this;
    const top = nav.kind;
    const SCREENS = { list: "list", "now-playing": "now-playing", name: "name", game: "brick" };
    const view = this.lost ? "lost" : this.off ? "off" : this.offline ? "offline" : this.loading ? "loading" : SCREENS[top];
    let rows = [];
    if (top === "list") {
      rows = nav.rows.map((row, i) => ({
        text: row.text, value: row.value, selected: i === nav.selection, arrow: row.kind === "navigate" || !!row.arrow,
      }));
    } else if (top === "name" && this.view instanceof NameView) {
      rows = [{ text: this.view.draft, value: this.view.letterLabel, selected: true, arrow: false }];
    }
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
    const { shuffle, repeat, clicker, volume, backlight, eq, contrast } = settings.values;
    return {
      view,
      title: nav.title,
      rows,
      nowPlaying,
      brick,
      settings: { shuffle, repeat, clicker, volume, backlight, ...(this.product ? { eq, contrast } : {}) },
      backlit: this.backlit,
    };
  }

  getWheelRect() {
    const r = this.parts.wheel.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width };
  }
}

if (!customElements.get("pod-player")) customElements.define("pod-player", PodPlayer);
