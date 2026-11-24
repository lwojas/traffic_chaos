import { el, Cell } from "../dom.js";
import { UI, Theme, dangerColor, riskCss } from "../theme.js";
import { MinimapTransform, fitMinimapSize } from "../../view/MinimapTransform.js";

const _p = { x: 0, y: 0 };
const _r = { x: 0, y: 0, w: 0, h: 0 };

// Tactical overview card: "NETWORK MAP" with a live dot, and the map in a recessed well.
// Navigation overview. Draws from level topology (roads, junctions, gates) and a
// few runtime markers (gate queue pressure, incidents, diversions), plus the camera's view
// rectangle. It never renders the game world and owns no simulation logic.
// Pressing or dragging on it re-centres the camera: it is just another camera control.
export class Minimap {
  constructor(parent, { level, camera, gates, outputs, layout = UI.minimap }) {
    this.level = level;
    this.camera = camera;
    this.gates = gates; // [{ id, x, y }]
    this.outputs = outputs;
    this.layoutLimits = layout;
    this.root = el("div", "hud-panel hud-minimap");
    const head = el("div", "hud-minimap-head");
    head.append(el("span", "hud-label", "NETWORK MAP"));
    const live = el("span", "hud-live");
    live.append(el("i", "hud-dot"));
    this.live = new Cell(el("b", "", "LIVE"));
    live.append(this.live.node);
    head.append(live);
    const well = el("div", "hud-minimap-well");
    this.canvas = el("canvas", "hud-minimap-canvas");
    well.append(this.canvas);
    this.root.append(head, well);
    this.unsubscribe = Theme.onChange(() => this.restyle());
    parent.append(this.root);
    this.ctx = this.canvas.getContext("2d");
    this.size = { w: 0, h: 0 };
    this.model = null;
    this.drawnModel = null;
    this.drawnVersion = -1;
    this.drawnKey = "";
    this.animating = false;
    this.layout();

    const aim = (e, glide) => {
      const r = this.canvas.getBoundingClientRect();
      this.transform.mapToWorld(((e.clientX - r.left) / r.width) * this.size.w, ((e.clientY - r.top) / r.height) * this.size.h, _p);
      if (glide) camera.glideTo(_p.x, _p.y);
      else camera.centerOn(_p.x, _p.y);
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.dragging = true;
      aim(e, true);
    });
    this.canvas.addEventListener("pointermove", (e) => this.dragging && aim(e, false));
    const end = () => (this.dragging = false);
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
  }

  // Fits the minimap to the world's aspect ratio and the current viewport; redraws the static layer.
  layout() {
    const cam = this.camera;
    const t = this.layoutLimits;
    const max = { w: Math.min(t.maxWidth, cam.width * t.maxViewportShare), h: Math.min(t.maxHeight, cam.height * t.maxViewportShare) };
    const size = fitMinimapSize(cam.world, max);
    if (size.w === this.size.w && size.h === this.size.h) return;
    this.size = size;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(size.w * dpr);
    this.canvas.height = Math.round(size.h * dpr);
    this.canvas.style.width = `${size.w}px`;
    this.canvas.style.height = `${size.h}px`;
    this.dpr = dpr;
    this.transform = new MinimapTransform(cam.world, size);
    this.drawStatic();
    this.drawnVersion = -1;
  }

  // Theme changed: rebuild the cached road layer and redraw
  restyle() {
    if (!this.transform) return;
    this.drawStatic();
    this.drawnVersion = -1;
  }

  destroy() {
    this.unsubscribe();
  }

  drawStatic() {
    const t = Theme.theme.minimap;
    const tf = this.transform;
    const layer = document.createElement("canvas");
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const c = layer.getContext("2d");
    c.scale(this.dpr, this.dpr);
    c.fillStyle = t.background;
    c.fillRect(0, 0, this.size.w, this.size.h);
    c.strokeStyle = t.road;
    c.lineCap = "butt";
    for (const r of this.level.roads ?? []) {
      c.lineWidth = Math.max(2, r.width * tf.scale);
      c.beginPath();
      r.points.forEach(([x, y], i) => {
        tf.worldToMap(x, y, _p);
        if (i === 0) c.moveTo(_p.x, _p.y);
        else c.lineTo(_p.x, _p.y);
      });
      c.stroke();
    }
    c.fillStyle = t.junction;
    for (const j of this.level.junctions) {
      tf.worldToMap(j.bounds.x, j.bounds.y, _p);
      const w = Math.max(4, j.bounds.w * tf.scale);
      const h = Math.max(4, j.bounds.h * tf.scale);
      c.fillRect(_p.x + (j.bounds.w * tf.scale - w) / 2, _p.y + (j.bounds.h * tf.scale - h) / 2, w, h);
    }
    this.staticLayer = layer;
  }

  update(model) {
    this.model = model ?? this.model;
    if (model) this.live.set(model.paused ? "PAUSED" : "LIVE");
    this.layout();
    if (!this.animating && this.camera.version === this.drawnVersion && this.model === this.drawnModel) return;
    this.drawnVersion = this.camera.version;
    this.drawnModel = this.model;
    this.draw();
  }

  draw() {
    const c = this.ctx;
    const t = { ...Theme.theme.minimap, risk: [0, 1, 2, 3].map(riskCss) };
    const tf = this.transform;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.staticLayer, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = this.model;
    this.animating = false;
    c.shadowBlur = t.glow; // themes with emissive HUD give markers a halo; each marker sets its own shadowColor
    if (m) {
      const time = performance.now() / 1000;
      tf.viewRect(this.camera, _r);
      const inView = (x, y) => {
        tf.worldToMap(x, y, _p);
        return _p.x >= _r.x && _p.x <= _r.x + _r.w && _p.y >= _r.y && _p.y <= _r.y + _r.h;
      };
      // Queue density: a strip along each loaded approach lane, from its stop line back to the queue tail
      c.lineCap = "round";
      for (const s of m.streams) {
        if (s.queue < 1) continue;
        const color = t.risk[s.risk];
        tf.worldToMap(s.x, s.y, _p);
        const sx = _p.x;
        const sy = _p.y;
        tf.worldToMap(s.tx, s.ty, _p);
        c.strokeStyle = c.shadowColor = color;
        c.lineWidth = 3 + s.risk;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(_p.x, _p.y);
        c.stroke();
      }
      c.lineCap = "butt";
      // Pressure markers at the stop line: grow and pulse with risk. A pulse away from the view is an alarm.
      let alarm = false;
      for (const s of m.streams) {
        if (s.risk < 1 && !s.blocked) continue;
        const hot = s.risk >= 2 || s.blocked;
        tf.worldToMap(s.x, s.y, _p);
        const color = t.risk[s.blocked ? 3 : s.risk];
        const away = hot && !inView(s.x, s.y);
        if (away) alarm = true;
        const k = hot ? 0.5 + 0.5 * Math.sin(time * (s.risk >= 3 ? 9 : 5)) : 0;
        if (hot) this.animating = true;
        c.fillStyle = c.shadowColor = color;
        c.beginPath();
        c.arc(_p.x, _p.y, 3 + s.risk * 1.2, 0, Math.PI * 2);
        c.fill();
        if (hot) {
          c.strokeStyle = color;
          c.globalAlpha = 1 - k * 0.7;
          c.lineWidth = away ? 2.5 : 1.5;
          c.beginPath();
          c.arc(_p.x, _p.y, 6 + s.risk * 2 + k * (away ? 8 : 4), 0, Math.PI * 2);
          c.stroke();
          c.globalAlpha = 1;
        }
      }
      for (const g of this.gates) {
        const info = m.gates.find((x) => x.id === g.id);
        if (!info || info.fill < 0.5) continue; // gate pressure: only when the off-map queue is filling
        tf.worldToMap(g.x, g.y, _p);
        c.strokeStyle = dangerColor(info.fill);
        c.lineWidth = 2;
        c.beginPath();
        c.arc(_p.x, _p.y, 5.5, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = t.input;
      for (const g of this.gates) {
        tf.worldToMap(g.x, g.y, _p);
        c.beginPath();
        c.arc(_p.x, _p.y, 2, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = t.output;
      c.lineWidth = 2;
      for (const g of this.outputs) {
        tf.worldToMap(g.x, g.y, _p);
        c.beginPath();
        c.arc(_p.x, _p.y, 3, 0, Math.PI * 2);
        c.stroke();
      }
      // Diversions: a small striped barrier at each closed movement's stop line
      for (const s of m.streams) {
        if (!s.diverted) continue;
        tf.worldToMap(s.x, s.y, _p);
        c.shadowColor = "transparent";
        c.fillStyle = "#ffffff";
        c.fillRect(_p.x - 5, _p.y - 2.5, 10, 5);
        c.fillStyle = t.incident;
        c.fillRect(_p.x - 5, _p.y - 2.5, 2.5, 5);
        c.fillRect(_p.x - 1.25, _p.y - 2.5, 2.5, 5);
        c.fillRect(_p.x + 2.5, _p.y - 2.5, 2.5, 5);
      }
      // Incidents: a pulsing cross with a ring, always on top
      for (const i of m.incidents) {
        tf.worldToMap(i.x, i.y, _p);
        if (i.kind !== "collision") {
          // Roadworks: a still amber bar, no pulse, so it is not mistaken for a crash
          c.fillStyle = "#ffc400";
          c.fillRect(_p.x - 5, _p.y - 2, 10, 4);
          continue;
        }
        this.animating = true;
        const k = 0.5 + 0.5 * Math.sin(time * 6);
        c.strokeStyle = c.shadowColor = t.incident;
        c.globalAlpha = 1 - k * 0.6;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(_p.x, _p.y, 7 + k * 5, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(_p.x - 4, _p.y - 4);
        c.lineTo(_p.x + 4, _p.y + 4);
        c.moveTo(_p.x + 4, _p.y - 4);
        c.lineTo(_p.x - 4, _p.y + 4);
        c.stroke();
      }
      // A remote alarm also pulses the minimap frame, so a glance is enough
      if (alarm) {
        c.strokeStyle = t.risk[3];
        c.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(time * 7));
        c.lineWidth = 3;
        c.strokeRect(1.5, 1.5, this.size.w - 3, this.size.h - 3);
        c.globalAlpha = 1;
      }
    }
    c.shadowBlur = 0;
    tf.viewRect(this.camera, _r);
    c.strokeStyle = t.viewport;
    c.lineWidth = 1.5;
    c.strokeRect(_r.x + 0.5, _r.y + 0.5, Math.max(2, _r.w - 1), Math.max(2, _r.h - 1));
  }
}
