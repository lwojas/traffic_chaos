import { el, Cell, clock } from "../dom.js";

// RUNNING / PAUSED / GRIDLOCK plus the clock.
export class StatusDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-status");
    this.root.append(el("span", "hud-label", "STATUS"));
    const state = el("span", "hud-status-state", "RUNNING");
    const time = el("span", "hud-status-time", "0:00");
    this.root.append(state, time);
    this.state = new Cell(state);
    this.time = new Cell(time);
    parent.append(this.root);
  }
  update(m) {
    const s = m.status === "gridlock" ? "GRIDLOCK" : m.paused ? "PAUSED" : "RUNNING";
    this.state.set(s);
    this.state.node.dataset.state = s.toLowerCase();
    this.time.set(clock(m.time));
  }
}
