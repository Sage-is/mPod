const BULB = "254,249,220";
const lampSpots = [
  ...[19, 53, 83].map((y) => `radial-gradient(50% 70% at 0 ${y}%, rgb(${BULB}) 0, rgba(${BULB},.85) 6%, rgba(${BULB},.15) 20%, transparent 50%)`),
  ...[19, 53, 83].map((y) => `radial-gradient(50% 70% at 0 ${y}%, rgb(${BULB}) 0, rgba(${BULB},.85) 6%, transparent 33%)`),
  ...[19, 54, 83].map((y) => `radial-gradient(20% 83% at 100% ${y}%, rgb(${BULB}) 0, rgba(${BULB},.7) 6%, transparent 33%)`),
].join(",");

export const css = `
:host {
  display: block;
  container-type: inline-size;
  color-scheme: light dark;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}
:host([fit]) { height: 100%; overflow: hidden; }
.wrap {
  display: flex;
  justify-content: center;
  width: 100%;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  --ink: #484647;
  --tint: #b5c3d8;
  --sel-bg: var(--ink);
  --sel-text: #afaea7;
  --sel-value: #c1c1ba;
  --sel-chev: #b9b9b3;
  --opacity: 1;
  --scrim: rgba(72,70,71,.1);
  --scrim-blend: luminosity;
  --glyph: #a3a3a3;
  --word: #898989;
  --divider: #888;
  --body-a: rgba(232,232,232,.96);
  --body-b: #fff;
  --body-shadow: inset 0 -1px 3px 2px rgba(168,168,168,.67), inset -1px 0 2px 5px #fff,
    -1px 1px 0 3px rgba(146,146,146,.47), 2px 1px 0 3px #e7e7e7;
  --wheel-fill: #f8f8f8;
  --wheel-shadow: inset -16px 29px 11px 15px #f4f4f4, inset 8px -7px 34px -15px rgba(137,137,137,.8),
    0 0 0 2px rgba(135,135,135,.38), -4px 6px 10px 0 rgba(131,131,131,.23), 0 0 1px 3px rgba(72,72,72,.1),
    0 -1px 1px 2px rgba(168,168,168,.67), 0 0 1px 3px #e9e9e8, -2px 3px 1px 2px #d7d7d7,
    -1px 1px 0 3px rgba(229,229,229,.47);
  --ring-a: #eaeaea;
  --ring-b: #f6f6f6;
  --ring-shadow: inset 0 0 0 2px rgba(249,249,249,.27), 4px -5px 18px 0 rgba(122,122,122,.6),
    0 -1px 4px 2px rgba(168,168,168,.67);
  --sel-1: rgba(255,255,255,.2);
  --sel-2: transparent;
  --sel-3: rgba(22,22,22,.19);
  --sel-4: rgba(250,250,250,.93);
}
@media (prefers-color-scheme: dark) {
  .wrap {
    --opacity: .85;
    --body-a: #d4d4d4f5;
    --body-b: #fefefe;
    --body-shadow: inset 0 -1px 3px 2px #2d2d2dab, inset -1px 0 2px 5px #9e9e9e,
      -1px 1px 0 3px #00000078, 2px 1px 0 3px #777;
    --wheel-fill: #ededed;
    --wheel-shadow: inset -16px 29px 11px 15px #e9e9e9, inset 8px -7px 34px -15px #1b1b1b87,
      0 0 0 2px #00000017, -4px 6px 10px 0 #0000001f, 0 0 1px 3px #0000001f,
      0 -1px 1px 2px #ccccccf7, 0 0 1px 3px #70707008, -2px 3px 1px 2px #d6d6d6,
      -1px 1px 0 3px #dadada78;
    --ring-a: #f1eeee;
    --ring-b: #e4e4e4;
    --ring-shadow: inset 0 0 0 2px #c1bcbc45, 4px -5px 18px 0 #b0aeae99, 0 -1px 4px 2px #9b9b9bab;
    --sel-1: #ecebeb24;
    --sel-2: #ecebeb24;
    --sel-3: #46454561;
    --sel-4: #f2f2f2d9;
  }
}
@media (prefers-contrast: more) {
  .wrap {
    --ink: #000;
    --tint: #f0f0e6;
    --sel-bg: #000;
    --sel-text: #eed;
    --sel-value: #eed;
    --sel-chev: #eed;
    --scrim: #eed;
    --scrim-blend: normal;
    --glyph: #3a3a3a;
    --word: #3a3a3a;
    --divider: #3a3a3a;
  }
}
.wrap[data-rtl] { --sel-text: #b8b7b1; --sel-chev: #a7a79f; }
@media (prefers-contrast: more) {
  .wrap[data-rtl] { --sel-text: #eed; --sel-chev: #eed; }
}

.box { position: relative; flex: none; width: 415px; }
.scaled { position: relative; scale: 1; transform-origin: top center; transition: scale .25s ease-in-out; }
@container (width < 440px) { .scaled { scale: .9; } }
@container (width < 400px) { .scaled { scale: .8; } }
@container (width < 360px) { .scaled { scale: .75; } }

.floor {
  position: absolute; top: 692px; left: 0; width: 100%; height: 200px;
  border-radius: 38px 38px 0 0; opacity: .3; filter: blur(1px); pointer-events: none;
  background: linear-gradient(180deg, #010101 0, rgba(87,87,87,.89) 5%, rgba(72,72,72,.41) 17%, transparent 50%);
  box-shadow: 0 -1px 1px .5px rgb(112,112,112);
}
.edge {
  position: absolute; inset: -2px; border-radius: 38px; pointer-events: none;
  background: linear-gradient(249deg, transparent 79%, #000 84%) 0 50% / 181% 200% no-repeat;
}
.device {
  position: relative; box-sizing: border-box; width: 415px; height: 692px;
  border: 1px solid transparent; border-radius: 38px;
  background: linear-gradient(42deg, var(--body-a) 0, var(--body-b) 149%);
  box-shadow: var(--body-shadow);
  -webkit-box-reflect: below 4px linear-gradient(transparent 50%, rgba(0,0,0,.15) 100%);
}
.rim, .sheen { position: absolute; inset: -3px; border-radius: 38px; pointer-events: none; }
.rim {
  box-sizing: border-box; padding: 6px;
  background:
    conic-gradient(from -23deg,
      rgba(255,255,255,0) 0, rgba(255,255,255,.4) 1%, rgba(255,255,255,0) 2.5%,
      rgba(255,255,255,0) 5%, rgba(255,255,255,.4) 5.5%, rgba(255,255,255,.4) 6.5%, rgba(255,255,255,0) 8%,
      rgba(255,255,255,0) 9%, rgba(255,255,255,.4) 10%, rgba(255,255,255,.4) 12%, rgba(255,255,255,0) 13%),
    conic-gradient(from -23deg, rgba(0,0,0,.3) 0, rgba(0,0,0,.3) 10%, rgba(0,0,0,.1) 20%, rgba(0,0,0,.45) 57%,
      rgba(0,0,0,.2) 70%, rgba(0,0,0,.2) 100%),
    linear-gradient(rgba(255,255,255,.3) 0 0),
    linear-gradient(rgba(255,255,255,.3) 0 0);
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  box-shadow: inset 0 0 0 3px rgba(255,255,255,.5);
}
.sheen {
  z-index: 5;
  background:
    linear-gradient(249deg, rgba(255,255,255,0) 0, rgba(255,255,255,.08) 40%, rgba(255,255,255,.08) 50%,
      rgba(255,255,255,0) 52%, rgba(255,255,255,0) 76%) 0 50% / 181% 200% no-repeat,
    linear-gradient(257deg, rgba(255,255,255,0) 0, rgba(255,255,255,.04) 42%, rgba(255,255,255,.04) 55%,
      rgba(255,255,255,0) 58%, rgba(255,255,255,0) 76%) 0 50% / 181% 200% no-repeat;
}

.screen {
  position: relative; box-sizing: content-box; width: 273px; height: 223px; margin: 30px auto 0;
  border: 8px solid rgba(0,0,0,.5); border-radius: 10px;
  background: linear-gradient(135deg, #a5a59b, #d6d5d0);
  box-shadow: inset 0 0 10px 2px #4d4d4d;
  font-family: PodScreen, system-ui, sans-serif; font-size: 26px; line-height: 1; color: var(--ink);
  -webkit-font-smoothing: none; font-synthesis: none;
  pointer-events: none;
}
.scrim {
  position: absolute; inset: 5px; z-index: 1; pointer-events: none;
  background: var(--scrim); mix-blend-mode: var(--scrim-blend);
}
.lamp { display: none; position: absolute; top: 5px; bottom: 5px; left: -7px; width: 275px; z-index: 1; pointer-events: none; opacity: .15; mix-blend-mode: plus-lighter; background: ${lampSpots}; }
.screen.lit { border-color: rgba(24,24,24,.7); box-shadow: none; --sel-text: var(--tint); --sel-value: var(--tint); --sel-chev: var(--tint); --opacity: .85; }
.screen.lit .scrim { inset: 0; background: #0f69ff; mix-blend-mode: plus-lighter; opacity: .2; }
.screen.lit .lamp { display: block; top: 0; bottom: 0; left: 0; width: 100%; }
@media (prefers-contrast: more) {
  .screen.lit { --sel-value: #eed; --sel-chev: #eed; }
  .screen.lit .scrim { background: #eed; mix-blend-mode: normal; opacity: 1; }
}

.menu-layer { position: relative; z-index: 2; opacity: var(--opacity); }
.screen.inert .menu-layer { visibility: hidden; }
.overlay { position: absolute; inset: 0; z-index: 3; opacity: var(--opacity); pointer-events: none; }
.overlay[hidden] { display: none; }
.boot { display: flex; align-items: center; justify-content: center; }
.boot span { transform: translateY(-10px); }
.offline { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.offline svg { display: block; width: 90px; height: auto; color: currentColor; transform: translateX(-10%) translateY(-12px); }
.offline p { position: absolute; left: 10px; right: 10px; bottom: 20px; margin: 0; font-size: 17.3333px; text-align: center; }

.titlebar { position: relative; box-sizing: border-box; height: 37px; margin: 0 5px; border-bottom: 2px solid var(--ink); }
.title {
  position: absolute; left: 50%; top: calc(50% + 7px); translate: -50% -50%;
  max-width: calc(100% - 86px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.title[hidden], .state[hidden], .brick-head[hidden] { display: none; }
.state {
  position: absolute; inset-inline-start: 10px; top: 50%; color: var(--ink); display: block; line-height: 0;
  translate: 0 calc(-50% + 1.2px);
}
.state svg { display: block; }
.state.playing svg { transform: scale(.9); }
.state.paused svg { transform: scale(1, .8); }
.state.paused { margin-inline-start: 2.3px; }
.brick-head {
  position: absolute; left: 50%; top: calc(50% + 3px); translate: -50% -50%;
  width: calc(100% - 110px); display: grid; grid-template-columns: 1fr 1fr; direction: ltr;
}
.brick-balls { justify-self: start; }
.brick-score { justify-self: end; }
.battery {
  position: absolute; top: 3px; inset-inline-end: 5px; box-sizing: content-box;
  width: 98px; height: 44px; border: 6px solid var(--ink); display: flex; gap: 3px; padding: 0;
  transform: scale(.3); transform-origin: 100% 23%; line-height: 0;
}
.battery::after {
  content: ""; position: absolute; left: 100%; top: 50%; margin-left: 6px; translate: 0 -50%;
  width: 8px; height: 22px; background: var(--ink);
}
.battery i { flex: 1; margin: 3px 0; background: var(--ink); }
.battery i:first-child { margin-inline-start: 3px; }
.battery i:last-child { margin-inline-end: 3px; }
.wrap[data-rtl] .battery { transform-origin: 0 23%; }
.wrap[data-rtl] .battery::after { left: auto; right: 100%; margin: 0 6px 0 0; }

.body-clip { position: relative; height: 181.7px; overflow: hidden; }
.pane { position: absolute; left: 0; right: 0; top: 1.7px; box-sizing: border-box; height: 180px; will-change: transform; outline: none; }

.list-pane { padding: 0 5px; }
.list { position: relative; height: 180px; overflow: hidden auto; outline: none; }
.list::-webkit-scrollbar { width: 12px; }
.list::-webkit-scrollbar-track { background: rgba(72,70,71,.1); border: 1px solid #484647; }
.list::-webkit-scrollbar-thumb { background: #484647; border: 2px solid transparent; background-clip: padding-box; }
.row {
  box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;
  height: 30px; overflow: clip; padding: 3px 6px 1px 8px; white-space: nowrap; font-size: 26px; line-height: 1;
}
.row-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; letter-spacing: -.2px; }
.title, .row-title, .row-value, .np-artist, .np-album, .marquee { padding-block: .14em; margin-block: -.14em; }
.row-value { flex: none; font-weight: normal; white-space: nowrap; margin-inline-start: 8px; }
.row.toggle .row-value { flex: 0 1 auto; min-width: 0; color: #333; overflow: hidden; text-overflow: ellipsis; }
.row.center .row-title { text-align: center; }
.row.help { height: 26px; font-size: 17.3333px; }
.row.help:last-child { height: 30px; margin-top: 12px; font-size: 26px; }
.chev {
  flex: none; box-sizing: content-box; width: 9px; height: 9px; margin-inline-end: 5px;
  border-block-start: 3px solid #333; border-inline-end: 3px solid #333;
  transform: rotate(45deg) translateY(-2px);
}
.wrap[data-rtl] .chev { transform: rotate(-45deg) translateY(-2px); }
.row.selected:not(.info) { background: var(--sel-bg); color: var(--sel-text); }
.row.selected:not(.info) .row-value { color: var(--sel-value); }
.row.selected:not(.info) .chev { border-color: var(--sel-chev); }
@media (forced-colors: active) {
  .list:focus-visible .row.selected { outline: 2px solid currentColor; outline-offset: -2px; }
}

.name-pane { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 26px 5px 0; }
.name-line { display: flex; align-items: center; max-width: 100%; height: 30px; overflow: hidden; white-space: pre; }
.name-text { padding-block: .14em; margin-block: -.14em; }
.name-cursor { flex: none; width: 12px; height: 24px; margin-inline-start: 1px; background: var(--ink); }
.name-letter {
  box-sizing: border-box; min-width: 42px; height: 30px; padding: 3px 10px 1px; text-align: center; line-height: 26px;
  background: var(--sel-bg); color: var(--sel-text);
}

.np { display: flex; flex-direction: column; }
.np-body {
  box-sizing: border-box; display: flex; flex-direction: column; height: 180px; overflow: hidden;
  padding: 4px 15px 7px;
}
.np-pos {
  flex: none; display: grid; grid-template-columns: 1fr auto; align-items: center; margin-bottom: 6px;
  font-size: 17.3333px; line-height: 20px; text-align: left; direction: ltr;
}
.wrap[data-rtl] .np-pos { text-align: right; }
.np-icons { display: flex; gap: 6px; color: var(--ink); }
.np-icons svg { display: block; }
.np-info { flex: none; margin-bottom: 5px; text-align: center; }
.np-title { margin-bottom: 2px; }
.np-title[hidden], .np-artist[hidden], .np-album[hidden] { display: none; }
.np-artist { margin-bottom: 2px; }
.np-artist, .np-album { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.marquee { overflow: hidden; white-space: nowrap; text-align: center; }
.marquee-track { display: inline-flex; max-width: none; vertical-align: top; }
.marquee.overflow { text-align: start; }
.marquee.overflow .marquee-track { display: flex; width: max-content; }
.marquee.static .marquee-track { display: block; width: auto; }
.marquee.static .marquee-text { display: block; overflow: hidden; text-overflow: ellipsis; }
.marquee-text { flex: none; white-space: nowrap; }
.marquee-gap { flex: none; width: 30px; }
.song-link { color: inherit; text-decoration: none; pointer-events: auto; outline: none; }
.song-link:hover, .song-link:focus-visible { text-decoration: underline; }

.np-window { flex: 0 1 57px; min-height: 0; margin-top: auto; overflow: clip; overflow-clip-margin: 8px; }
.np-strip {
  display: grid; grid-template-columns: 1fr 1fr; column-gap: 30px; width: calc(200% + 30px); height: 100%;
  transition: transform .3s ease-out;
}
.np-strip.shifted { transform: translateX(calc(-50% - 15px)); }
.wrap[data-rtl] .np-strip.shifted { transform: translateX(calc(50% + 15px)); }
.np-panel { min-width: 0; min-height: 0; direction: ltr; }
.np-progress { box-sizing: border-box; display: flex; flex-direction: column; padding-top: 10px; }
.np-layers { display: grid; }
.layer { grid-area: 1 / 1; min-width: 0; min-height: 0; opacity: 0; }
.layer.on { opacity: 1; }
.layer-scrub { box-sizing: border-box; display: flex; flex-direction: column; padding-top: 10px; }
.layer-volume { display: grid; grid-template-columns: auto 1fr auto; column-gap: 7px; align-items: center; color: var(--ink); }
.spk svg { display: block; }
.bar {
  box-sizing: border-box; flex: 0 1 15px; height: 15px; min-height: 12px; border: 1.5px solid var(--ink);
  border-radius: 7px; overflow: hidden; direction: ltr;
}
.bar-fill { display: block; height: 100%; width: 0; background: var(--ink); }
.bar-wrap { position: relative; flex: 0 1 15px; display: flex; min-height: 12px; }
.bar-wrap .bar { flex: 1; }
.bar-open { overflow: visible; }
.diamond {
  position: absolute; top: 50%; left: 0; width: 10px; height: 10px; background: var(--ink);
  translate: -50% -50%; rotate: 45deg;
}
.range {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; opacity: 0; pointer-events: none;
}
.bar-wrap:has(.range:focus-visible) .bar { outline: 2px solid currentColor; outline-offset: 2px; }
.times {
  flex: none; display: flex; justify-content: space-between; margin-top: 6px; font-size: 26px;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.brick { padding: 0 5px; }
.brick-canvas { display: block; width: 100%; image-rendering: pixelated; color: var(--ink); }
.vh {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; border: 0;
}

.wheel {
  position: relative; top: 30px; box-sizing: border-box; width: 350px; height: 350px; margin: 0 auto;
  border-radius: 50%; background: var(--wheel-fill); box-shadow: var(--wheel-shadow); cursor: pointer;
  touch-action: none; -webkit-user-select: none; user-select: none; outline: none;
}
.divider { position: absolute; top: 0; width: 2px; height: 100%; background: var(--divider); pointer-events: none; }
.divider.a { left: 50%; rotate: 45deg; }
.divider.b { left: 49.7%; rotate: 135deg; }
.btn {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: var(--glyph); cursor: pointer; touch-action: manipulation;
  outline: none;
}
.btn.menu { clip-path: polygon(50% 50%, 0 0, 100% 0); color: var(--word); }
.btn.back { clip-path: polygon(50% 50%, 0 0, 0 100%); }
.btn.forward { clip-path: polygon(50% 50%, 100% 0, 100% 100%); }
.btn.play { clip-path: polygon(50% 50%, 0 100%, 100% 100%); }
.glyph { position: absolute; display: block; line-height: 0; }
.glyph svg { display: block; }
.btn:active .glyph { scale: .97; opacity: .99; }
.btn.menu:active .glyph { scale: .99; }
.btn:focus-visible .glyph { outline: 2px solid var(--glyph); outline-offset: 3px; border-radius: 3px; }
.menu .glyph { top: 9.5px; left: 50%; margin-left: -68px; width: 136px; }
.menu-shine {
  position: absolute; top: 2px; left: 50%; margin-left: -54px; width: 108px; height: 34px; border-radius: 35%;
  opacity: .25; background: radial-gradient(ellipse at 50% -189%, rgba(255,255,255,.9) 57%, rgba(255,255,255,.07) 75.6%);
}
.forward .glyph { right: 6px; top: 50%; margin-top: -6px; }
.back .glyph { left: 6px; top: 50%; margin-top: -6px; rotate: 180deg; }
.play .glyph { bottom: 12px; left: 50%; margin-left: -12px; }
.ring {
  position: absolute; left: 50%; top: 50%; width: 276px; height: 276px; margin: -138px 0 0 -138px;
  box-sizing: border-box; border: 2px solid #7e7e7e; border-radius: 50%; outline: none;
  background-image: var(--grain, none), radial-gradient(circle at 130% -100%, var(--ring-a), var(--ring-b));
  background-size: 30%, 30%; background-repeat: repeat;
  box-shadow: var(--ring-shadow); touch-action: none; transition: box-shadow .1s ease-out;
}
.select {
  position: absolute; left: 50%; top: 50%; width: 100px; height: 100px; margin: -50px 0 0 -50px; padding: 0;
  box-sizing: border-box; border: 2px solid #9f9f9f; border-radius: 50%; rotate: 35deg; cursor: pointer;
  background:
    radial-gradient(ellipse closest-side at 50% 30%, var(--sel-1) 72%, var(--sel-2) 80.6%),
    radial-gradient(farthest-side at -9% 209%, var(--sel-3), var(--sel-4));
  touch-action: manipulation; outline: none;
  transition: scale .1s ease-out, box-shadow .1s ease-out;
}
.select:active { scale: .98; box-shadow: 0 0 1px 1px #909090; }
.select:focus-visible { outline: 2px solid var(--glyph); outline-offset: 2px; }
.wheel.dragging .btn, .wheel.dragging .select { pointer-events: none; }
.glint {
  position: absolute; left: 20.5px; top: 15px; box-sizing: content-box; width: 318px; height: 317px; padding: 4px;
  border-radius: 50%; pointer-events: none; filter: blur(12px);
  background: conic-gradient(from 345deg, transparent 0, transparent 16%, #fff 22%, transparent 30%,
    transparent 67%, #fff 72%, transparent 80%);
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
@media (prefers-contrast: more) {
  .wheel { outline: 2px solid #3a3a3a; }
}
@media (prefers-reduced-motion: reduce) {
  .np-strip, .scaled, .ring, .select { transition: none; }
}
`;
