const NAME = "mpod";

const PRESSES = ["pointerdown", "keydown", "click"];
const MODIFIERS = new Set([
  "Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "ScrollLock", "Shift", "Super", "Symbol", "SymbolLock",
]);
// Spec 45: these keep their browser meaning, so they neither steal nor stop.
const notPress = (e) => e.type === "keydown" && (MODIFIERS.has(e.key) || e.key === "Tab" || e.ctrlKey || e.altKey || e.metaKey);

// Spec 41: the newest window holds the lock for the life of the page. A window that loses
// it stops, and a press there takes it back. Specs 42 and 43: that window is not inert. Its
// presses stop here, so the first runs only the steal and no other listener runs at all.
export class OneWindow {
  lost = false;
  release = null;
  retaking = false;

  constructor(onLost) {
    this.onLost = onLost;
    this.onPress = (e) => {
      if (!this.lost || !e.composedPath().includes(this.body) || notPress(e)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.type !== "click" && !e.repeat) this.#takeBack();
    };
  }

  // On the window, in the capture phase, ahead of everything else the player listens with.
  // That covers the whole device, the screen included, and the listeners its constructor adds.
  start(body) {
    this.body = body;
    for (const type of PRESSES) window.addEventListener(type, this.onPress, true);
    navigator.locks?.request(NAME, { steal: true }, () => new Promise((resolve) => { this.release = resolve; }))
      .catch((err) => {
        if (err?.name !== "AbortError" || !this.release) return;
        this.lost = true;
        this.onLost();
      });
  }

  // The reload starts from fresh stored data, and takes the lock again as this page closes.
  #takeBack() {
    if (this.retaking) return;
    this.retaking = true;
    const reload = () => location.reload();
    navigator.locks.request(NAME, { steal: true }, reload).catch(reload);
  }

  stop() {
    for (const type of PRESSES) window.removeEventListener(type, this.onPress, true);
    this.release?.();
    this.release = null;
  }
}
