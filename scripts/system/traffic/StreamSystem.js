import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { laneCapacity, riskBand, RISK } from "../../traffic/util/pressureMath.js";
import { releaseGain } from "../../traffic/util/satisfactionMath.js";

const QUEUE_SPEED = 3; // px/s: slower than this counts as queued (same as TrafficStatsSystem)

// Step 10: streams. A STREAM is one (signal group, approach lane) pair: the unit a
// world control belongs to. Each tick this measures how many cars are stopped for
// it, how full its holding space is (pressure / risk band), whether an incident
// blocks it, and what releasing it is worth in Satisfaction right now.
//
// Streams only MEASURE. They pay nothing and decide nothing: Satisfaction and
// income are separate systems, so there is one answer to "why am I earning more?".
// Read by the HUD, the minimap, world controls and the playtest bots.
export class StreamSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["SignalGroupComponent"]);
    this.laneHelper = {};
    this.lanes = this.entityManager.registerSystem(this.laneHelper, ["LaneComponent"]);
    this.gateHelper = {};
    this.gates = this.entityManager.registerSystem(this.gateHelper, ["InputGateComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.cfg = this.sim.pressure;
    this.streams = this.buildStreams();
  }

  // Static topology: one stream per (group, approach lane), found from the connectors.
  buildStreams() {
    const streams = new Map();
    for (const e of this.lanes) {
      const c = e.components.LaneComponent;
      if (c.kind !== "connector") continue;
      const groupEntity = c.signalGroup;
      const approach = this.lanes.find((l) => l.id === c.fromId);
      const key = `${groupEntity.id}@${c.fromId}`;
      let s = streams.get(key);
      if (!s) {
        const lane = approach.components.LaneComponent;
        const gate = this.gates.map((g) => g.components.InputGateComponent).find((g) => g.lanes.includes(approach)) ?? null;
        const share = gate ? gate.lanes.length : 1;
        s = {
          id: key,
          groupId: groupEntity.id,
          laneId: c.fromId,
          group: groupEntity.components.SignalGroupComponent,
          groupEntity,
          laneEntity: approach,
          lane,
          connectors: [],
          capacity: laneCapacity(lane.stopLineS, this.sim.vehicleMix, this.sim.vehicleTypes),
          gate,
          gateShare: share,
          // Live values, refreshed every tick
          queue: 0,
          queueVehicles: [],
          pressure: 0,
          risk: RISK.SAFE,
          waitAvg: 0, // seconds the stopped cars have been held, on average
          waitMax: 0,
          gain: 0, // share of the Satisfaction meter releasing this queue would earn right now
          blocked: false,
        };
        streams.set(key, s);
      }
      s.connectors.push(c);
    }
    return [...streams.values()];
  }

  update() {
    for (const s of this.streams) this.measure(s);
  }

  measure(s) {
    const list = s.lane.vehicles;
    const q = s.queueVehicles;
    q.length = 0;
    for (let k = 0; k < list.length; k++) {
      const vs = list[k].components.VehicleStateComponent;
      if (vs.speed >= QUEUE_SPEED) break;
      const next = vs.route.components.RouteComponent.steps[vs.routeIndex + 1];
      if (next && next.components.LaneComponent.signalGroup === s.groupEntity) q.push(list[k]);
    }
    s.queue = q.length;
    const gateQueue = s.gate ? s.gate.queue.length / s.gateShare : 0;
    const gateCap = s.gate ? s.gate.queueCapacity / s.gateShare : 0;
    s.pressure = (s.queue + gateQueue) / (s.capacity + gateCap);
    s.blocked = s.lane.blockers.length > 0 || s.connectors.some((c) => c.blockers.length > 0);
    s.risk = Math.max(riskBand(s.pressure, this.cfg.riskBands), s.blocked ? RISK.DANGER : RISK.SAFE);
    let wait = 0;
    let max = 0;
    let gain = 0;
    for (let k = 0; k < q.length; k++) {
      const w = q[k].components.VehicleStateComponent.spell;
      wait += w;
      if (w > max) max = w;
      gain += releaseGain(w, this.sim.satisfaction);
    }
    s.waitAvg = q.length > 0 ? wait / q.length : 0;
    s.waitMax = max;
    s.gain = s.blocked ? 0 : gain;
  }
}
