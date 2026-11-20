// Small DOM helpers for the HUD. Widgets write through `Cell` so an unchanged
// value costs one comparison and no DOM work.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class Cell {
  constructor(node) {
    this.node = node;
    this.text = node.textContent;
    this.style = {};
    this.classes = {};
  }
  set(text) {
    if (text === this.text) return;
    this.text = text;
    this.node.textContent = text;
  }
  css(prop, value) {
    if (this.style[prop] === value) return;
    this.style[prop] = value;
    this.node.style[prop] = value;
  }
  toggle(cls, on) {
    on = !!on;
    if (this.classes[cls] === on) return;
    this.classes[cls] = on;
    this.node.classList.toggle(cls, on);
  }
}

export const pct = (f) => `${Math.round(f * 100)}%`;
export const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
