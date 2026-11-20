import { el } from "../dom.js";

// A row of discrete segments that light up with a 0..1 fraction. Which colour a
// segment takes is CSS (data-band -> congestion tokens), so it follows the theme.
const BANDS = [0, 0, 0, 1, 1, 2]; // six segments: safe, safe, safe, pressure, pressure, danger
export class Segments {
  constructor(parent, count = BANDS.length) {
    this.root = el("span", "hud-segments");
    this.nodes = Array.from({ length: count }, (_, i) => {
      const n = el("i", "hud-seg");
      n.dataset.band = String(Math.min(3, Math.round((i / (count - 1)) * 2.4)));
      return this.root.appendChild(n);
    });
    this.lit = -1;
    parent.append(this.root);
  }
  // Lights ceil(fraction * count) segments; critical fills them all and pulses
  set(fraction, critical = false) {
    const n = Math.min(this.nodes.length, Math.ceil(Math.max(0, fraction) * this.nodes.length - 1e-6));
    if (n !== this.lit) {
      this.lit = n;
      this.nodes.forEach((s, i) => s.classList.toggle("on", i < n));
    }
    this.root.classList.toggle("critical", critical);
  }
}
