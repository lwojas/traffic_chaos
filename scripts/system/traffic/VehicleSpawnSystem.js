import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { PrefabFactory } from "../../services/PrefabFactory.js";
import { trafficComponentDefaults } from "../../data/TrafficDefaults.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";
import { pointAt } from "../../traffic/util/geometry.js";

const _p = { x: 0, y: 0, angle: 0 };

// Step 2: injection. The head of each input queue enters the network when the
// start of the gate's lane has room. This is the only way traffic enters, so a
// congested lane backs up into the queue, and a full queue is the failure signal.
export class VehicleSpawnSystem extends System {
  constructor(diversions = null) {
    super();
    this.diversions = diversions; // the path a car drives depends on the diversions in place when it enters
    this.entities = this.entityManager.registerSystem(this, ["InputGateComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.factory = new PrefabFactory(this.entityManager, trafficComponentDefaults, null);
  }

  update() {
    for (let i = 0; i < this.entities.length; i++) {
      const gate = this.entities[i].getComponent("InputGateComponent");
      if (gate.queue.length === 0) continue;
      const head = gate.queue[0];
      const steps = this.diversions ? this.diversions.stepsFor(head.route, gate) : head.route.components.RouteComponent.steps;
      const lane = steps[0]; // the queue is FIFO: a blocked head holds up the rest
      if (this.entranceClear(lane.components.LaneComponent, head.type)) this.inject(gate, lane, { ...gate.queue.shift(), steps });
    }
  }

  entranceClear(lane, type) {
    for (let i = 0; i < lane.blockers.length; i++) if (lane.blockers[i].rear < type.length + 4) return false;
    const list = lane.vehicles;
    if (list.length === 0) return true;
    const rear = list[list.length - 1];
    const rs = rear.components.VehicleStateComponent;
    const rc = rear.components.VehicleComponent;
    return rs.s - rc.length >= type.length + rc.minGap + 4;
  }

  inject(gate, laneEntity, { type, route, steps }) {
    const sim = this.sim;
    const lane = laneEntity.getComponent("LaneComponent");
    const list = lane.vehicles;
    let speed = Math.min(type.maxSpeed * 0.8, lane.speedLimit);
    if (list.length > 0) speed = Math.min(speed, list[list.length - 1].components.VehicleStateComponent.speed);
    pointAt(lane.path, type.length / 2, _p);
    const em = this.entityManager;
    em.beginBatch();
    const entity = this.factory.createEntity({
      type: "vehicle",
      uniqueId: `vehicle_${sim.nextVehicleId++}`,
      components: {
        Position: { x: _p.x, y: _p.y },
        VehicleComponent: type,
        VehicleStateComponent: { route, steps, segment: laneEntity, s: type.length, speed, spawnTime: sim.time },
      },
    });
    em.endBatch();
    list.push(entity);
    gate.injected++;
    this.events.emit(TrafficEvents.VEHICLE_SPAWNED, entity);
  }
}
