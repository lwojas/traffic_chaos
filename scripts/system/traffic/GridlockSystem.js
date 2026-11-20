import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

// Step 12: failure. The level is lost when an input gate's queue has been full
// for `gridlock.fullSeconds` in a row: the network can no longer take the
// traffic that wants to enter it. A momentary peak that drains again is not
// gridlock. The failing gate is recorded so the player can see where it began.
export class GridlockSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["InputGateComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.events = ServiceLocator.resolve("game", "EventSystem");
  }

  update(dt) {
    const sim = this.sim;
    for (let i = 0; i < this.entities.length; i++) {
      const g = this.entities[i].getComponent("InputGateComponent");
      g.fullTime = g.queue.length >= g.queueCapacity ? g.fullTime + dt : 0;
      if (sim.status === "running" && g.fullTime >= sim.gridlock.fullSeconds) {
        sim.status = "gridlock";
        sim.gridlockGate = this.entities[i];
        sim.gridlockTime = sim.time + dt;
        this.events.emit(TrafficEvents.GRIDLOCK, this.entities[i]);
      }
    }
  }
}
