import { el, Cell, pct } from "../dom.js";
import { dangerColor } from "../theme.js";

// A labelled horizontal bar. `fraction` fills it; colour comes from the theme
// danger thresholds (fraction is "how bad", so pass 1 - capacity for capacity).
export class Meter {
  constructor(parent, label) {
    this.root = el("div", "hud-meter");
    const head = el("div", "hud-meter-head");
    head.append(el("span", "hud-label", label));
    const value = el("span", "hud-meter-value", "0%");
    head.append(value);
    const track = el("div", "hud-track");
    const fill = el("div", "hud-fill");
    track.append(fill);
    const note = el("div", "hud-meter-note");
    this.root.append(head, track, note);
    this.value = new Cell(value);
    this.fill = new Cell(fill);
    this.note = new Cell(note);
    parent.append(this.root);
  }
  // fraction: bar length 0..1; danger: 0..1 severity used for colour
  set(fraction, danger, note = "") {
    this.value.set(pct(fraction));
    this.fill.css("width", `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`);
    this.fill.css("background", dangerColor(danger));
    this.note.set(note);
    this.root.classList.toggle("alarm", danger >= 1);
  }
}
