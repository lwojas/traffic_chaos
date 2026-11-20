import { el } from "../dom.js";
import { Meter } from "./Meter.js";

// The failure indicators. Both values come from the simulation's stats:
//   NETWORK CAPACITY  share of lanes not blocked by incidents (stats.networkCapacity)
//   GRIDLOCK          fullest input queue (stats.peakQueueFill); at 100% the
//                     level-ending timer runs (stats.gridlockProgress)
export class GridlockDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-gridlock");
    this.capacity = new Meter(this.root, "NETWORK CAPACITY");
    this.gridlock = new Meter(this.root, "GRIDLOCK");
    parent.append(this.root);
  }
  update(m) {
    this.capacity.set(m.capacity, 1 - m.capacity);
    const running = m.gridlockProgress > 0 && !m.gridlock;
    const left = Math.max(0, m.gridlockSeconds * (1 - m.gridlockProgress));
    this.gridlock.set(m.gridlockRisk, running || m.gridlock ? 1 : m.gridlockRisk, m.gridlock ? "GRIDLOCK" : running ? `QUEUE FULL: ${left.toFixed(1)}s TO GRIDLOCK` : "");
  }
}
