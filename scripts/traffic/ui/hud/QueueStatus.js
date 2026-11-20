import { el, Cell } from "../dom.js";
import { dangerColor } from "../theme.js";

// Compact per-input-gate queue bars. Clicking one centres the camera on that gate.
export class QueueStatus {
  constructor(parent, gates, camera) {
    this.root = el("div", "hud-panel hud-queues");
    this.root.append(el("div", "hud-label", "INPUT QUEUES"));
    const grid = el("div", "hud-queue-grid");
    this.rows = gates.map((g) => {
      const row = el("button", "hud-queue");
      row.title = `${g.label}: jump to gate`;
      const name = el("span", "hud-queue-name", g.label.replace(/^INPUT\s+/i, ""));
      const track = el("span", "hud-track");
      const fill = el("span", "hud-fill");
      track.append(fill);
      const count = el("span", "hud-queue-count", "0");
      row.append(name, track, count);
      row.addEventListener("click", () => camera.glideTo(g.x, g.y));
      grid.append(row);
      return { row, fill: new Cell(fill), count: new Cell(count) };
    });
    this.root.append(grid);
    parent.append(this.root);
  }
  update(m) {
    for (let i = 0; i < this.rows.length; i++) {
      const g = m.gates[i];
      const r = this.rows[i];
      r.count.set(`${g.queued}/${g.capacity}`);
      r.fill.css("width", `${(g.fill * 100).toFixed(0)}%`);
      r.fill.css("background", dangerColor(g.fill));
      r.row.classList.toggle("full", g.full);
    }
  }
}
