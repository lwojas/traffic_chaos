import { el, Cell, pct } from "../dom.js";
import { icon } from "../icons.js";
import { Segments } from "./Segments.js";

const TREND = { "1": "▲ RISING", "0": "STEADY", "-1": "▼ CLEARING" };

// Network congestion, top-left: the meter that sets the multiplier. It shows the pressure of the
// most backed-up road (the same number and colours as that road's signal control) and whether it
// is rising or clearing; the line beside it says what that is costing in multiplier. Click it to
// jump to the road that is hurting. When an input queue is full the bottom line becomes the
// countdown to the level-ending gridlock: the most urgent thing on screen.
export class CongestionDisplay {
  constructor(parent, camera) {
    this.camera = camera;
    this.worst = null;
    this.root = el("div", "hud-panel hud-load");
    this.root.addEventListener("click", () => this.worst && this.camera.glideTo(this.worst.x, this.worst.y));
    const head = el("div", "hud-load-head");
    const title = el("span", "hud-label");
    title.append(icon("grid", 14), " CONGESTION");
    this.percent = new Cell(el("span", "hud-load-percent", "0%"));
    head.append(title, this.percent.node);
    const body = el("div", "hud-load-body");
    this.segments = new Segments(body);
    const trend = el("div", "hud-stability");
    const word = el("span", "hud-chip-state");
    word.append(el("i", "hud-dot"));
    this.word = new Cell(el("b", "", "STEADY"));
    word.append(this.word.node);
    this.chip = word;
    this.cost = new Cell(el("span", "hud-label hud-cost", ""));
    trend.append(word, this.cost.node);
    body.append(trend);
    this.alert = new Cell(el("div", "hud-alert"));
    this.root.append(head, body, this.alert.node);
    parent.append(this.root);
  }
  update(m) {
    const c = m.congestion;
    this.worst = c.worst;
    this.root.classList.toggle("jump", !!c.worst);
    this.percent.set(pct(c.value));
    this.segments.set(c.value, c.band >= 3);
    this.word.set(TREND[c.trend]);
    this.chip.dataset.band = String(c.band);
    this.cost.set(m.multiplier.lost >= 0.1 ? `COSTS ×${m.multiplier.lost.toFixed(1)}` : "NO COST");
    const running = m.gridlockProgress > 0 && !m.gridlock;
    const left = Math.max(0, m.gridlockSeconds * (1 - m.gridlockProgress));
    this.alert.set(m.gridlock ? "GRIDLOCK" : running ? `QUEUE FULL  ${left.toFixed(1)}s TO GRIDLOCK` : m.capacity < 1 ? `CAPACITY ${pct(m.capacity)}  incident blocking lanes` : "");
    this.alert.node.dataset.level = m.gridlock || running ? "critical" : "warn";
  }
}
