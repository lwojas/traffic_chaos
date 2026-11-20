// Camera model. Knows the world bounds and the viewport size, nothing about
// vehicles, signals or Phaser. It is the single owner of the world <-> screen
// transform: HUD, minimap and world-space controls all convert through it.
//
//   world coordinates   level space: roads, vehicles, signals, junctions
//   screen coordinates  viewport pixels, origin at the viewport's top-left
//   (x, y) below        the world point shown at the viewport's top-left
//
// Presentation copies x/y onto the engine camera each frame; input code calls
// the pan/centre helpers. No zoom yet, so the transform is a pure translation.

export const CAMERA_DEFAULTS = {
  edgeMargin: 28, // px from the viewport edge where edge scrolling starts
  edgeSpeed: 800, // px/s at the very edge
  keySpeed: 900, // px/s for keyboard panning
  dragThreshold: 4, // px of pointer travel before a press becomes a drag
  glideRate: 10, // higher = snappier eased moves (minimap jumps, centre-on-incident)
};

export class ViewCamera {
  constructor({ world, viewport }) {
    this.world = { w: world.w, h: world.h };
    this.viewport = { w: viewport.w, h: viewport.h };
    this.x = 0;
    this.y = 0;
    this.target = null; // eased move in progress: top-left the camera is gliding toward
    this.version = 0; // bumps whenever the view changes, so observers can redraw lazily
    this.clamp();
  }

  get width() {
    return this.viewport.w;
  }
  get height() {
    return this.viewport.h;
  }
  get centerX() {
    return this.x + this.viewport.w / 2;
  }
  get centerY() {
    return this.y + this.viewport.h / 2;
  }

  maxX() {
    return Math.max(0, this.world.w - this.viewport.w);
  }
  maxY() {
    return Math.max(0, this.world.h - this.viewport.h);
  }

  clampX(x) {
    return Math.min(Math.max(x, 0), this.maxX());
  }
  clampY(y) {
    return Math.min(Math.max(y, 0), this.maxY());
  }

  clamp() {
    const x = this.clampX(this.x);
    const y = this.clampY(this.y);
    if (x !== this.x || y !== this.y) this.version++;
    this.x = x;
    this.y = y;
  }

  setWorldBounds(w, h) {
    this.world.w = w;
    this.world.h = h;
    this.clamp();
  }

  // Keeps the same world point centred when the viewport is resized.
  setViewport(w, h) {
    if (w === this.viewport.w && h === this.viewport.h) return false;
    const cx = this.centerX;
    const cy = this.centerY;
    this.viewport.w = w;
    this.viewport.h = h;
    this.x = cx - w / 2;
    this.y = cy - h / 2;
    this.target = null;
    this.clamp();
    this.version++;
    return true;
  }

  // Instant moves cancel any glide in progress.
  moveTo(x, y) {
    this.target = null;
    this.set(x, y);
  }

  panBy(dx, dy) {
    this.moveTo(this.x + dx, this.y + dy);
  }

  centerOn(wx, wy) {
    this.moveTo(wx - this.viewport.w / 2, wy - this.viewport.h / 2);
  }

  // Eased move that ends centred on (wx, wy), clamped to the world.
  glideTo(wx, wy) {
    this.target = {
      x: this.clampX(wx - this.viewport.w / 2),
      y: this.clampY(wy - this.viewport.h / 2),
    };
  }

  update(dt) {
    const t = this.target;
    if (!t) return;
    const k = 1 - Math.exp(-CAMERA_DEFAULTS.glideRate * dt);
    let nx = this.x + (t.x - this.x) * k;
    let ny = this.y + (t.y - this.y) * k;
    if (Math.abs(t.x - nx) < 0.25 && Math.abs(t.y - ny) < 0.25) {
      nx = t.x;
      ny = t.y;
      this.target = null;
    }
    this.set(nx, ny);
  }

  set(x, y) {
    const cx = this.clampX(x);
    const cy = this.clampY(y);
    if (cx !== this.x || cy !== this.y) this.version++;
    this.x = cx;
    this.y = cy;
  }

  worldToScreen(wx, wy, out = { x: 0, y: 0 }) {
    out.x = wx - this.x;
    out.y = wy - this.y;
    return out;
  }

  screenToWorld(sx, sy, out = { x: 0, y: 0 }) {
    out.x = sx + this.x;
    out.y = sy + this.y;
    return out;
  }

  // True when a world point is visible, with an optional margin in px.
  isVisible(wx, wy, margin = 0) {
    return wx >= this.x - margin && wx <= this.x + this.viewport.w + margin && wy >= this.y - margin && wy <= this.y + this.viewport.h + margin;
  }
}
