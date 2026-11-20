// A drivable path segment. Covers both lanes and in-junction connectors
// (kind: "approach" | "exit" | "connector"). Runtime occupancy lives here so
// vehicles can find their leader without any spatial query.
export class LaneComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.kind = data.kind;
    this.index = data.index ?? 0; // lane number within its approach (0 = straight, 1 = turn in the shipped level)
    this.path = data.path;
    this.points = data.points;
    this.length = data.length;
    this.speedLimit = data.speedLimit;
    this.stopLineS = data.stopLineS;
    this.decisionDistance = data.decisionDistance;
    // Connector only
    this.turn = data.turn ?? null;
    this.fromId = data.from ?? null;
    this.toId = data.to ?? null;
    // Resolved by the level instantiator (entity references)
    this.signalGroup = null; // connector: group that governs this movement
    this.junction = null;
    this.zones = []; // connector: [{ zone, side: "a" | "b" }]
    this.outputGate = null; // exit lane that ends at an output gate
    // Runtime state
    this.vehicles = []; // vehicle entities ordered front (index 0) to rear
    this.blockers = []; // active obstacle blocks: { rear, obstacle }
    this.queueLength = 0;
  }
}
