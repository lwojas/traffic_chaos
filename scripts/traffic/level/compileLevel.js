import { buildPath, connectorPoints, endDirection, startDirection, proximityInterval } from "../util/geometry.js";

const DEFAULTS = { laneSpeed: 120, connectorSpeed: 70, decisionDistance: 150, conflictDistance: 15 };

// Turns validated level JSON into derived runtime data: lane/connector geometry
// and the junction conflict zones. Deterministic and independent of Phaser/ECS,
// so an editor can call it to preview a level.
//
// Conflicts are never authored by hand. Two movements from different approach
// lanes conflict wherever their paths come within `conflictDistance` of each
// other (a crossing) or where they feed the same exit lane (a merge); each such
// contact becomes a ConflictZone with an interval of path distance per movement.
export function compileLevel(level) {
  const lanes = new Map();
  for (const l of level.lanes) {
    const path = buildPath(l.points);
    lanes.set(l.id, {
      levelId: l.id,
      kind: l.kind ?? "approach",
      index: l.index ?? 0,
      points: l.points,
      path,
      length: path.length,
      speedLimit: l.speedLimit ?? DEFAULTS.laneSpeed,
      stopLineS: path.length - (l.stopLineOffset ?? 0),
      decisionDistance: l.decisionDistance ?? DEFAULTS.decisionDistance,
      junction: l.junction ?? null,
      road: l.road ?? null,
    });
  }

  const connectors = new Map();
  const zones = [];
  for (const j of level.junctions) {
    const own = [];
    for (const m of j.movements) {
      const from = lanes.get(m.from);
      const to = lanes.get(m.to);
      const points =
        m.path ?? connectorPoints(from.points[from.points.length - 1], endDirection(from.points), to.points[0], startDirection(to.points));
      const path = buildPath(points);
      const c = {
        levelId: m.id,
        kind: "connector",
        junction: j.id,
        from: m.from,
        to: m.to,
        turn: m.turn ?? "straight",
        signalGroup: m.signalGroup,
        points,
        path,
        length: path.length,
        speedLimit: m.speedLimit ?? (m.turn === "straight" ? DEFAULTS.laneSpeed : DEFAULTS.connectorSpeed),
        stopLineS: path.length,
        decisionDistance: 0,
        index: from.index,
      };
      connectors.set(m.id, c);
      own.push(c);
    }

    const distance = j.conflictDistance ?? DEFAULTS.conflictDistance;
    for (let i = 0; i < own.length; i++) {
      for (let k = i + 1; k < own.length; k++) {
        const a = own[i];
        const b = own[k];
        if (a.from === b.from) continue; // same approach lane: queued in order, not a conflict
        const hit = proximityInterval(a.points, b.points, distance);
        if (!hit) continue;
        zones.push({
          id: `zone_${a.levelId}__${b.levelId}`,
          junction: j.id,
          kind: a.to === b.to ? "merge" : "cross",
          a: { movement: a.levelId, s0: hit.a[0], s1: hit.a[1] },
          b: { movement: b.levelId, s0: hit.b[0], s1: hit.b[1] },
          x: hit.x,
          y: hit.y,
        });
      }
    }
  }
  return { lanes, connectors, zones };
}

// Movement ids that conflict with `movementId`, read from compiled zones.
export function conflictsOf(zones, movementId) {
  const out = new Set();
  for (const z of zones) {
    if (z.a.movement === movementId) out.add(z.b.movement);
    else if (z.b.movement === movementId) out.add(z.a.movement);
  }
  return out;
}
