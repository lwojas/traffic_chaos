import { el, Cell, pct } from "../dom.js";
import { icon } from "../icons.js";
import { Segments } from "./Segments.js";

// Network health, top-left. GRID LOAD is the share of lane length occupied
// (stats.networkLoad); STABILITY is a word over the two failure stats (fullest
// input queue, lanes lost to incidents). When a queue is full the line below
// becomes the countdown to the level-ending gridlock: the most urgent thing on screen.
export class LoadDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-load");
    const head = el("div", "hud-load-head");
    const title = el("span", "hud-label");
    title.append(icon("grid", 14), " GRID LOAD");
    this.percent = new Cell(el("span", "hud-load-percent", "0%"));
    head.append(title, this.percent.node);
    const body = el("div", "hud-load-body");
    this.segments = new Segments(body);
    const stab = el("div", "hud-stability");
    stab.append(el("span", "hud-label", "STABILITY"));
    const word = el("span", "hud-chip-state");
    word.append(el("i", "hud-dot"));
    this.word = new Cell(el("b", "", "STABLE"));
    word.append(this.word.node);
    this.chip = word;
    stab.append(word);
    body.append(stab);
    this.alert = new Cell(el("div", "hud-alert"));
    this.root.append(head, body, this.alert.node);
    parent.append(this.root);
  }
  update(m) {
    this.percent.set(pct(m.load));
    this.segments.set(m.load, m.stability.band >= 3);
    this.word.set(m.stability.label);
    this.chip.dataset.band = String(m.stability.band);
    const running = m.gridlockProgress > 0 && !m.gridlock;
    const left = Math.max(0, m.gridlockSeconds * (1 - m.gridlockProgress));
    this.alert.set(m.gridlock ? "GRIDLOCK" : running ? `QUEUE FULL  ${left.toFixed(1)}s TO GRIDLOCK` : m.capacity < 1 ? `CAPACITY ${pct(m.capacity)}  incident blocking lanes` : "");
    this.alert.node.dataset.level = m.gridlock || running ? "critical" : "warn";
  }
}
