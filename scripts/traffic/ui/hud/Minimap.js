import { el } from "../dom.js";
import { UI } from "../theme.js";
import { MinimapTransform, fitMinimapSize } from "../../view/MinimapTransform.js";
import { dangerColor } from "../theme.js";

const _p = { x: 0, y: 0 };
const _r = { x: 0, y: 0, w: 0, h: 0 };

// Navigation overview. Draws from level topology (roads, junctions, gates) and a
// few runtime markers (gate queue pressure, incidents), plus the camera's view
// rectangle. It never renders the game world and owns no simulation logic.
// Pressing or dragging on it re-centres the camera: it is just another camera control.
export class Minimap {
  constructor(parent, { level, camera, gates, outputs, theme = UI.minimap }) {
    this.level = level;
    this.camera = camera;
    this.gates = gates; // [{ id, x, y }]
    this.outputs = outputs;
    this.theme = theme;
    this.root = el("div", "hud-panel hud-minimap");
    this.canvas = el("canvas", "hud-minimap-canvas");
    this.root.append(this.canvas);
    parent.append(this.root);
    this.ctx = this.canvas.getContext("2d");
    this.size = { w: 0, h: 0 };
    this.model = null;
    this.drawnModel = null;
    this.drawnVersion = -1;
    this.drawnKey = "";
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
    const t = this.theme;
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

  drawStatic() {
    const t = this.theme;
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
    this.layout();
    if (this.camera.version === this.drawnVersion && this.model === this.drawnModel) return;
    this.drawnVersion = this.camera.version;
    this.drawnModel = this.model;
    this.draw();
  }

  draw() {
    const c = this.ctx;
    const t = this.theme;
    const tf = this.transform;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.staticLayer, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = this.model;
    if (m) {
      for (const g of this.gates) {
        const info = m.gates.find((x) => x.id === g.id);
        tf.worldToMap(g.x, g.y, _p);
        c.fillStyle = info ? dangerColor(info.fill) : t.input;
        c.beginPath();
        c.arc(_p.x, _p.y, 4, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = t.output;
      c.lineWidth = 2;
      for (const g of this.outputs) {
        tf.worldToMap(g.x, g.y, _p);
        c.beginPath();
        c.arc(_p.x, _p.y, 3.5, 0, Math.PI * 2);
        c.stroke();
      }
      c.strokeStyle = t.incident;
      c.lineWidth = 2.5;
      for (const i of m.incidents) {
        tf.worldToMap(i.x, i.y, _p);
        c.beginPath();
        c.moveTo(_p.x - 4, _p.y - 4);
        c.lineTo(_p.x + 4, _p.y + 4);
        c.moveTo(_p.x + 4, _p.y - 4);
        c.lineTo(_p.x - 4, _p.y + 4);
        c.stroke();
      }
    }
    tf.viewRect(this.camera, _r);
    c.strokeStyle = t.viewport;
    c.lineWidth = 1.5;
    c.strokeRect(_r.x + 0.5, _r.y + 0.5, Math.max(2, _r.w - 1), Math.max(2, _r.h - 1));
  }
}
