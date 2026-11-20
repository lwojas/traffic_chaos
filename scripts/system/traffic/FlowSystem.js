import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { LightState } from "../../components/traffic/SignalGroupComponent.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";
import { laneCapacity, burstMultiplier, riskBand, chainThreshold, RISK } from "../../traffic/util/flowMath.js";

const QUEUE_SPEED = 3; // px/s: slower than this counts as queued (same as TrafficStatsSystem)

// Step 11: Flow and cash. Turns "traffic held, then released" into money.
//
// A STREAM is one (signal group, approach lane) pair: the unit a world control
// belongs to. While its group is not green, the cars stopped at its line are a
// charge. When the group turns green those cars become a RELEASE. Money is paid
// per car, only when that car reaches an output gate, so the reward is traffic
// that actually moved through the network: a queue that crashes, blocks or
// gridlocks pays nothing for the cars it loses.
//
//   per-car cash = economy.perVehicle x burst(size / lane capacity) x chain
//   (cars that were never part of a held queue pay the plain perVehicle)
//
// The CHAIN multiplier steps through flow.steps. A clean release of a
// meaningful queue advances it; an incident, a poor release, a full input queue
// or letting it sit unused too long breaks or decays it.
//
// Streams, chain and releases are read by the HUD and world controls. This is
// the only system that writes cash earned from traffic.
export class FlowSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["SignalGroupComponent"]);
    this.laneHelper = {};
    this.lanes = this.entityManager.registerSystem(this.laneHelper, ["LaneComponent"]);
    this.gateHelper = {};
    this.gates = this.entityManager.registerSystem(this.gateHelper, ["InputGateComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.cfg = this.sim.flow;
    this.base = this.sim.economy.perVehicle;
    this.stats.cash = this.sim.economy.startCash ?? 0;

    this.chain = { index: 0, timer: 0 };
    this.releaseOf = new Map(); // vehicle entity -> its release
    this.active = []; // releases still resolving
    this.nextReleaseId = 0;
    this.gateWasFull = false;
    this.streams = this.buildStreams();

    this.events.on(TrafficEvents.VEHICLE_COMPLETED, (v) => this.onCompleted(v));
    this.events.on(TrafficEvents.INCIDENT, () => this.breakChain("incident", true));
    for (const name of [TrafficEvents.CASH_EARNED, TrafficEvents.FLOW_RELEASE, TrafficEvents.FLOW_BROKEN, TrafficEvents.TOW_CALLED]) this.events.on(name, () => {});
  }

  get multiplier() {
    return this.cfg.steps[this.chain.index];
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
          threshold: 0,
          wasGreen: groupEntity.components.SignalGroupComponent.state === LightState.GREEN,
          // Live values, refreshed every tick
          queue: 0,
          queueVehicles: [],
          pressure: 0,
          risk: RISK.SAFE,
          burst: 1,
          multiplier: 1, // payout multiplier a release would earn right now
          potential: 0, // cash a clean release would pay right now
          blocked: false,
          releasing: false,
          release: null,
        };
        s.threshold = chainThreshold(s.capacity, this.cfg);
        streams.set(key, s);
      }
      s.connectors.push(c);
    }
    return [...streams.values()];
  }

  update(dt) {
    const cfg = this.cfg;
    for (const s of this.streams) {
      const green = s.group.state === LightState.GREEN;
      // The queue was measured last tick, before the light changed: that is the charge being released
      if (green && !s.wasGreen && s.queueVehicles.length >= cfg.minQueue) this.startRelease(s);
      s.wasGreen = green;
      this.measure(s);
    }
    this.resolveReleases(dt);
    this.updateChain(dt);
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
    s.burst = burstMultiplier(s.queue, s.capacity, this.cfg);
    s.multiplier = s.queue >= this.cfg.minQueue ? s.burst * this.multiplier : 1;
    s.potential = s.blocked ? 0 : Math.round(s.queue * this.base * s.multiplier);
    s.releasing = !!s.release;
  }

  startRelease(s) {
    const vehicles = s.queueVehicles.slice();
    const r = {
      id: this.nextReleaseId++,
      stream: s,
      size: vehicles.length,
      pending: new Set(vehicles),
      cleared: 0,
      lost: 0,
      paid: 0,
      multiplier: burstMultiplier(vehicles.length, s.capacity, this.cfg) * this.multiplier,
      startedAt: this.sim.time,
      meaningful: vehicles.length >= s.threshold,
    };
    for (const v of vehicles) this.releaseOf.set(v, r);
    s.release = r;
    this.active.push(r);
    this.stats.releases++;
    if (r.size > this.stats.biggestRelease) this.stats.biggestRelease = r.size;
  }

  onCompleted(vehicle) {
    const r = this.releaseOf.get(vehicle);
    const amount = Math.round(this.base * (r ? r.multiplier : 1));
    this.stats.cash += amount;
    this.stats.earned += amount;
    if (r) {
      this.releaseOf.delete(vehicle);
      r.pending.delete(vehicle);
      r.cleared++;
      r.paid += amount;
    }
    this.events.emit(TrafficEvents.CASH_EARNED, vehicle, amount, r);
  }

  resolveReleases(dt) {
    const now = this.sim.time;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const r = this.active[i];
      for (const v of r.pending) {
        if (v.components.VehicleStateComponent.disabled) {
          r.pending.delete(v);
          this.releaseOf.delete(v);
          r.lost++;
        }
      }
      const timedOut = now - r.startedAt > this.cfg.releaseTimeout;
      if (r.pending.size > 0 && !timedOut) continue;
      for (const v of r.pending) this.releaseOf.delete(v);
      r.lost += r.pending.size;
      r.pending.clear();
      this.active.splice(i, 1);
      if (r.stream.release === r) r.stream.release = null;
      this.finishRelease(r);
    }
  }

  finishRelease(r) {
    const clean = r.lost === 0 && r.cleared / r.size >= this.cfg.cleanRatio;
    if (clean && r.meaningful) {
      this.chain.index = Math.min(this.cfg.steps.length - 1, this.chain.index + 1);
      this.chain.timer = this.cfg.chainSeconds;
      this.stats.cleanReleases++;
      this.stats.peakFlow = Math.max(this.stats.peakFlow, this.multiplier);
    } else if (!clean) {
      this.breakChain("poor-release", false);
    }
    this.stats.flowMultiplier = this.multiplier;
    this.events.emit(TrafficEvents.FLOW_RELEASE, r.stream, r, clean);
  }

  // A full break resets the chain; a soft one drops it a step.
  breakChain(reason, full) {
    const before = this.chain.index;
    this.chain.index = full ? 0 : Math.max(0, before - 1);
    this.chain.timer = this.cfg.chainSeconds;
    this.stats.flowMultiplier = this.multiplier;
    if (this.chain.index !== before) this.events.emit(TrafficEvents.FLOW_BROKEN, reason);
  }

  updateChain(dt) {
    const chain = this.chain;
    if (chain.index > 0) {
      chain.timer -= dt;
      if (chain.timer <= 0) this.breakChain("timeout", false);
    }
    // An input queue at capacity is the network failing: that breaks the chain (once per episode)
    const full = this.gates.some((g) => g.components.InputGateComponent.queue.length >= g.components.InputGateComponent.queueCapacity);
    if (full && !this.gateWasFull) this.breakChain("gridlock", true);
    this.gateWasFull = full;
    this.stats.flowMultiplier = this.multiplier;
  }

  // Seconds until the chain drops a step (0 when there is no chain)
  get chainTimeLeft() {
    return this.chain.index > 0 ? Math.max(0, this.chain.timer) : 0;
  }
}
