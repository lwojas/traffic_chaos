import { el, Cell } from "../dom.js";
import { icon } from "../icons.js";

// Top-left, deliberately small: the multiplier every exit is paid at, with the score under it.
// The bar is the multiplier between its floor and top; the tick on it is the ceiling congestion
// currently allows, so the gap between bar and tick is what clearing traffic can still earn, and
// a tick sitting low is congestion costing you right now.
export class MultiplierDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-mult");
    const head = el("div", "hud-mult-head");
    head.append(icon("gauge", 12), el("span", "hud-label", "MULT"));
    this.mult = new Cell(el("b", "hud-mult-x", "×1.00"));
    head.append(this.mult.node);
    const track = el("span", "hud-track hud-mult-track");
    this.bar = new Cell(el("span", "hud-fill"));
    this.tick = new Cell(el("i", "hud-mult-tick"));
    track.append(this.bar.node, this.tick.node);
    const score = el("div", "hud-mult-score");
    score.append(el("span", "hud-label", "SCORE"));
    this.score = new Cell(el("b", "", "0"));
    score.append(this.score.node);
    this.root.append(head, track, score);
    parent.append(this.root);
  }

  update(m) {
    const x = m.multiplier;
    const clamp = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10;
    this.mult.set(`×${x.value.toFixed(2)}`);
    this.bar.css("width", `${clamp(x.fill)}%`);
    this.tick.css("left", `${clamp(x.ceiling)}%`);
    this.root.dataset.band = String(m.congestion.band);
    this.score.set(Math.floor(m.score).toLocaleString("en-US"));
  }
}
