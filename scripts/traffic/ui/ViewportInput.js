import { CAMERA_DEFAULTS } from "../view/ViewCamera.js";
import { edgeScrollVelocity } from "../view/edgeScroll.js";

const PAN_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const _v = { x: 0, y: 0 };
const _w = { x: 0, y: 0 };
const HOLD_SECONDS = 0.45; // press-and-hold on a world control: its second action (divert)

// Routes pointer and key input over the game viewport. Priority, highest first:
//   1. HUD: DOM panels sit above the canvas and swallow their own events, so
//      anything whose target is not the canvas never reaches this class.
//   2. World UI: a press that lands on a world control belongs to that control
//      (it activates on release over the same control and never pans). Held
//      for HOLD_SECONDS, or a right-click, it fires the control's hold action
//      instead, and the release then does nothing.
//   3. Camera: a press on empty world drags the map; the pointer near a viewport
//      edge scrolls it; arrow keys pan.
//
// Works in screen coordinates and converts through the ViewCamera, so it has no
// idea what the world contains. `worldUi` is anything with pick(wx, wy) ->
// control | null, setHover(control), activate(control), and optionally
// hold(control) and setHold(control | null, progress 0..1).
export class ViewportInput {
  constructor({ element, canvas, options = {} }) {
    this.element = element; // the game viewport
    this.canvas = canvas; // function: current game canvas (may be recreated)
    this.options = { ...CAMERA_DEFAULTS, ...options };
    this.camera = null;
    this.worldUi = null;
    this.pointer = { x: 0, y: 0, seen: false, inside: false, overWorld: false };
    this.gesture = null; // { type: "press", control } | { type: "drag", ... } | { type: "maybe-drag", ... }
    this.keys = new Set();
    this.on = (target, type, fn) => {
      target.addEventListener(type, fn);
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };
    this.cleanup = [];
    this.on(window, "pointermove", (e) => this.onMove(e));
    this.on(window, "pointerdown", (e) => this.onDown(e));
    this.on(window, "pointerup", (e) => this.onUp(e));
    this.on(window, "pointercancel", () => this.cancel());
    this.on(window, "blur", () => this.cancel());
    this.on(document.documentElement, "mouseleave", () => this.leave());
    this.on(window, "keydown", (e) => this.onKey(e, true));
    this.on(window, "keyup", (e) => this.onKey(e, false));
    // Right-click is the hold shortcut on a control, so the browser menu stays off the canvas
    this.on(window, "contextmenu", (e) => {
      if (e.target === this.canvas()) e.preventDefault();
    });
  }

  // Attach to a new level's camera and world controls.
  bind({ camera, worldUi }) {
    this.camera = camera;
    this.worldUi = worldUi;
    this.cancel();
  }

  unbind() {
    this.camera = null;
    this.worldUi = null;
    this.cancel();
  }

  // Viewport pixel coordinates of an event.
  toViewport(e, out) {
    const r = this.element.getBoundingClientRect();
    const k = this.camera ? this.camera.width / (r.width || 1) : 1;
    out.x = (e.clientX - r.left) * k;
    out.y = (e.clientY - r.top) * k;
    return out;
  }

  onMove(e) {
    const cam = this.camera;
    if (!cam) return;
    const p = this.pointer;
    this.toViewport(e, p);
    p.seen = true;
    p.inside = p.x >= 0 && p.y >= 0 && p.x <= cam.width && p.y <= cam.height;
    p.overWorld = p.inside && e.target === this.canvas();

    const g = this.gesture;
    if (g?.type === "maybe-drag") {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) >= this.options.dragThreshold) g.type = "drag";
    }
    if (g?.type === "drag") cam.moveTo(g.camX - (p.x - g.sx), g.camY - (p.y - g.sy));
    this.updateHover();
  }

  onDown(e) {
    const cam = this.camera;
    if (!cam || (e.button !== 0 && e.button !== 2) || e.target !== this.canvas()) return;
    const p = this.toViewport(e, this.pointer);
    p.seen = p.inside = p.overWorld = true;
    cam.screenToWorld(p.x, p.y, _w);
    const control = this.worldUi?.pick(_w.x, _w.y) ?? null;
    if (e.button === 2) {
      if (control) this.worldUi.hold?.(control);
      return;
    }
    if (control) this.gesture = { type: "press", control, held: 0, fired: false };
    else this.gesture = { type: "maybe-drag", sx: p.x, sy: p.y, camX: cam.x, camY: cam.y };
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch {}
    this.updateHover();
  }

  onUp(e) {
    const g = this.gesture;
    this.gesture = null;
    this.worldUi?.setHold?.(null, 0);
    if (g?.type === "press" && !g.fired && this.camera) {
      const p = this.toViewport(e, this.pointer);
      this.camera.screenToWorld(p.x, p.y, _w);
      if (this.worldUi?.pick(_w.x, _w.y) === g.control) this.worldUi.activate(g.control);
    }
    this.updateHover();
  }

  onKey(e, down) {
    if (!(e.key in PAN_KEYS)) return;
    const t = e.target.tagName;
    if (t === "SELECT" || t === "INPUT" || t === "TEXTAREA") return;
    if (down) this.keys.add(e.key);
    else this.keys.delete(e.key);
    if (down) e.preventDefault();
  }

  // Pointer left the page or the window lost focus: stop everything that depends on it.
  leave() {
    this.pointer.inside = this.pointer.overWorld = false;
    this.updateHover();
  }

  cancel() {
    this.gesture = null;
    this.worldUi?.setHold?.(null, 0);
    this.keys.clear();
    this.pointer.inside = this.pointer.overWorld = false;
    this.updateHover();
  }

  updateHover() {
    const ui = this.worldUi;
    const cam = this.camera;
    const p = this.pointer;
    let hover = null;
    if (ui && cam && p.overWorld && (!this.gesture || this.gesture.type === "press")) {
      cam.screenToWorld(p.x, p.y, _w);
      hover = ui.pick(_w.x, _w.y);
      if (this.gesture?.type === "press" && hover !== this.gesture.control) hover = null;
    }
    ui?.setHover(hover);
    const c = this.canvas();
    if (c) c.style.cursor = this.gesture?.type === "drag" ? "grabbing" : hover ? "pointer" : "default";
  }

  // Per frame, with real elapsed seconds: continuous camera motion (edge scroll,
  // keys, glides). Runs while the simulation is paused or over.
  update(dt) {
    const cam = this.camera;
    if (!cam) return;
    this.updateHold(dt);
    let vx = 0;
    let vy = 0;
    for (const k of this.keys) {
      vx += PAN_KEYS[k][0] * this.options.keySpeed;
      vy += PAN_KEYS[k][1] * this.options.keySpeed;
    }
    const p = this.pointer;
    if (!this.gesture && p.seen && p.overWorld && document.hasFocus()) {
      edgeScrollVelocity(p, cam.viewport, { margin: this.options.edgeMargin, speed: this.options.edgeSpeed }, _v);
      vx += _v.x;
      vy += _v.y;
    }
    if (vx !== 0 || vy !== 0) {
      cam.panBy(vx * dt, vy * dt);
      this.updateHover(); // the world moved under a stationary pointer
    }
    cam.update(dt);
  }

  // A press held on its control fills up, then fires the hold action once. Moving
  // off the control drains it; coming back resumes.
  updateHold(dt) {
    const g = this.gesture;
    const ui = this.worldUi;
    if (g?.type !== "press" || g.fired || !ui?.hold) return;
    const p = this.pointer;
    this.camera.screenToWorld(p.x, p.y, _w);
    g.held = ui.pick(_w.x, _w.y) === g.control ? g.held + dt : 0;
    const progress = g.held / HOLD_SECONDS;
    if (progress >= 1) {
      g.fired = true;
      ui.setHold?.(null, 0);
      ui.hold(g.control);
    } else ui.setHold?.(progress > 0.15 ? g.control : null, progress); // a quick tap shows nothing
  }

  destroy() {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
  }
}
