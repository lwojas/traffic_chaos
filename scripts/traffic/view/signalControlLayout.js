import { compileLevel } from "../level/compileLevel.js";
import { pointAt } from "../util/geometry.js";

// Where each world-space signal control sits. Derived from the level topology
// (no ECS, no Phaser): one control per (signal group, approach lane) pair,
// placed beside that lane's stop line on the roadside, so the control belongs
// to the light and the movement it governs. Controls on the same approach arm
// are laid out as seen head-on (driving direction up): the turn controls sit side by side nearest
// the junction (left on the driver's left, right on the driver's right) and the straight control
// below them (further upstream), centred under the turn row.
//
// Returns [{ id, groupId, laneId, junctionId, label, direction, x, y, heading, turns, routes, approach }]
//   heading    direction of travel on the approach lane (radians)
//   direction  plain-language heading of that travel ("Southbound")
//   turns      movement types this group makes from that lane ("straight", "right"...)
//   approach   the approach lane's polyline
//   routes     polylines of every movement the control releases: approach + junction + exit lane
// `id` is also the stream id (see StreamSystem), so the world control and the
// simulation's queue/reward numbers are looked up by the same key.
export const DEFAULT_PLACEMENT = { size: 46, gap: 4, roadsideMargin: 4 };
const TURN_RANK = { left: 0, right: 1, straight: 2, uturn: 3 }; // stack order, nearest the stop line first
const COMPASS = ["Eastbound", "Southbound", "Westbound", "Northbound"]; // screen space: +y is south

export function headingName(angle) {
  return COMPASS[((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4];
}

export function computeSignalControls(level, compiled = compileLevel(level), options = {}) {
  const { size, gap, roadsideMargin } = { ...DEFAULT_PLACEMENT, ...options };
  const roads = new Map((level.roads ?? []).map((r) => [r.id, r]));
  const groups = new Map(level.signalGroups.map((g) => [g.id, g]));
  const p = { x: 0, y: 0, angle: 0 };

  // (lane, group) pairs in level order
  const pairs = new Map();
  for (const c of compiled.connectors.values()) {
    const key = `${c.signalGroup}@${c.from}`;
    let pair = pairs.get(key);
    if (!pair) pairs.set(key, (pair = { groupId: c.signalGroup, laneId: c.from, junctionId: c.junction, turns: [], connectors: [] }));
    if (!pair.turns.includes(c.turn)) pair.turns.push(c.turn);
    pair.connectors.push(c);
  }

  // Arms: approach lanes ending at the same stop line with the same heading
  const arms = new Map();
  for (const pair of pairs.values()) {
    const lane = compiled.lanes.get(pair.laneId);
    pointAt(lane.path, lane.stopLineS, p);
    const along = Math.round(p.x * Math.cos(p.angle) + p.y * Math.sin(p.angle));
    const key = `${pair.junctionId}|${Math.round(p.angle * 100)}|${along}`;
    if (!arms.has(key)) arms.set(key, []);
    arms.get(key).push(pair);
  }

  const out = [];
  for (const members of arms.values()) {
    const info = members.map((pair) => {
      const lane = compiled.lanes.get(pair.laneId);
      pointAt(lane.path, lane.stopLineS, p);
      const rx = -Math.sin(p.angle);
      const ry = Math.cos(p.angle);
      return { pair, lane, x: p.x, y: p.y, angle: p.angle, rx, ry, lateral: p.x * rx + p.y * ry };
    });
    const outer = info.reduce((best, i) => (i.lateral > best.lateral ? i : best)); // outermost lane: the roadside is on the driver's right
    const rank = (i) => Math.min(...i.pair.turns.map((t) => TURN_RANK[t] ?? 9));
    info.sort((a, b) => rank(a) - rank(b) || b.lateral - a.lateral || a.pair.groupId.localeCompare(b.pair.groupId));
    const road = roads.get(outer.lane.road);
    const roadHalf = (road?.width ?? 80) / 2;
    const roadLateral = road ? distanceToPolyline(road.points, outer.x, outer.y) : roadHalf - 10;
    const outerToEdge = Math.max(0, roadHalf - roadLateral);
    // Rows: turn controls first (nearest the stop line), straight below. Within the turn row, left
    // sits inboard of right. The roadside is on the driver's right, so "outward" grows to the right.
    const isTurn = (i) => rank(i) < TURN_RANK.straight;
    const turnRow = info.filter(isTurn).sort((a, b) => rank(a) - rank(b));
    const step = size + gap;
    const shift = new Map();
    info.forEach((i) => {
      const k = turnRow.indexOf(i);
      shift.set(i, k >= 0 ? k * step : turnRow.length > 1 ? ((turnRow.length - 1) * step) / 2 : 0);
    });
    info.forEach((i) => {
      const outward = outerToEdge + (outer.lateral - i.lateral) + roadsideMargin + size / 2 + shift.get(i);
      const back = size / 2 + (isTurn(i) || !turnRow.length ? 0 : step); // upstream of the stop line
      const hx = Math.cos(i.angle);
      const hy = Math.sin(i.angle);
      out.push({
        id: `${i.pair.groupId}@${i.pair.laneId}`,
        groupId: i.pair.groupId,
        laneId: i.pair.laneId,
        junctionId: i.pair.junctionId,
        label: groups.get(i.pair.groupId)?.label ?? i.pair.groupId,
        direction: headingName(i.angle),
        approach: i.lane.points,
        routes: i.pair.connectors.map((c) => joinPoints(i.lane.points, c.points, compiled.lanes.get(c.to).points)),
        x: i.x - hx * back + i.rx * outward,
        y: i.y - hy * back + i.ry * outward,
        heading: i.angle,
        turns: i.pair.turns,
      });
    });
  }
  return out;
}

function joinPoints(...parts) {
  const out = [];
  for (const part of parts) for (const pt of part) if (!out.length || out[out.length - 1][0] !== pt[0] || out[out.length - 1][1] !== pt[1]) out.push(pt);
  return out;
}

function distanceToPolyline(points, x, y) {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}
