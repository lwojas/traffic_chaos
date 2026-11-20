// World <-> minimap coordinate mapping. The map is fitted inside `size` with the
// world's aspect ratio. Pure maths, so it is shared by the minimap renderer,
// its click handling and tests.
export class MinimapTransform {
  constructor(world, size) {
    this.world = world;
    this.size = size;
    this.scale = Math.min(size.w / world.w, size.h / world.h);
    this.offsetX = (size.w - world.w * this.scale) / 2;
    this.offsetY = (size.h - world.h * this.scale) / 2;
  }

  worldToMap(wx, wy, out = { x: 0, y: 0 }) {
    out.x = this.offsetX + wx * this.scale;
    out.y = this.offsetY + wy * this.scale;
    return out;
  }

  // Map coordinates outside the drawn world are clamped onto its edge.
  mapToWorld(mx, my, out = { x: 0, y: 0 }) {
    out.x = Math.min(Math.max((mx - this.offsetX) / this.scale, 0), this.world.w);
    out.y = Math.min(Math.max((my - this.offsetY) / this.scale, 0), this.world.h);
    return out;
  }

  // Rectangle (map coordinates) covered by a ViewCamera's current view.
  viewRect(camera, out = { x: 0, y: 0, w: 0, h: 0 }) {
    out.x = this.offsetX + camera.x * this.scale;
    out.y = this.offsetY + camera.y * this.scale;
    out.w = camera.width * this.scale;
    out.h = camera.height * this.scale;
    return out;
  }
}

// Largest size with the world's aspect ratio that fits inside max.w x max.h.
export function fitMinimapSize(world, max) {
  const s = Math.min(max.w / world.w, max.h / world.h);
  return { w: Math.max(1, Math.round(world.w * s)), h: Math.max(1, Math.round(world.h * s)) };
}
