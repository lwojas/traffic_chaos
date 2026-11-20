import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { PrefabFactory } from "../../services/PrefabFactory.js";
import { trafficComponentDefaults } from "../../data/TrafficDefaults.js";
import { VehicleStates } from "../../components/traffic/VehicleStateComponent.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

const BODY_TRIM = 2; // px shaved off each end of a vehicle when testing zone occupancy

// Steps 6-7: conflicts and incidents. A conflict zone is where two movements'
// paths meet (compiled from level geometry). A vehicle occupies a zone side
// while its body overlaps that side's interval. If two active vehicles occupy
// the two sides of one zone at the same moment, that is an incident: both are
// disabled and an obstacle is created. No randomness: the same timing always
// gives the same outcome, and the debug view shows exactly which zone it was.
//
// Disabled vehicles never trigger further incidents (they are already an
// obstacle), and nothing here ever prevents a conflict from happening.
export class JunctionConflictSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["JunctionComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.factory = new PrefabFactory(this.entityManager, trafficComponentDefaults, null);
    this.found = []; // reused: incidents detected this tick
  }

  update() {
    const found = this.found;
    found.length = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const junction = this.entities[i];
      const zones = junction.components.JunctionComponent.zones;
      for (let k = 0; k < zones.length; k++) {
        const z = zones[k];
        z.occupied.a = this.occupant(z.a);
        z.occupied.b = this.occupant(z.b);
        const a = z.occupied.a;
        const b = z.occupied.b;
        if (a && b && !a.components.VehicleStateComponent.disabled && !b.components.VehicleStateComponent.disabled) {
          a.components.VehicleStateComponent.disabled = true; // claim now so later zones this tick skip them
          b.components.VehicleStateComponent.disabled = true;
          found.push({ junction, zone: z, a, b });
        }
      }
    }
    if (!this.sim.incidents.enabled) {
      for (const f of found) {
        f.a.components.VehicleStateComponent.disabled = false;
        f.b.components.VehicleStateComponent.disabled = false;
      }
      return;
    }
    for (let i = 0; i < found.length; i++) this.createIncident(found[i]);
  }

  // Vehicle (if any) whose body overlaps this zone side. Prefers an active
  // vehicle over a disabled one so wrecks never mask a live collision.
  occupant(side) {
    const list = side.lane.components.LaneComponent.vehicles;
    let hit = null;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!this.overlaps(v, side.s0, side.s1)) continue;
      if (!v.components.VehicleStateComponent.disabled) return v;
      hit = v;
    }
    return hit;
  }

  overlaps(vehicle, s0, s1) {
    const s = vehicle.components.VehicleStateComponent.s;
    const len = vehicle.components.VehicleComponent.length;
    return s - BODY_TRIM > s0 && s - len + BODY_TRIM < s1;
  }

  createIncident({ junction, zone, a, b }) {
    for (const v of [a, b]) {
      const vs = v.components.VehicleStateComponent;
      vs.state = VehicleStates.CRASHED;
      vs.speed = 0;
      vs.braking = false;
    }
    // What the wrecks block: their own movements, and every movement whose path
    // runs through a zone a wreck is sitting in.
    const blocks = new Map(); // lane entity -> rear position of the block
    const block = (lane, rear) => {
      rear = Math.max(0, rear);
      if (!blocks.has(lane) || rear < blocks.get(lane)) blocks.set(lane, rear);
    };
    for (const w of [a, b]) {
      const ws = w.components.VehicleStateComponent;
      block(ws.segment, ws.s - w.components.VehicleComponent.length);
      for (const z of junction.components.JunctionComponent.zones) {
        if (this.overlaps(w, z.a.s0, z.a.s1) && ws.segment === z.a.lane) block(z.b.lane, z.b.s0);
        if (this.overlaps(w, z.b.s0, z.b.s1) && ws.segment === z.b.lane) block(z.a.lane, z.a.s0);
      }
    }
    const sim = this.sim;
    const id = `obstacle_${sim.nextObstacleId++}`;
    const obstacle = this.factory.createEntity({
      type: "obstacle",
      uniqueId: id,
      components: {
        ObstacleComponent: {
          levelId: id,
          kind: "collision",
          duration: sim.incidents.duration,
          blocks: [...blocks].map(([lane, rear]) => ({ lane, rear })),
          vehicles: [a, b],
          zone: zone.id,
          createdAt: sim.time,
        },
      },
    });
    this.events.emit(TrafficEvents.INCIDENT, a, b, junction, obstacle, zone);
  }
}
