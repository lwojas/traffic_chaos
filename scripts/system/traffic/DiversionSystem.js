import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { RoadGraph, crossesClosure } from "../../traffic/util/routing.js";

const INCIDENT = "incident:";

// Diversion target for "sign traffic round this incident".
export const incidentTarget = (obstacleId) => `${INCIDENT}${obstacleId}`;

// Step 4b: diversions. The player closes part of the network and traffic is
// signed round it. A diversion target is either
//   - a stream id "groupId@laneId" (the same id as its world control): that
//     group's movements from that lane, or
//   - "incident:<obstacleId>": the movements that feed the road the incident
//     blocks (or the blocked movements themselves), as many of them as can be
//     closed without leaving an entry no way out (a crash in a junction box can
//     block several arms). It lifts itself, with no cooldown, when the incident
//     clears.
// Commands arrive on the simulation queue:
//   { type: "diversion.toggle", target }
// Toggling a placed diversion lifts it; toggling a stream that another diversion
// already closes lifts that one (holding any barrier reopens the road).
//
// This edits the network, not the drivers (rule 8). Vehicles do not look at
// queues or choose anything: when the set of closures changes, this system
// rewrites the not-yet-driven part of each affected vehicle's path to the
// shortest open way back onto its own route, or failing that to the nearest
// open exit (util/routing.js, by road length only). A detour can be jammed,
// longer, and full of new conflicts; that is the player's call.
//
// Vehicles that are already committed (in the movement, or too close to the
// stop line to stop comfortably) keep their movement and drive through, so a
// diversion never swerves a car into a different path at the last moment. A
// vehicle with no open way round from where it is also drives through.
//
// The player has `diversions.slots` diversions. Lifting one frees its slot after
// `diversions.cooldown` seconds. A closure that would leave some entry with no
// way to its exit is refused.
export class DiversionSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["VehicleComponent", "VehicleStateComponent"]);
    this.obstacles = {};
    this.obstacles.entities = this.entityManager.registerSystem(this.obstacles, ["ObstacleComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    const lanes = this.entityManager.registerSystem({}, ["LaneComponent"]);
    this.gates = this.entityManager.registerSystem({}, ["InputGateComponent"]).map((e) => e.components.InputGateComponent);
    this.graph = new RoadGraph(lanes);
    this.exits = lanes.filter((e) => e.components.LaneComponent.outputGate); // where a car can always be sent
    this.connectors = this.graph.nodes.filter((e) => e.components.LaneComponent.kind === "connector");
    this.targets = new Map(); // stream id -> connector entities
    for (const e of this.connectors) {
      const c = e.components.LaneComponent;
      const id = `${c.signalGroup.id}@${c.fromId}`;
      if (!this.targets.has(id)) this.targets.set(id, []);
      this.targets.get(id).push(e);
    }
    this.cfg = this.sim.diversions;
    this.slots = Array.from({ length: this.cfg.slots }, () => ({ target: null, connectors: [], obstacle: null, readyAt: 0 }));
    this.closed = new Set(); // closed connector entities
    this.used = 0; // diversions placed this run
    this.version = 0; // bumps whenever the closures change
    this.spawnPlans = new Map(); // route entity -> steps, for this version
    this.strands = new Map(); // target -> would closing it strand an entry? (this version)
    this.incidentPlans = new Map(); // incident target -> { all, open } connectors (this version)
  }

  placed(target) {
    return this.slots.find((s) => s.target === target) ?? null;
  }

  // Is every movement of this stream closed (by its own diversion or a wider one)?
  isClosed(streamId) {
    const list = this.targets.get(streamId);
    return !!list && this.closed.size > 0 && list.every((c) => this.closed.has(c));
  }

  // Is this incident's road diverted?
  isDiverted(obstacleId) {
    return !!this.placed(incidentTarget(obstacleId));
  }

  findObstacle(levelId) {
    return this.obstacles.entities.find((e) => e.id === levelId) ?? null;
  }

  // The connectors a target closes, or null for an unknown target.
  resolve(target) {
    if (!target?.startsWith(INCIDENT)) return this.targets.get(target) ?? null;
    return this.incidentPlan(target)?.open ?? null;
  }

  // An incident's blocked movements (`all`), and the ones a diversion closes
  // (`open`): added in order, skipping any that would leave an entry no way out.
  incidentPlan(target) {
    if (this.incidentPlans.has(target)) return this.incidentPlans.get(target);
    const entity = this.findObstacle(target.slice(INCIDENT.length));
    if (!entity) return null;
    const all = new Set();
    for (const b of entity.getComponent("ObstacleComponent").blocks) {
      const lane = b.lane.getComponent("LaneComponent");
      if (lane.kind === "connector") all.add(b.lane);
      else for (const c of this.connectors) if (c.components.LaneComponent.toId === b.lane.id) all.add(c);
    }
    const open = [];
    for (const c of all) if (!this.closed.has(c) && !this.strandsWith([...open, c])) open.push(c);
    const plan = { all: [...all], open };
    if (entity.getComponent("ObstacleComponent").active) this.incidentPlans.set(target, plan);
    return plan;
  }

  // Everything the UI needs: how many diversions exist, are placed, are ready.
  describe() {
    const t = this.sim.time;
    const inUse = this.slots.filter((s) => s.target).length;
    const free = this.slots.filter((s) => !s.target && s.readyAt <= t).length;
    const cooling = this.slots.filter((s) => !s.target && s.readyAt > t).map((s) => s.readyAt - t);
    return { slots: this.slots.length, inUse, free, nextReadyIn: free > 0 || cooling.length === 0 ? 0 : Math.min(...cooling), active: this.slots.filter((s) => s.target).map((s) => s.target), used: this.used };
  }

  // Why toggling this target would be refused right now, or null.
  refusal(target) {
    if (this.placed(target)) return null; // lifting is always allowed
    const incident = target?.startsWith(INCIDENT);
    const list = this.resolve(target);
    if (!list) return incident ? "no such incident" : "no such movement";
    if (!incident && this.isClosed(target)) return null; // reopens the diversion that closes it
    if (incident && !this.findObstacle(target.slice(INCIDENT.length)).getComponent("ObstacleComponent").active) return "incident not active yet";
    if (incident) {
      const plan = this.incidentPlan(target);
      if (plan.all.length === 0) return "no junction to divert at";
      if (plan.all.every((c) => this.closed.has(c))) return "already diverted";
      if (list.length === 0) return "no other way round";
    } else if (list.every((c) => this.closed.has(c))) return "already diverted";
    const d = this.describe();
    if (d.slots === 0) return "no diversions on this map";
    if (d.free === 0) return d.inUse === d.slots ? `all ${d.slots} diversions in use` : `diversion ready in ${Math.ceil(d.nextReadyIn)}s`;
    if (this.wouldStrand(target, list)) return "no other way round";
    return null;
  }

  wouldStrand(target, list) {
    if (!this.strands.has(target)) this.strands.set(target, this.strandsWith(list));
    return this.strands.get(target);
  }

  // Would closing these connectors (on top of the current closures) leave some entry route no way out?
  strandsWith(list) {
    const closed = new Set([...this.closed, ...list]);
    for (const g of this.gates) {
      for (const { route } of g.routes) {
        const steps = route.components.RouteComponent.steps;
        if (crossesClosure(steps, 0, closed) && !this.graph.plan(this.entries(g, steps), steps, closed, this.exits)) return true;
      }
    }
    return false;
  }

  // Where a gate can put a car of this route: its own first lane first, then the gate's other lanes.
  entries(gate, steps) {
    return [steps[0], ...gate.lanes.filter((l) => l !== steps[0])];
  }

  // The path a car leaving this gate on this route drives right now.
  stepsFor(route, gate) {
    const steps = route.components.RouteComponent.steps;
    if (this.closed.size === 0 || !crossesClosure(steps, 0, this.closed)) return steps;
    let plan = this.spawnPlans.get(route);
    if (!plan) {
      plan = this.graph.plan(this.entries(gate, steps), steps, this.closed, this.exits) ?? steps;
      this.spawnPlans.set(route, plan);
    }
    return plan;
  }

  // The detours new traffic takes because this stream is closed (for the presentation).
  detours(streamId) {
    const mine = new Set(this.targets.get(streamId) ?? []);
    const out = [];
    for (const g of this.gates) {
      for (const { route } of g.routes) {
        const steps = route.components.RouteComponent.steps;
        if (!crossesClosure(steps, 0, mine)) continue;
        const plan = this.stepsFor(route, g);
        if (plan !== steps && !out.includes(plan)) out.push(plan);
      }
    }
    return out;
  }

  lift(slot, readyAt) {
    slot.target = null;
    slot.connectors = [];
    slot.obstacle = null;
    slot.readyAt = readyAt;
  }

  update() {
    const t = this.sim.time;
    let changed = false;
    // An incident diversion comes down by itself once the incident has cleared
    for (const s of this.slots) {
      if (s.obstacle && !this.findObstacle(s.obstacle)) {
        this.lift(s, t);
        changed = true;
      }
    }
    const cmds = this.sim.commands;
    for (let i = 0; i < cmds.length; ) {
      if (!cmds[i].type.startsWith("diversion.")) {
        i++;
        continue;
      }
      const [cmd] = cmds.splice(i, 1);
      if (cmd.type !== "diversion.toggle" || this.refusal(cmd.target)) continue;
      const own = this.placed(cmd.target);
      if (own) this.lift(own, t + this.cfg.cooldown);
      else if (!cmd.target.startsWith(INCIDENT) && this.isClosed(cmd.target)) {
        const mine = this.targets.get(cmd.target);
        for (const s of this.slots) if (s.target && s.connectors.some((c) => mine.includes(c))) this.lift(s, t + this.cfg.cooldown);
      } else {
        const slot = this.slots.find((s) => !s.target && s.readyAt <= t);
        slot.target = cmd.target;
        slot.connectors = this.resolve(cmd.target);
        slot.obstacle = cmd.target.startsWith(INCIDENT) ? cmd.target.slice(INCIDENT.length) : null;
        this.used++;
      }
      changed = true;
    }
    if (!changed) return;
    this.closed = new Set(this.slots.flatMap((s) => s.connectors));
    this.version++;
    this.spawnPlans.clear();
    this.strands.clear();
    this.incidentPlans.clear();
    for (let i = 0; i < this.entities.length; i++) this.replan(this.entities[i]);
  }

  // Rewrites the uncommitted rest of one vehicle's path.
  replan(entity) {
    const vs = entity.components.VehicleStateComponent;
    if (vs.disabled || vs.arrived) return;
    const route = vs.route.components.RouteComponent.steps;
    const steps = vs.steps;
    const k = this.commitIndex(entity);
    if (k >= steps.length - 1) return;
    if (steps === route && !crossesClosure(steps, k + 1, this.closed)) return;
    const tail = this.graph.plan([steps[k]], route, this.closed, this.exits);
    if (!tail) return; // no way round from here: drives on through
    const next = steps.slice(0, k).concat(tail);
    vs.steps = next.length === route.length && next.every((s, i) => s === route[i]) ? route : next;
  }

  // Index of the first step this vehicle can still be sent another way from.
  // In a movement: committed to it and its exit lane. On a lane before a
  // movement: committed to that movement once it can no longer stop comfortably
  // before the line (the same test the stop-line decision uses).
  commitIndex(entity) {
    const vs = entity.components.VehicleStateComponent;
    const vc = entity.components.VehicleComponent;
    const i = vs.routeIndex;
    const seg = vs.steps[i].components.LaneComponent;
    if (seg.kind === "connector") return i + 1;
    const next = vs.steps[i + 1];
    if (next && next.components.LaneComponent.kind === "connector") {
      const dist = seg.stopLineS - vs.s;
      if ((vs.speed * vs.speed) / (2 * vc.decel) > dist - 0.5) return i + 2;
    }
    return i;
  }
}
