import { UI } from "../ui/theme.js";

// Movement glyphs in the approach's local frame: +x is the direction of travel,
// +y is the driver's right. Units of the control diameter. A turn is a short
// run-up then a quarter curve, so a right-turn control reads as "this lane
// bends right", a straight one as "this lane goes on".
function arrowPoints(turn) {
  if (turn === "straight") return [[-0.3, 0], [0.26, 0]];
  const side = turn === "left" ? -1 : 1;
  if (turn === "uturn") return [[-0.28, -0.14 * side], [0.08, -0.14 * side], [0.18, 0], [0.08, 0.14 * side], [-0.12, 0.14 * side]];
  const pts = [[-0.3, 0], [-0.08, 0]];
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    pts.push([-0.08 + 0.3 * Math.sin((t * Math.PI) / 2), side * 0.3 * (1 - Math.cos((t * Math.PI) / 2))]);
  }
  return pts;
}

function tint(g, color, alpha) {
  g.beginFill(color, alpha);
}

// How a signal control looks. Pure drawing: given a Phaser Graphics and a view
// state it paints one control and decides nothing about interaction. Replace
// this function (or its tokens in theme.js) to restyle controls; the layer,
// hit-testing and commands do not change.
//   view = { x, y, heading, turns, state (LightState), hovered, pending,
//            pressure (0..1), risk (0..3), blocked, time (s), flash (0..1) }
// The button shows the light (colour) and the movement (arrow); the ring around
// it is how full the holding space is, in the risk colour.
export function drawSignalControl(g, view, style = UI.signalControl) {
  const c = style.colors;
  const sc = view.hovered ? style.hoverScale : 1;
  const r = style.radius * sc;
  const cx = view.x;
  const cy = view.y - style.lift;
  const R = r + style.ring;
  const riskColor = c.risk[view.risk];

  // Soft shadow, then a dark lip so the button reads as pressable
  g.lineStyle(0);
  tint(g, 0x000000, 0.28);
  g.drawCircle(cx, cy + 4, R * 2 + 2);
  g.endFill();
  tint(g, c.lightDark[view.state], 1);
  g.drawCircle(cx, cy + 2.5, r * 2);
  g.endFill();

  // Holding-space ring: track, then fill clockwise from the top
  g.lineStyle(3, c.track, 0.6);
  g.drawCircle(cx, cy, R * 2);
  const fill = Math.min(1, Math.max(0, view.pressure));
  if (fill > 0.02) {
    g.lineStyle(3.5, riskColor, 1);
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(fill, 0.04), false, 24);
  }

  // Button face
  g.lineStyle(view.hovered ? 3 : 2, view.hovered ? c.hover : c.track, 1);
  tint(g, c.light[view.state], 1);
  g.drawCircle(cx, cy, r * 2);
  g.endFill();

  // Movement glyph, oriented to the approach's heading
  const cos = Math.cos(view.heading);
  const sin = Math.sin(view.heading);
  const d = r * 2;
  const at = ([lx, ly]) => [cx + (lx * cos - ly * sin) * d, cy + (lx * sin + ly * cos) * d];
  for (const turn of view.turns) {
    const pts = arrowPoints(turn).map(at);
    g.lineStyle(4, c.glyph, 1);
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    const [ex, ey] = pts[pts.length - 1];
    const [px, py] = pts[pts.length - 2];
    const len = Math.hypot(ex - px, ey - py) || 1;
    const ux = (ex - px) / len;
    const uy = (ey - py) / len;
    const h = d * 0.2;
    g.lineStyle(0);
    tint(g, c.glyph, 1);
    g.drawPolygon([ex + ux * h * 0.6, ey + uy * h * 0.6, ex - ux * h * 0.5 - uy * h * 0.7, ey - uy * h * 0.5 + ux * h * 0.7, ex - ux * h * 0.5 + uy * h * 0.7, ey - uy * h * 0.5 - ux * h * 0.7]);
    g.endFill();
  }

  // Danger pulse: the worse the risk, the faster and wider the ring
  if (view.risk >= 2) {
    const speed = view.risk >= 3 ? 9 : 5;
    const k = 0.5 + 0.5 * Math.sin(view.time * speed);
    g.lineStyle(2.5, riskColor, 0.75 * (1 - k * 0.6));
    g.drawCircle(cx, cy, (R + 3 + k * 7) * 2);
  }
  // A command has been issued but the simulation has not applied it yet (paused)
  if (view.pending) {
    g.lineStyle(2, c.pending, 0.9);
    g.drawCircle(cx, cy, (R + 5) * 2);
  }
  // Click feedback: an expanding ring
  if (view.flash > 0) {
    g.lineStyle(3, c.hover, view.flash);
    g.drawCircle(cx, cy, (R + (1 - view.flash) * 22) * 2);
  }
  g.lineStyle(0);
}

// The lane/movement a control governs, painted over the road while it is
// hovered: a wide soft band along the whole route, with chevrons running along
// it in the direction of travel as a preview of where released cars will go.
export function drawRouteHighlight(g, route, color, time, style = UI.signalControl) {
  const pts = route.points;
  g.lineStyle(30, color, 0.2);
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  const spacing = 46;
  const offset = (time * 90) % spacing;
  const p = { x: 0, y: 0, angle: 0 };
  g.lineStyle(0);
  tint(g, 0xffffff, 0.75);
  for (let s = offset; s < route.path.length; s += spacing) {
    route.at(s, p);
    const ca = Math.cos(p.angle);
    const sa = Math.sin(p.angle);
    const L = 8;
    g.drawPolygon([p.x + ca * L, p.y + sa * L, p.x - ca * L * 0.6 - sa * L, p.y - sa * L * 0.6 + ca * L, p.x - ca * L * 0.2, p.y - sa * L * 0.2, p.x - ca * L * 0.6 + sa * L, p.y - sa * L * 0.6 - ca * L]);
  }
  g.endFill();
}

// A gauge along the roadside of an approach lane: how much of the lane's real
// capacity its waiting queue is using, in the risk colour. `lane` is a
// {points[], at(s,out), length, slot} view; `used` is metres... px of queue.
export function drawLaneGauge(g, lane, usedPx, riskColor, side = 1) {
  const p = { x: 0, y: 0, angle: 0 };
  const total = lane.stopS;
  const used = Math.min(total, usedPx);
  const nx = (a) => -Math.sin(a) * 25 * side;
  const ny = (a) => Math.cos(a) * 25 * side;
  const line = (from, to, w, color, alpha) => {
    g.lineStyle(w, color, alpha);
    lane.at(from, p);
    g.moveTo(p.x + nx(p.angle), p.y + ny(p.angle));
    lane.at(to, p);
    g.lineTo(p.x + nx(p.angle), p.y + ny(p.angle));
  };
  line(total, 0, 4, 0x10131a, 0.35); // capacity (the whole lane)
  if (used > 1) line(lane.stopS, lane.stopS - used, 4, riskColor, 0.95); // queue, growing back from the stop line
}
