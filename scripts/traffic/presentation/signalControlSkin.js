import { UI, Theme, world, signalTokens, riskHex, lightHex } from "../ui/theme.js";

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

// How a signal control looks. Pure drawing: given a Phaser Graphics and a view
// state it paints one control and decides nothing about interaction. Colours come
// from the active theme's tokens (themes.js): the light colours, the dial face and
// rim, the glow strength. Interaction code does not change when a theme does.
//   view = { x, y, heading, turns, state (LightState), hovered, pending,
//            pressure (0..1), risk (0..3), blocked, time (s), flash (0..1) }
// The dial is the signal head: rim and glyph take the light's colour (a red
// light also carries a stop mark, so state is never colour alone); the ring
// around it is how full the holding space is, in the congestion colour.
export function drawSignalControl(g, view, style = UI.signalControl) {
  const sig = signalTokens();
  const w = world();
  const sc = view.hovered ? style.hoverScale : 1;
  const r = style.radius * sc;
  const cx = view.x;
  const cy = view.y - style.lift;
  const R = r + style.ring;
  const riskColor = riskHex(view.risk);
  const light = lightHex(view.state);

  // Emissive themes: a soft halo in the light's colour under everything
  if (w.lightGlow > 0 && sig.glow > 0) {
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(0);
      g.beginFill(light, sig.glow * 0.14 * (view.state === 0 ? 0.7 : 1));
      g.drawCircle(cx, cy, (R + i * 5) * 2);
      g.endFill();
    }
  }
  // Physical themes: a contact shadow so the dial sits on the road
  if (sig.shadow > 0) {
    g.lineStyle(0);
    g.beginFill(0x32302a, sig.shadow);
    g.drawCircle(cx, cy + 4, R * 2);
    g.endFill();
  }

  // Holding-space ring: track, then fill clockwise from the top
  g.lineStyle(3, sig.track, 1);
  g.beginFill(sig.track, 0.55);
  g.drawCircle(cx, cy, R * 2);
  g.endFill();
  const fill = Math.min(1, Math.max(0, view.pressure));
  if (fill > 0.02) {
    g.lineStyle(3.5, riskColor, 1);
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(fill, 0.04), false, 24);
  }

  // Dial face with the light-coloured rim
  g.lineStyle(view.hovered ? 4 : 3, view.hovered ? sig.hover : light, 1);
  g.beginFill(sig.face, 1);
  g.drawCircle(cx, cy, r * 2);
  g.endFill();

  // Movement glyph, oriented to the approach's heading, in the light's colour
  const cos = Math.cos(view.heading);
  const sin = Math.sin(view.heading);
  const d = r * 2;
  const at = ([lx, ly]) => [cx + (lx * cos - ly * sin) * d, cy + (lx * sin + ly * cos) * d];
  const glyphAlpha = view.state === 0 ? 0.75 : 1;
  for (const turn of view.turns) {
    const pts = arrowPoints(turn).map(at);
    g.lineStyle(4, light, glyphAlpha);
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    const [ex, ey] = pts[pts.length - 1];
    const [px, py] = pts[pts.length - 2];
    const len = Math.hypot(ex - px, ey - py) || 1;
    const ux = (ex - px) / len;
    const uy = (ey - py) / len;
    const h = d * 0.2;
    g.lineStyle(0);
    g.beginFill(light, glyphAlpha);
    g.drawPolygon([ex + ux * h * 0.6, ey + uy * h * 0.6, ex - ux * h * 0.5 - uy * h * 0.7, ey - uy * h * 0.5 + ux * h * 0.7, ex - ux * h * 0.5 + uy * h * 0.7, ey - uy * h * 0.5 - ux * h * 0.7]);
    g.endFill();
  }

  // Stop mark: a small x badge on a red light (shape, not just colour)
  if (view.state === 0) {
    const bx = cx + r * 0.78;
    const by = cy - r * 0.78;
    g.lineStyle(0);
    g.beginFill(light, 1);
    g.drawCircle(bx, by, 11);
    g.endFill();
    g.lineStyle(2, sig.face, 1);
    g.moveTo(bx - 2.6, by - 2.6);
    g.lineTo(bx + 2.6, by + 2.6);
    g.moveTo(bx + 2.6, by - 2.6);
    g.lineTo(bx - 2.6, by + 2.6);
  }
  // Blocked by an incident: a hazard badge, opposite corner
  if (view.blocked) {
    const bx = cx - r * 0.78;
    const by = cy - r * 0.78;
    g.lineStyle(0);
    g.beginFill(w.hazard, 1);
    g.drawCircle(bx, by, 11);
    g.endFill();
    g.lineStyle(2, sig.face, 1);
    g.moveTo(bx, by - 3);
    g.lineTo(bx, by + 0.5);
    g.moveTo(bx, by + 3);
    g.lineTo(bx, by + 3.2);
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
    g.lineStyle(2, sig.hover, 0.9);
    g.drawCircle(cx, cy, (R + 5) * 2);
  }
  // Click feedback: an expanding ring
  if (view.flash > 0) {
    g.lineStyle(3, light, view.flash);
    g.drawCircle(cx, cy, (R + (1 - view.flash) * 22) * 2);
  }
  g.lineStyle(0);
}

// The lane/movement a control governs, painted over the road while it is
// hovered: a wide soft band along the whole route, with chevrons running along
// it in the direction of travel as a preview of where released cars will go.
export function drawRouteHighlight(g, route, color, time, style = UI.signalControl) {
  const pts = route.points;
  const lane = signalTokens().lane;
  g.lineStyle(30, color, world().lightGlow > 0 ? 0.26 : 0.3);
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  const spacing = 46;
  const offset = (time * 90) % spacing;
  const p = { x: 0, y: 0, angle: 0 };
  g.lineStyle(0);
  g.beginFill(lane, 0.8);
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
// {points[], at(s,out), length, slot} view; `used` is px of queue.
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
  line(total, 0, 4, signalTokens().ink, 0.14); // capacity (the whole lane)
  if (used > 1) line(lane.stopS, lane.stopS - used, 4, riskColor, 0.95); // queue, growing back from the stop line
}
