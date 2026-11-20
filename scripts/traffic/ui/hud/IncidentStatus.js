import { el, Cell } from "../dom.js";

// Active incident count. Clicking it cycles the camera through the active ones.
export class IncidentStatus {
  constructor(parent, camera) {
    this.camera = camera;
    this.root = el("button", "hud-panel hud-incidents");
    this.root.title = "Jump to an active incident";
    this.root.append(el("span", "hud-label", "INCIDENTS"));
    const count = el("span", "hud-value", "0");
    this.root.append(count);
    this.count = new Cell(count);
    this.model = null;
    this.next = 0;
    this.root.addEventListener("click", () => {
      const list = this.model?.incidents ?? [];
      if (list.length === 0) return;
      const i = list[this.next++ % list.length];
      this.camera.glideTo(i.x, i.y);
    });
    parent.append(this.root);
  }
  update(m) {
    this.model = m;
    this.count.set(String(m.incidentsActive));
    this.root.classList.toggle("active", m.incidentsActive > 0);
  }
}
