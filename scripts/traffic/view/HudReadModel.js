import { pointAt } from "../util/geometry.js";

const _p = { x: 0, y: 0, angle: 0 };

import { riskBand } from "../util/pressureMath.js";

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
    // Streams are static topology too: where each one's stop line and queue tail are
    this.streams = session.streams.streams;
    // Obstacles come and go: the manager replaces `.entities`, so read it fresh
    this.obstacleSystem = {};
    this.obstacleSystem.entities = em.registerSystem(this.obstacleSystem, ["ObstacleComponent"]);
  }

  read() {
    const s = this.session;
    const st = s.stats;
    const sim = s.sim;
    const streams = this.readStreams();
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
      status: sim.status, // running | gridlock | complete
      paused: sim.paused,
      speed: sim.speed,
      time: st.time,
      goalSeconds: s.level.goal?.surviveSeconds ?? 0,
      score: st.score,
      throughput: st.completed,
      throughputPerMin: st.throughputPerMin,
      capacity: st.networkCapacity,
      gridlockRisk: st.peakQueueFill,
      gridlockProgress: st.gridlockProgress,
      gridlockSeconds: sim.gridlock.fullSeconds,
      incidentsActive: st.activeObstacles,
      incidentsTotal: st.incidents,
      cash: st.cash,
      earned: st.earned,
      streams,
      multiplier: this.readMultiplier(),
      congestion: this.readCongestion(streams),
      tow: s.interventions.describe("tow"),
      crew: s.interventions.describe("crew"),
      gates,
      incidents: this.readIncidents(),
      result: sim.status === "running" ? null : this.session.summary(),
      gridlock: sim.status === "gridlock" ? { time: sim.gridlockTime, gate: sim.gridlockGate.getComponent("InputGateComponent").label } : null,
    };
  }

  // The multiplier every exit is paid at, how much congestion is costing right now (`lost`), and the
  // highest it can currently climb to (`ceiling`, 0..1 along the same scale as `fill`).
  readMultiplier() {
    const st = this.session.stats;
    const cfg = this.session.sim.multiplier;
    return { value: st.multiplier, min: cfg.min, max: cfg.max, lost: Math.max(0, cfg.max - st.multiplier), fill: (st.multiplier - cfg.min) / (cfg.max - cfg.min), ceiling: (st.multiplierTarget - cfg.min) / (cfg.max - cfg.min) };
  }

  // The meter that drives the multiplier: the worst stream's pressure, the same number (and risk
  // band) its world control shows. `worst` is where that stream's queue is, to jump the camera to.
  readCongestion(streams) {
    const st = this.session.stats;
    const w = st.congestionStream && streams.find((s) => s.id === st.congestionStream);
    return {
      value: st.congestion,
      band: riskBand(st.congestion, this.session.sim.pressure.riskBands),
      worst: w ? { x: w.tx, y: w.ty } : null,
    };
  }

  // Per stream: where it is and how loaded. The minimap uses these for pressure markers.
  readStreams() {
    return this.streams.map((s) => {
      pointAt(s.lane.path, s.lane.stopLineS, _p);
      const x = _p.x;
      const y = _p.y;
      const slot = s.lane.length / s.capacity;
      pointAt(s.lane.path, Math.max(0, s.lane.stopLineS - s.queue * slot), _p);
      return { id: s.id, laneId: s.laneId, x, y, tx: _p.x, ty: _p.y, queue: s.queue, pressure: s.pressure, risk: s.risk, blocked: s.blocked };
    });
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
      const fixer = o.kind === "collision" ? "tow" : "crew"; // crashes need the tow truck, roadworks the road crew
      out.push({ id: o.levelId, kind: o.kind, x, y, remaining: Math.max(0, o.remaining), towed: o.towed, blocked: o.blocks.length, fix: fixer, fixRefusal: this.session.interventions.refusal(fixer, o.levelId) });
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
