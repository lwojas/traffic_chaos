import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { PrefabFactory } from "../../services/PrefabFactory.js";
import { trafficComponentDefaults } from "../../data/TrafficDefaults.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

const BLOCK_LENGTH = 6; // px: size of the virtual vehicle a closed lane end is represented by

// Step 8: obstacles. An obstacle is a temporary reduction in network capacity:
// a timer and a set of blocks, where each block is a stationary virtual vehicle
// on a lane or movement. Vehicles queue behind blocks exactly as they queue
// behind any stopped car, so congestion propagates by itself. This system
// activates new obstacles (incident-made or scheduled by the level), counts
// them down, and clears them, towing any vehicles the incident disabled.
export class ObstacleSystem extends System {
  constructor(vehicleSystem, resolve) {
    super();
    this.entities = this.entityManager.registerSystem(this, ["ObstacleComponent"]);
    this.vehicleSystem = vehicleSystem;
    this.resolve = resolve; // level id -> entity
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.factory = new PrefabFactory(this.entityManager, trafficComponentDefaults, null);
    this.expired = [];
  }

  update(dt) {
    this.fireScheduled();
    const expired = this.expired;
    expired.length = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const o = this.entities[i].getComponent("ObstacleComponent");
      if (!o.active) this.activate(this.entities[i], o);
      else o.remaining -= dt;
      if (o.remaining <= 0) expired.push(this.entities[i]);
    }
    for (let i = 0; i < expired.length; i++) this.clear(expired[i]);
  }

  fireScheduled() {
    const list = this.sim.scheduledObstacles;
    while (list.length > 0 && list[0].at <= this.sim.time) {
      const def = list.shift();
      const blocks = def.blockedLanes.map((id) => {
        const lane = this.resolve(id);
        const lc = lane.getComponent("LaneComponent");
        // Whole lane closed at its far end; a movement is closed at its start
        return { lane, rear: lc.kind === "connector" ? 0 : Math.max(0, lc.length - BLOCK_LENGTH) };
      });
      this.factory.createEntity({
        type: "obstacle",
        uniqueId: def.id,
        components: { ObstacleComponent: { levelId: def.id, kind: def.kind, duration: def.duration, blocks, createdAt: this.sim.time } },
      });
    }
  }

  activate(entity, o) {
    o.active = true;
    for (const b of o.blocks) b.lane.getComponent("LaneComponent").blockers.push({ rear: b.rear, obstacle: entity });
    this.events.emit(TrafficEvents.OBSTACLE_STARTED, entity);
  }

  clear(entity) {
    const o = entity.getComponent("ObstacleComponent");
    for (const b of o.blocks) {
      const lane = b.lane.getComponent("LaneComponent");
      lane.blockers = lane.blockers.filter((x) => x.obstacle !== entity);
    }
    for (const v of o.vehicles) this.vehicleSystem.remove(v);
    this.events.emit(TrafficEvents.OBSTACLE_CLEARED, entity);
    this.entityManager.beginBatch();
    this.entityManager.removeEntity(entity);
    this.entityManager.endBatch();
  }
}
