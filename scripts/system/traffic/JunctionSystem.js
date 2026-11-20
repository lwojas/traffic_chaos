import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

const BLOCKED_AFTER = 2; // seconds a vehicle sits still inside the box

// Tracks junction occupancy and detects a blocked box, as system state rather
// than anything inferred from sprites.
export class JunctionSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["JunctionComponent"]);
    this.events = ServiceLocator.resolve("game", "EventSystem");
  }

  update(dt) {
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      const j = entity.components.JunctionComponent;
      let occupants = 0;
      let stuck = false;
      for (let k = 0; k < j.connectors.length; k++) {
        const list = j.connectors[k].components.LaneComponent.vehicles;
        occupants += list.length;
        for (let n = 0; n < list.length; n++) {
          if (list[n].components.VehicleStateComponent.stillTime > BLOCKED_AFTER) stuck = true;
        }
      }
      j.occupants = occupants;
      if (occupants > 0) j.usedTime += dt;
      if (stuck) {
        j.blockedTime += dt;
        if (!j.blocked) {
          j.blockedEvents++;
          this.events.emit(TrafficEvents.JUNCTION_BLOCKED, entity);
        }
      }
      j.blocked = stuck;
    }
  }
}
