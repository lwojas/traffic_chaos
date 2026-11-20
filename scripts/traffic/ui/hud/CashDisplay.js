import { el, Cell } from "../dom.js";

// CASH (spendable) with the Flow chain beneath it: a row of steps that light up
// as the chain grows and a bar that drains as the chain times out. Replaces the
// old score panel; throughput stays as the sub line.
export class CashDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-cash");
    this.root.append(el("div", "hud-label", "CASH"));
    const value = el("div", "hud-value hud-big", "$0");
    this.root.append(value);
    this.value = new Cell(value);

    const flow = el("div", "hud-flow");
    this.flowLabel = new Cell(el("span", "hud-flow-x", "FLOW ×1"));
    flow.append(this.flowLabel.node);
    this.pips = el("span", "hud-flow-pips");
    flow.append(this.pips);
    this.root.append(flow);
    const track = el("span", "hud-track hud-flow-track");
    this.bar = el("span", "hud-fill hud-flow-fill");
    track.append(this.bar);
    this.root.append(track);
    this.barCell = new Cell(this.bar);

    const sub = el("div", "hud-sub");
    sub.append("THROUGHPUT ");
    this.throughput = new Cell(el("b", "", "0"));
    sub.append(this.throughput.node);
    this.root.append(sub);
    this.pipNodes = [];
    parent.append(this.root);
  }

  update(m) {
    this.value.set(`$${Math.floor(m.cash).toLocaleString("en-US")}`);
    this.throughput.set(String(m.throughput));
    const f = m.flow;
    if (this.pipNodes.length !== f.steps) {
      this.pips.replaceChildren();
      this.pipNodes = Array.from({ length: f.steps }, () => this.pips.appendChild(el("i")));
    }
    this.pipNodes.forEach((n, i) => n.classList.toggle("on", i <= f.step));
    this.flowLabel.set(`FLOW ×${f.multiplier}`);
    this.flowLabel.toggle("hot", f.step > 0);
    this.barCell.css("width", f.step > 0 ? `${Math.round((f.timeLeft / f.timeTotal) * 100)}%` : "0%");
  }
}
