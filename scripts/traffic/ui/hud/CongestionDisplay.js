import { el, Cell, pct } from "../dom.js";
import { icon } from "../icons.js";
import { Segments } from "./Segments.js";

const SEGMENTS = 20;
const bandOf = (fill) => (fill >= 1 ? 3 : fill >= 0.85 ? 2 : fill >= 0.6 ? 1 : 0);

// Top centre: the network's pressure gauges in one panel. The big segmented bar is congestion, the
// number that sets the multiplier (the worst road's pressure, same colours as its signal control);
// beneath it, one chunky bar per input gate shows how close that queue is to filling. A full queue
// is what ends the shift, so the bars animate on their own (CSS transitions, stripes and shaking as
// they near the edge): watching one drain back from the brink is the point. Click the congestion
// header to jump to the worst road, a gate bar to jump to that gate. When a queue is full the bottom
// line becomes the countdown to gridlock.
export class CongestionDisplay {
  constructor(parent, gates, camera) {
    this.camera = camera;
    this.worst = null;
    this.root = el("div", "hud-panel hud-meter");

    const head = el("button", "hud-meter-head");
    head.addEventListener("click", () => this.worst && this.camera.glideTo(this.worst.x, this.worst.y));
    const title = el("span", "hud-label");
    title.append(icon("grid", 14), " CONGESTION");
    this.head = head;
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
    const c = m.congestion;
    this.worst = c.worst;
    this.head.classList.toggle("jump", !!c.worst);
    this.percent.set(pct(c.value));
    this.root.dataset.band = String(c.band);
    this.segments.set(c.value, c.band >= 3);
    let worstQueue = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const g = m.gates[i];
      const r = this.rows[i];
      const band = bandOf(g.fill);
      worstQueue = Math.max(worstQueue, band);
      r.count.set(`${g.queued}/${g.capacity}`);
      r.fill.css("width", `${(g.fill * 100).toFixed(1)}%`);
      r.row.dataset.band = String(band);
      r.row.classList.toggle("full", g.full);
    }
    this.root.classList.toggle("danger", worstQueue >= 2);
    const running = m.gridlockProgress > 0 && !m.gridlock;
    const left = Math.max(0, m.gridlockSeconds * (1 - m.gridlockProgress));
    this.alert.set(m.gridlock ? "GRIDLOCK" : running ? `QUEUE FULL  ${left.toFixed(1)}s TO GRIDLOCK` : m.capacity < 1 ? `CAPACITY ${pct(m.capacity)}  incident blocking lanes` : "");
    this.alert.node.dataset.level = m.gridlock || running ? "critical" : "warn";
  }
}
