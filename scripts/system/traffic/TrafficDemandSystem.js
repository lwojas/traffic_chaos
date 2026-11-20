import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";
import { nextRandom } from "../../traffic/util/rng.js";
import { demandAt } from "../../traffic/util/demand.js";

// Step 1: demand. Each input gate follows its demand curve and turns it into
// arrivals (an inhomogeneous Poisson process driven by the gate's own seeded
// stream). Arrivals join the gate's finite queue; if it is full they overflow.
// Nothing here touches the road network.
export class TrafficDemandSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["InputGateComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    for (const e of this.entities) {
      const g = e.getComponent("InputGateComponent");
      g.nextArrivalAt = this.interval(g);
    }
  }

  interval(gate) {
    return -Math.log(1 - nextRandom(gate.rng)); // Exp(1) in demand-integral units
  }

  update(dt) {
    const sim = this.sim;
    for (let i = 0; i < this.entities.length; i++) {
      const g = this.entities[i].getComponent("InputGateComponent");
      g.rate = demandAt(sim.demandCurves[g.curveId], sim.time) * g.scale * sim.demandScale;
      g.demandIntegral += g.rate * dt;
      while (g.demandIntegral >= g.nextArrivalAt) {
        g.nextArrivalAt += this.interval(g);
        g.arrived++;
        const accepted = g.queue.length < g.queueCapacity;
        if (accepted) g.queue.push({ type: this.pickType(g), route: this.pickRoute(g), arrivedAt: sim.time });
        else g.overflow++;
        this.events.emit(TrafficEvents.DEMAND_ARRIVED, this.entities[i], accepted);
      }
    }
  }

  pickType(gate) {
    const mix = this.sim.vehicleMix;
    let total = 0;
    for (let i = 0; i < mix.length; i++) total += mix[i].weight;
    let r = nextRandom(gate.rng) * total;
    for (let i = 0; i < mix.length; i++) {
      r -= mix[i].weight;
      if (r < 0) return this.sim.vehicleTypes[mix[i].typeId];
    }
    return this.sim.vehicleTypes[mix[mix.length - 1].typeId];
  }

  pickRoute(gate) {
    let r = nextRandom(gate.rng) * gate.totalWeight;
    for (let i = 0; i < gate.routes.length; i++) {
      r -= gate.routes[i].weight;
      if (r < 0) return gate.routes[i].route;
    }
    return gate.routes[gate.routes.length - 1].route;
  }
}
