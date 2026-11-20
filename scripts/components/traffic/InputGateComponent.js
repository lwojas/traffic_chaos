// Where traffic enters the network. Demand accumulates in a finite queue that
// stands for vehicles waiting off the map; the VehicleSpawnSystem feeds it into
// the gate's lane as space allows. A queue that stays full is gridlock.
export class InputGateComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.laneIds = data.lanes; // lanes this gate feeds; each route enters on its own first lane
    this.label = data.label ?? data.levelId;
    this.queueCapacity = data.queueCapacity;
    this.curveId = data.demand.curve;
    this.scale = data.demand.scale ?? 1;
    this.routeEntries = data.routes; // [{ route: levelId, weight }]
    this.totalWeight = data.routes.reduce((a, r) => a + r.weight, 0);
    this.rng = { seed: data.seed >>> 0 }; // per-gate stream: adding a gate never shifts another's traffic
    this.lanes = []; // lane entities, resolved by the instantiator
    this.routes = []; // [{ route: entity, weight }]
    // Runtime state
    this.queue = []; // waiting [{ type, route, arrivedAt }]
    this.rate = 0; // current arrivals per second
    this.demandIntegral = 0; // integral of rate over time
    this.nextArrivalAt = 0; // threshold on demandIntegral for the next arrival (set by the demand system)
    this.arrived = 0;
    this.injected = 0;
    this.overflow = 0; // arrivals turned away because the queue was full
    this.fullTime = 0; // consecutive seconds the queue has been at capacity
  }
}
