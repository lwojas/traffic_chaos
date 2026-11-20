import { CAMERA_DEFAULTS } from "./ViewCamera.js";

// Edge scrolling: how fast the camera should move for a pointer position inside
// the viewport (viewport pixels). Speed ramps up quadratically from 0 at the
// inner border of the margin to full speed at the edge, so grazing the margin
// barely moves the camera. Returns px/s on each axis; (0, 0) when the pointer is
// null or outside the viewport.
export function edgeScrollVelocity(pointer, viewport, { margin = CAMERA_DEFAULTS.edgeMargin, speed = CAMERA_DEFAULTS.edgeSpeed } = {}, out = { x: 0, y: 0 }) {
  out.x = 0;
  out.y = 0;
  if (!pointer || margin <= 0) return out;
  const { x, y } = pointer;
  if (x < 0 || y < 0 || x > viewport.w || y > viewport.h) return out;
  // Never let the two margins overlap on a tiny viewport
  const mx = Math.min(margin, viewport.w / 2);
  const my = Math.min(margin, viewport.h / 2);
  out.x = ramp(mx - x, mx) - ramp(x - (viewport.w - mx), mx);
  out.y = ramp(my - y, my) - ramp(y - (viewport.h - my), my);
  out.x = out.x * -speed || 0; // pointer at the left edge moves the view left (negative); `|| 0` drops -0
  out.y = out.y * -speed || 0;
  return out;
}

function ramp(depth, margin) {
  if (depth <= 0) return 0;
  const t = Math.min(1, depth / margin);
  return t * t;
}
