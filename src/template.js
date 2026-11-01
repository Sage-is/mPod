import { ICONS } from "./glyphs.js";

export const template = (titleId) => `
<div class="wrap">
  <div class="box">
    <div class="scaled">
      <div class="floor"></div>
      <div class="edge"></div>
      <div class="device">
        <div class="rim"></div>
        <div class="screen">
          <div class="scrim"></div>
          <div class="lamp"></div>
          <div class="menu-layer">
            <div class="titlebar" id="${titleId}">
              <span class="state" aria-hidden="true" hidden></span>
              <span class="title" dir="auto"></span>
              <span class="brick-head" hidden><span class="brick-balls"></span><span class="brick-score"></span></span>
              <span class="battery" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            </div>
            <div class="body-clip"></div>
          </div>
          <div class="overlay boot" hidden><span></span></div>
          <div class="overlay offline" hidden>${ICONS.sadPlayer}<p></p></div>
          <div class="vh live" role="status"></div>
        </div>
        <div class="wheel" dir="ltr" tabindex="-1">
          <i class="divider a"></i>
          <i class="divider b"></i>
          <button class="btn menu" type="button"><span class="menu-shine" aria-hidden="true"></span><span class="glyph" aria-hidden="true">${ICONS.menu}</span></button>
          <button class="btn back" type="button"><span class="glyph" aria-hidden="true">${ICONS.forward}</span></button>
          <button class="btn forward" type="button"><span class="glyph" aria-hidden="true">${ICONS.forward}</span></button>
          <button class="btn play" type="button"><span class="glyph" aria-hidden="true">${ICONS.playPause}</span></button>
          <div class="ring" tabindex="-1" aria-hidden="true"></div>
          <button class="select" type="button"></button>
          <div class="glint"></div>
        </div>
        <div class="sheen"></div>
      </div>
    </div>
  </div>
</div>`;

export function grainUrl() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  let seed = 48271;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < image.data.length; i += 4) {
    const grey = 96 + Math.floor(random() * 96);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = grey;
    image.data[i + 3] = random() < 0.55 ? 0 : 5 + Math.floor(random() * 12);
  }
  ctx.putImageData(image, 0, 0);
  return `url("${canvas.toDataURL("image/png")}")`;
}
