const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="currentColor" aria-hidden="true">${body}</svg>`;

const LOOP_TOP = "M1 8V5.6A2.6 2.6 0 0 1 3.6 3H11V.3L15.6 4 11 7.7V5H3.6a.6.6 0 0 0-.6.6V8z";
const LOOP_BOTTOM = "M16 7v2.4A2.6 2.6 0 0 1 13.4 12H6v2.7L1.4 11 6 7.3V10h7.4a.6.6 0 0 0 .6-.6V7z";

export const ICONS = {
  repeatAll: svg(18, 15, `<path d="${LOOP_TOP}"/><path d="${LOOP_BOTTOM}"/>`),
  repeatOne: svg(19, 15, `<path d="${LOOP_TOP}"/><path d="${LOOP_BOTTOM}"/><path d="M16.4 0h1.3v5h1.1v1.2H15V5h1.4V1.6l-1.1.5-.4-1z"/>`),
  shuffle: svg(20, 15, `<path d="M0 2.5h3.6c1.7 0 2.8.8 3.7 2l1.5 2-1.3 1.7L5.8 5.8C5.2 5 4.6 4.5 3.6 4.5H0z"/><path d="M0 12.5v-2h3.6c1 0 1.6-.5 2.2-1.3l4.1-5.3c1-1.3 2.1-2.1 3.9-2.1h1.2V0L20 3l-5 3V3.8h-1.2c-1.1 0-1.7.5-2.3 1.3L7.3 10.5c-1 1.2-2 2-3.7 2z"/><path d="M9.7 9.7 11 8l.5.7c.6.8 1.2 1.3 2.3 1.3H15V8l5 3.2-5 3V12h-1.2c-1.8 0-2.9-.8-3.8-2z"/>`),
  speakerSmall: svg(10, 16, `<path d="M0 5h3.5L10 .5v15L3.5 11H0z"/>`),
  speakerLarge: svg(18, 16, `<path d="M0 5h3.5L10 .5v15L3.5 11H0z"/><path d="M11.8 4.9a4.4 4.4 0 0 1 0 6.2l-.9-.9a3.2 3.2 0 0 0 0-4.4z"/><path d="M14.2 2.5a7.8 7.8 0 0 1 0 11l-.9-.9a6.5 6.5 0 0 0 0-9.2z"/>`),
  play: svg(17, 20, `<path d="M0 0 17 10 0 20z"/>`),
  pause: svg(14, 20, `<rect width="5" height="20"/><rect x="9" width="5" height="20"/>`),
  forward: svg(23, 12, `<path d="M0 .4 9.6 6 0 11.6z"/><path d="M9.6 .4 19.2 6 9.6 11.6z"/><rect x="19.2" y=".35" width="3.8" height="11.3"/>`),
  playPause: svg(24, 12, `<path d="M0 .4 9.6 6 0 11.6z"/><rect x="13.8" y=".35" width="3.8" height="11.3"/><rect x="19.6" y=".35" width="3.8" height="11.3"/>`),
  menu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 150" width="136" aria-hidden="true"><defs><path id="pod-menu-curve" d="M31 97Q200-15 369 97"/></defs><text font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="55" fill="currentColor"><textPath href="#pod-menu-curve" startOffset="112">menu</textPath></text></svg>`,
  sadPlayer: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 92" width="90" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="2" width="52" height="86" rx="8"/><rect x="17" y="9" width="38" height="31" rx="2"/><path d="M26 18l4 4m0-4-4 4M42 18l4 4m0-4-4 4"/><path d="M28 34c3-4.5 13-4.5 16 0"/><circle cx="36" cy="64" r="16"/><circle cx="36" cy="64" r="5"/><path d="M62 74c10 0 7 12 16 12"/><path d="M76 81l8 7M81 78l6 5"/></svg>`,
};
