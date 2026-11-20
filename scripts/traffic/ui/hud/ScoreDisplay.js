import { el, Cell } from "../dom.js";

// SCORE, with throughput underneath. Terminology matches the simulation:
// score = stats.score, throughput = vehicles that reached an output gate.
export class ScoreDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-score");
    this.root.append(el("div", "hud-label", "SCORE"));
    const value = el("div", "hud-value hud-big", "0");
    const sub = el("div", "hud-sub");
    sub.append("THROUGHPUT ");
    const tp = el("b", "", "0");
    sub.append(tp, " · ");
    const rate = el("b", "", "0");
    sub.append(rate, "/min");
    this.root.append(value, sub);
    this.value = new Cell(value);
    this.throughput = new Cell(tp);
    this.rate = new Cell(rate);
    parent.append(this.root);
  }
  update(m) {
    this.value.set(m.score.toLocaleString("en-US"));
    this.throughput.set(String(m.throughput));
    this.rate.set(m.throughputPerMin.toFixed(0));
  }
}
