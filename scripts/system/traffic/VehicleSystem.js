import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { LightState } from "../../components/traffic/SignalGroupComponent.js";
import { VehicleStates } from "../../components/traffic/VehicleStateComponent.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";
import { pointAt } from "../../traffic/util/geometry.js";
import { safeSpeed, laneEntryRoom } from "../utils/trafficDynamics.js";

const STOPPED_SPEED = 0.5;
const LOOKAHEAD_SEGMENTS = 3;
const _p = { x: 0, y: 0, angle: 0 };

// Steps 4-5: approach and movement. Vehicles are simple agents. Each one:
//   - follows its route, accelerating toward the lane's speed limit
//   - keeps a safe gap to whatever is directly ahead on its own route
//     (a vehicle, or an obstacle block)
//   - brakes for a red/yellow stop line when it physically can
//   - will not drive into a movement that an obstacle has closed
//   - otherwise just goes. It does NOT check for conflicting traffic, reserve
//     the junction, or give way. Crossing traffic is the player's problem, and
//     the JunctionConflictSystem decides what happens when paths meet.
// Vehicles are found through lane occupancy lists, so the per-vehicle cost is
// constant: no spatial queries, no allocation in the loop.
export class VehicleSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["VehicleComponent", "VehicleStateComponent", "Position"]);
    this.laneHelper = {};
    this.laneEntities = this.entityManager.registerSystem(this.laneHelper, ["LaneComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.moves = []; // reused: vehicles crossing a segment end this tick
    this.arrivals = []; // vehicles that finished their route this tick; the OutputGateSystem removes them
    this.leaderGap = Infinity;
    this.leaderSpeed = 0;
  }

  update(dt) {
    const lanes = this.laneEntities;
    this.moves.length = 0;
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i].components.LaneComponent;
      const list = lane.vehicles;
      for (let k = 0; k < list.length; k++) this.step(list[k], k, lane, dt);
    }
    // Segment changes are applied after the sweep so no vehicle updates twice
    for (let i = 0; i < this.moves.length; i++) this.advanceSegment(this.moves[i]);
  }

  step(entity, index, lane, dt) {
    const vc = entity.components.VehicleComponent;
    const vs = entity.components.VehicleStateComponent;
    if (vs.disabled) {
      // Part of an incident: stays put until its obstacle clears
      vs.speed = 0;
      vs.braking = false;
      vs.stillTime += dt;
      return;
    }
    const steps = vs.steps;
    const next = steps[vs.routeIndex + 1];
    const nextLane = next ? next.components.LaneComponent : null;
    const v = vs.speed;
    const decel = vc.decel;
    const tau = vc.reactionTime;
    const distEnd = lane.length - vs.s;

    let target = Math.min(vc.maxSpeed, lane.speedLimit);

    this.findLeader(lane, index, vs, steps);
    if (this.leaderGap !== Infinity) {
      target = Math.min(target, safeSpeed(this.leaderGap - vc.minGap, this.leaderSpeed, v, decel, tau));
    }
    if (nextLane && nextLane.speedLimit < target) {
      target = Math.min(target, Math.sqrt(nextLane.speedLimit * nextLane.speedLimit + 2 * decel * Math.max(0, distEnd)));
    }
    const gate = lane.outputGate;
    const gateClosed = gate && gate.outflowPerMinute > 0 && gate.tokens < 1;
    if (gateClosed) target = Math.min(target, safeSpeed(distEnd - 1, 0, v, decel, tau));

    let stop = false;
    let inZone = false;
    if (nextLane && nextLane.kind === "connector") {
      const dist = lane.stopLineS - vs.s;
      inZone = dist <= lane.decisionDistance;
      stop = this.mustStopAtLine(entity, vc, vs, nextLane, steps, dist, dt);
      if (stop) target = Math.min(target, safeSpeed(dist - 1, 0, v, decel, tau));
    }

    let nv = target > v ? Math.min(target, v + vc.accel * dt) : Math.max(target, v - vc.maxDecel * dt);
    if (nv < 0.05 && target < 0.05) nv = 0;
    vs.braking = (v - nv) / dt > 12;
    vs.speed = nv;
    let s = vs.s + nv * dt;

    // Hard limits: never overlap the leader in the same lane, never cross a stop
    // line the vehicle has decided to stop at, never pass a closed output gate.
    if (index > 0) {
      const l = lane.vehicles[index - 1];
      const limit = l.components.VehicleStateComponent.s - l.components.VehicleComponent.length - 0.5;
      if (s > limit) s = Math.max(vs.s, limit);
    }
    for (let i = 0; i < lane.blockers.length; i++) {
      const rear = lane.blockers[i].rear;
      if (rear >= vs.s && s > rear - 0.5) s = Math.max(vs.s, rear - 0.5);
    }
    if (stop && s > lane.stopLineS - 0.5) s = Math.max(vs.s, lane.stopLineS - 0.5);
    if (gateClosed && s > lane.length) s = lane.length;
    vs.s = s;

    if (nv < STOPPED_SPEED) {
      vs.stillTime += dt;
      if (lane.kind !== "connector") vs.waitTime += dt;
    } else vs.stillTime = 0;

    if (lane.kind === "connector") vs.state = VehicleStates.CROSSING_JUNCTION;
    else if (lane.kind === "exit") vs.state = VehicleStates.EXITING;
    else if (nv < STOPPED_SPEED) vs.state = VehicleStates.STOPPED;
    else if (vs.braking) vs.state = VehicleStates.SLOWING;
    else if (inZone) vs.state = VehicleStates.APPROACHING;
    else vs.state = VehicleStates.DRIVING;

    pointAt(lane.path, s - vc.length / 2, _p);
    const pos = entity.components.Position;
    pos.x = _p.x;
    pos.y = _p.y;
    vs.angle = _p.angle;

    if (s >= lane.length) this.moves.push(entity);
  }

  // Sets this.leaderGap / this.leaderSpeed: free distance to the nearest thing
  // ahead on this vehicle's own route (vehicle or obstacle block), looking into
  // following segments when this lane has none. Vehicles on other routes are
  // never considered: that is what makes conflicts possible.
  findLeader(lane, index, vs, steps) {
    let gap = Infinity;
    let speed = 0;
    if (index > 0) {
      const l = lane.vehicles[index - 1];
      const ls = l.components.VehicleStateComponent;
      gap = ls.s - l.components.VehicleComponent.length - vs.s;
      speed = ls.speed;
    }
    for (let i = 0; i < lane.blockers.length; i++) {
      const g = lane.blockers[i].rear - vs.s;
      if (g >= 0 && g < gap) {
        gap = g;
        speed = 0;
      }
    }
    if (gap !== Infinity) {
      this.leaderGap = gap;
      this.leaderSpeed = speed;
      return;
    }
    let dist = lane.length - vs.s;
    for (let i = vs.routeIndex + 1, hops = 0; i < steps.length && hops < LOOKAHEAD_SEGMENTS; i++, hops++) {
      const seg = steps[i].components.LaneComponent;
      if (seg.vehicles.length > 0) {
        const rear = seg.vehicles[seg.vehicles.length - 1];
        const rs = rear.components.VehicleStateComponent;
        gap = dist + rs.s - rear.components.VehicleComponent.length;
        speed = rs.speed;
      }
      for (let k = 0; k < seg.blockers.length; k++) {
        const g = dist + seg.blockers[k].rear;
        if (g < gap) {
          gap = g;
          speed = 0;
        }
      }
      if (gap !== Infinity) {
        this.leaderGap = gap;
        this.leaderSpeed = speed;
        return;
      }
      dist += seg.length;
    }
    this.leaderGap = Infinity;
    this.leaderSpeed = 0;
  }

  // Should this vehicle treat the stop line as an obstacle? Three reasons, all
  // local and readable: the movement is closed by an obstacle, the signal says
  // stop (and the vehicle can still stop), or the exit has no room (patience
  // decides how long the driver respects that last one).
  mustStopAtLine(entity, vc, vs, connector, steps, dist, dt) {
    if (connector.blockers.length > 0) {
      vs.blockedAtLine = 0;
      return true;
    }
    const v = vs.speed;
    const light = connector.signalGroup.components.SignalGroupComponent.state;
    const comfortStop = (v * v) / (2 * vc.decel) <= dist - 0.5;
    const hardStop = (v * v) / (2 * vc.maxDecel) <= dist - 0.5;
    if ((light === LightState.RED && hardStop) || (light === LightState.YELLOW && comfortStop)) {
      vs.blockedAtLine = 0;
      return true;
    }
    if (light !== LightState.GREEN) return false; // too late to stop: carries on through

    const exit = steps[vs.routeIndex + 2].components.LaneComponent;
    if (laneEntryRoom(exit) >= vc.length + vc.minGap) {
      vs.blockedAtLine = 0;
      return false;
    }
    if (vs.blockedAtLine === 0) this.events.emit(TrafficEvents.ENTRY_BLOCKED, entity, steps[vs.routeIndex + 1]);
    vs.blockedAtLine += dt;
    if (vs.blockedAtLine > vc.patience) return false; // pushes in and blocks the box
    return true;
  }

  advanceSegment(entity) {
    const vs = entity.components.VehicleStateComponent;
    const lane = vs.segment.components.LaneComponent;
    const steps = vs.steps;
    const list = lane.vehicles;
    const at = list.indexOf(entity);
    if (at >= 0) list.splice(at, 1);

    if (vs.routeIndex >= steps.length - 1) {
      const gate = lane.outputGate;
      if (gate && gate.outflowPerMinute > 0) gate.tokens = Math.max(0, gate.tokens - 1);
      vs.arrived = true;
      this.arrivals.push(entity);
      return;
    }
    const overflow = vs.s - lane.length;
    vs.routeIndex++;
    vs.segment = steps[vs.routeIndex];
    vs.s = overflow;
    vs.blockedAtLine = 0;
    const nextList = vs.segment.components.LaneComponent.vehicles;
    // Keep front-to-rear order: a merging vehicle may enter ahead of an earlier one
    nextList.push(entity);
    for (let i = nextList.length - 1; i > 0; i--) {
      const a = nextList[i].components.VehicleStateComponent;
      const b = nextList[i - 1].components.VehicleStateComponent;
      if (a.s <= b.s) break;
      const tmp = nextList[i];
      nextList[i] = nextList[i - 1];
      nextList[i - 1] = tmp;
    }
  }

  // Removes a vehicle from the world (arrived, or towed after an incident).
  remove(entity) {
    const lane = entity.components.VehicleStateComponent.segment.components.LaneComponent;
    const at = lane.vehicles.indexOf(entity);
    if (at >= 0) lane.vehicles.splice(at, 1);
    this.events.emit(TrafficEvents.VEHICLE_REMOVED, entity);
    this.entityManager.beginBatch();
    this.entityManager.removeEntity(entity);
    this.entityManager.endBatch();
  }
}
