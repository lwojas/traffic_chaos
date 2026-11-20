import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

// Step 10: outputs. Vehicles that reached the end of their route leave the
// network here, and each one counts as throughput at its gate. Gates with an
// outflow limit also refill their tokens here.
export class OutputGateSystem extends System {
  constructor(vehicleSystem) {
    super();
    this.entities = this.entityManager.registerSystem(this, ["OutputGateComponent"]);
    this.vehicleSystem = vehicleSystem;
    this.events = ServiceLocator.resolve("game", "EventSystem");
  }

  update(dt) {
    for (let i = 0; i < this.entities.length; i++) {
      const g = this.entities[i].getComponent("OutputGateComponent");
      if (g.outflowPerMinute > 0) g.tokens = Math.min(1, g.tokens + (g.outflowPerMinute / 60) * dt);
    }
    const arrivals = this.vehicleSystem.arrivals;
    for (let i = 0; i < arrivals.length; i++) {
      const v = arrivals[i];
      const gate = v.components.VehicleStateComponent.segment.components.LaneComponent.outputGate;
      gate.throughput++;
      this.events.emit(TrafficEvents.VEHICLE_COMPLETED, v, gate.entity);
      this.vehicleSystem.remove(v);
    }
    arrivals.length = 0;
  }
}
