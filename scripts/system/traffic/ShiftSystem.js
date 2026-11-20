import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";

// Step 14: the other way a level ends. A level with `goal.surviveSeconds` is
// won by keeping the network alive that long (the shift ends); GridlockSystem
// runs first, so a collapse on the final tick still counts as a loss.
export class ShiftSystem extends System {
  constructor() {
    super();
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.entities = [];
  }

  update(dt) {
    const sim = this.sim;
    if (sim.status === "running" && sim.goal && sim.time + dt >= sim.goal.surviveSeconds) sim.status = "complete";
  }
}
