import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

// Step 11: outputs, and the one place anything is earned. A vehicle that reached the end of its
// route leaves the network and is paid:
//
//     points = scoring.perVehicle x multiplier        cash = economy.cashPerVehicle x multiplier
//
// at the multiplier it has right now. There is no other income. Each exit also counts as
// throughput at its gate. Gates with an outflow limit refill their tokens here.
export class OutputGateSystem extends System {
  constructor(vehicleSystem) {
    super();
    this.entities = this.entityManager.registerSystem(this, ["OutputGateComponent"]);
    this.vehicleSystem = vehicleSystem;
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.stats.cash = this.sim.economy.startCash ?? 0;
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
      const multiplier = this.stats.multiplier;
      const reward = { points: this.sim.scoring.perVehicle * multiplier, cash: this.sim.economy.cashPerVehicle * multiplier, multiplier };
      this.stats.score += reward.points;
      this.stats.cash += reward.cash;
      this.stats.earned += reward.cash;
      this.events.emit(TrafficEvents.VEHICLE_COMPLETED, v, gate.entity, reward);
      this.vehicleSystem.remove(v);
    }
    arrivals.length = 0;
  }
}
