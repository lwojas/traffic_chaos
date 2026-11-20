import { pointAt } from "../util/geometry.js";

const _p = { x: 0, y: 0, angle: 0 };

// What the player-facing HUD and minimap show, read straight from the
// simulation: the stats component for aggregates, ECS components for gates and
// incidents. Nothing here is calculated a second time; the few derived values
// (positions, fill fractions) are lookups, not game rules. The HUD never
// touches ECS entities itself, and nothing here writes to the world.
export class HudReadModel {
  constructor(session) {
    this.session = session;
    const em = session.entityManager;
    // Gates are static level entities: safe to cache
    this.gates = em.registerSystem({}, ["InputGateComponent"]).map((e) => {
      const g = e.getComponent("InputGateComponent");
      const lane = g.lanes[0].getComponent("LaneComponent");
      const pos = pointAt(lane.path, Math.min(40, lane.length), { x: 0, y: 0, angle: 0 });
      return { gate: g, x: pos.x, y: pos.y };
    });
    this.outputs = em.registerSystem({}, ["OutputGateComponent"]).map((e) => {
      const g = e.getComponent("OutputGateComponent");
      const lane = g.lane.getComponent("LaneComponent");
      const pos = pointAt(lane.path, Math.max(0, lane.length - 40), { x: 0, y: 0, angle: 0 });
      return { gate: g, x: pos.x, y: pos.y };
    });
    // Obstacles come and go: the manager replaces `.entities`, so read it fresh
    this.obstacleSystem = {};
    this.obstacleSystem.entities = em.registerSystem(this.obstacleSystem, ["ObstacleComponent"]);
  }

  read() {
    const s = this.session;
    const st = s.stats;
    const sim = s.sim;
    const gates = this.gates.map(({ gate: g, x, y }) => ({
      id: g.levelId,
      label: g.label,
      queued: g.queue.length,
      capacity: g.queueCapacity,
      fill: Math.min(1, g.queue.length / g.queueCapacity),
      full: g.queue.length >= g.queueCapacity,
      x,
      y,
    }));
    return {
      status: sim.status, // running | gridlock
      paused: sim.paused,
      speed: sim.speed,
      time: st.time,
      score: st.score,
      throughput: st.completed,
      throughputPerMin: st.throughputPerMin,
      capacity: st.networkCapacity,
      gridlockRisk: st.peakQueueFill,
      gridlockProgress: st.gridlockProgress,
      gridlockSeconds: sim.gridlock.fullSeconds,
      incidentsActive: st.activeObstacles,
      incidentsTotal: st.incidents,
      gates,
      incidents: this.readIncidents(),
      gridlock: sim.status === "gridlock" ? { time: sim.gridlockTime, gate: sim.gridlockGate.getComponent("InputGateComponent").label } : null,
    };
  }

  readIncidents() {
    const out = [];
    for (const e of this.obstacleSystem.entities) {
      const o = e.getComponent("ObstacleComponent");
      if (!o.active) continue;
      let x;
      let y;
      if (o.vehicles.length > 0) {
        const pos = o.vehicles[0].getComponent("Position");
        x = pos.x;
        y = pos.y;
      } else if (o.blocks.length > 0) {
        const b = o.blocks[0];
        pointAt(b.lane.getComponent("LaneComponent").path, b.rear, _p);
        x = _p.x;
        y = _p.y;
      } else continue;
      out.push({ id: o.levelId, kind: o.kind, x, y, remaining: Math.max(0, o.remaining) });
    }
    return out;
  }

  inputGatePoints() {
    return this.gates.map(({ gate, x, y }) => ({ id: gate.levelId, x, y }));
  }

  outputGatePoints() {
    return this.outputs.map(({ gate, x, y }) => ({ id: gate.levelId, x, y }));
  }
}
