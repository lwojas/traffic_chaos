// Pure polyline helpers. No Phaser, no ECS: usable by the game, tests and an editor.

export function buildPath(points) {
  const n = points.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][0];
    ys[i] = points[i][1];
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { xs, ys, cum, count: n, length: cum[n - 1] };
}

// Writes position and heading at distance s. s outside [0, length] extrapolates
// along the first/last segment so vehicles overhanging a lane end stay sane.
export function pointAt(path, s, out) {
  const last = path.count - 2;
  let i = 0;
  if (s >= path.length) i = last;
  else if (s > 0) while (i < last && path.cum[i + 1] < s) i++;
  const dx = path.xs[i + 1] - path.xs[i];
  const dy = path.ys[i + 1] - path.ys[i];
  const segLen = path.cum[i + 1] - path.cum[i] || 1;
  const t = (s - path.cum[i]) / segLen;
  out.x = path.xs[i] + dx * t;
  out.y = path.ys[i] + dy * t;
  out.angle = Math.atan2(dy, dx);
  return out;
}

export function endDirection(points) {
  const n = points.length;
  const dx = points[n - 1][0] - points[n - 2][0];
  const dy = points[n - 1][1] - points[n - 2][1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

export function startDirection(points) {
  const dx = points[1][0] - points[0][0];
  const dy = points[1][1] - points[0][1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

// Connector between the end of one lane and the start of another: a straight
// line when headings match, otherwise a quadratic curve through the point where
// the two tangent lines meet.
export function connectorPoints(p0, d0, p2, d2, samples = 12) {
  const cross = d0[0] * d2[1] - d0[1] * d2[0];
  if (Math.abs(cross) < 1e-6) return [p0, p2];
  // p0 + t*d0 = p2 - u*d2
  const rx = p2[0] - p0[0];
  const ry = p2[1] - p0[1];
  const t = (rx * d2[1] - ry * d2[0]) / cross;
  const c = [p0[0] + d0[0] * t, p0[1] + d0[1] * t];
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const k = i / samples;
    const a = (1 - k) * (1 - k);
    const b = 2 * (1 - k) * k;
    const e = k * k;
    pts.push([a * p0[0] + b * c[0] + e * p2[0], a * p0[1] + b * c[1] + e * p2[1]]);
  }
  return pts;
}

export function densify(points, step = 4) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(points[points.length - 1]);
  return out;
}

// Where two polylines come within `distance` of each other. Returns null when
// they never do, otherwise the interval of path distance on each polyline plus
// the contact centre: { a: [s0, s1], b: [s0, s1], x, y }. Paths inside one
// junction meet once (a crossing or a merge), so one interval per side is enough.
export function proximityInterval(ptsA, ptsB, distance, step = 2) {
  const da = densify(ptsA, step);
  const db = densify(ptsB, step);
  const sa = cumulative(da);
  const sb = cumulative(db);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, cx = 0, cy = 0, n = 0;
  for (let i = 0; i < da.length; i++) {
    for (let k = 0; k < db.length; k++) {
      if (Math.hypot(da[i][0] - db[k][0], da[i][1] - db[k][1]) >= distance) continue;
      if (sa[i] < a0) a0 = sa[i];
      if (sa[i] > a1) a1 = sa[i];
      if (sb[k] < b0) b0 = sb[k];
      if (sb[k] > b1) b1 = sb[k];
      cx += da[i][0];
      cy += da[i][1];
      n++;
    }
  }
  if (n === 0) return null;
  return { a: [a0, a1], b: [b0, b1], x: cx / n, y: cy / n };
}

function cumulative(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}
