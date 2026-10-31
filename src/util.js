export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function deepActiveElement() {
  let a = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

export function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
