import { compileLevel } from "../level/compileLevel.js";
import { pointAt } from "../util/geometry.js";

// Where each world-space signal control sits. Derived from the level topology
// (no ECS, no Phaser): one control per (signal group, approach lane) pair,
// placed beside that lane's stop line on the roadside, so the control belongs
// to the light and the movement it governs. Controls on the same approach arm
// are stacked back along the lane.
//
// Returns [{ id, groupId, laneId, junctionId, label, x, y, heading, turns }]
//   heading  direction of travel on the approach lane (radians)
//   turns    movement types this group makes from that lane ("straight", "right"...)
export const DEFAULT_PLACEMENT = { size: 26, gap: 4, roadsideMargin: 6 };

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
    if (!pair) pairs.set(key, (pair = { groupId: c.signalGroup, laneId: c.from, junctionId: c.junction, turns: [] }));
    if (!pair.turns.includes(c.turn)) pair.turns.push(c.turn);
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
    // Outermost lane first: the roadside is on the driver's right
    const info = members.map((pair) => {
      const lane = compiled.lanes.get(pair.laneId);
      pointAt(lane.path, lane.stopLineS, p);
      const rx = -Math.sin(p.angle);
      const ry = Math.cos(p.angle);
      return { pair, lane, x: p.x, y: p.y, angle: p.angle, rx, ry, lateral: p.x * rx + p.y * ry };
    });
    info.sort((a, b) => b.lateral - a.lateral || a.pair.groupId.localeCompare(b.pair.groupId));
    const outer = info[0];
    const road = roads.get(outer.lane.road);
    const roadHalf = (road?.width ?? 80) / 2;
    const roadLateral = road ? distanceToPolyline(road.points, outer.x, outer.y) : roadHalf - 10;
    const outerToEdge = Math.max(0, roadHalf - roadLateral);
    info.forEach((i, k) => {
      const outward = outerToEdge + (outer.lateral - i.lateral) + roadsideMargin + size / 2;
      const back = size / 2 + k * (size + gap); // upstream of the stop line
      const hx = Math.cos(i.angle);
      const hy = Math.sin(i.angle);
      out.push({
        id: `${i.pair.groupId}@${i.pair.laneId}`,
        groupId: i.pair.groupId,
        laneId: i.pair.laneId,
        junctionId: i.pair.junctionId,
        label: groups.get(i.pair.groupId)?.label ?? i.pair.groupId,
        x: i.x - hx * back + i.rx * outward,
        y: i.y - hy * back + i.ry * outward,
        heading: i.angle,
        turns: i.pair.turns,
      });
    });
  }
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
