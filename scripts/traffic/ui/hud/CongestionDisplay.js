import { el, Cell, pct } from "../dom.js";
import { icon } from "../icons.js";
import { Segments } from "./Segments.js";

const SEGMENTS = 20;
const bandOf = (fill) => (fill >= 1 ? 3 : fill >= 0.85 ? 2 : fill >= 0.6 ? 1 : 0);

// Top centre: the input queues in one panel. The big segmented bar is the combination of the gate
// queues (all waiting cars / all queue capacity, coloured by the fullest gate); beneath it, one
// chunky bar per input gate shows how close that queue is to filling. A full queue
// is what ends the shift, so the bars animate on their own (CSS transitions, stripes and shaking as
// they near the edge): watching one drain back from the brink is the point. Click a gate bar
// to jump to that gate. When a queue is full the bottom
// line becomes the countdown to gridlock.
export class CongestionDisplay {
  constructor(parent, gates, camera) {
    this.camera = camera;
    this.root = el("div", "hud-panel hud-meter");

    const head = el("div", "hud-meter-head");
    const title = el("span", "hud-label");
    title.append(icon("grid", 14), " QUEUES");
    this.percent = new Cell(el("b", "hud-meter-percent", "0%"));
    head.append(title, this.percent.node);
    this.gauge = el("div", "hud-gauge");
    this.segments = new Segments(this.gauge, SEGMENTS);

    this.root.append(head, this.gauge);

    const queues = el("div", "hud-queues");
    this.rows = gates.map((g) => {
      const row = el("button", "hud-queue");
      row.title = `${g.label}: jump to gate`;
      const name = el("span", "hud-queue-name", g.label.replace(/^INPUT\s+/i, ""));
      const track = el("span", "hud-queue-track");
      const fill = el("span", "hud-queue-fill");
      track.append(fill);
      const count = el("span", "hud-queue-count", "0");
      row.append(name, track, count);
      row.addEventListener("click", () => camera.glideTo(g.x, g.y));
      queues.append(row);
      return { row, fill: new Cell(fill), count: new Cell(count) };
    });
    this.root.append(el("div", "hud-label hud-meter-sub", "INPUT QUEUES"), queues);

    this.alert = new Cell(el("div", "hud-alert"));
    this.root.append(this.alert.node);
    parent.append(this.root);
  }

  update(m) {
    let worstQueue = 0;
    let queued = 0;
    let capacity = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const g = m.gates[i];
      const r = this.rows[i];
      const band = bandOf(g.fill);
      worstQueue = Math.max(worstQueue, band);
      queued += g.queued;
      capacity += g.capacity;
      r.count.set(`${g.queued}/${g.capacity}`);
      r.fill.css("width", `${(g.fill * 100).toFixed(1)}%`);
      r.row.dataset.band = String(band);
      r.row.classList.toggle("full", g.full);
    }
    const total = capacity ? queued / capacity : 0;
    this.percent.set(pct(total));
    this.root.dataset.band = String(worstQueue);
    this.segments.set(total, worstQueue >= 3);
    this.root.classList.toggle("danger", worstQueue >= 2);
    const running = m.gridlockProgress > 0 && !m.gridlock;
    const left = Math.max(0, m.gridlockSeconds * (1 - m.gridlockProgress));
    this.alert.set(m.gridlock ? "GRIDLOCK" : running ? `QUEUE FULL  ${left.toFixed(1)}s TO GRIDLOCK` : m.capacity < 1 ? `CAPACITY ${pct(m.capacity)}  incident blocking lanes` : "");
    this.alert.node.dataset.level = m.gridlock || running ? "critical" : "warn";
  }
}
