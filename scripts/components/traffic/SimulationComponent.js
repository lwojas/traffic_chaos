// Game/session state for the traffic simulation, held on a singleton entity.
export class SimulationComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.tickRate = data.tickRate;
    this.dt = 1 / data.tickRate;
    this.time = 0;
    this.tick = 0;
    this.paused = false;
    this.speed = 1;
    this.status = "running"; // running | gridlock
    this.gridlockGate = null; // input gate entity that tipped the level into gridlock
    this.gridlockTime = null;
    this.rng = { seed: data.seed >>> 0 };
    this.commands = []; // player/UI commands, applied at tick boundaries
    this.nextVehicleId = 0;
    this.nextObstacleId = 0;
    this.vehicleMix = data.vehicleMix; // [{ typeId, weight }]
    this.vehicleTypes = data.vehicleTypes;
    this.demandCurves = data.demandCurves; // { id: [{ time, rate }] }
    this.demandScale = data.demandScale ?? 1; // global multiplier (tests, difficulty)
    this.incidents = data.incidents; // { enabled, duration }
    this.gridlock = data.gridlock; // { fullSeconds }
    this.scoring = data.scoring; // { perVehicle, perIncident }
    this.scheduledObstacles = data.scheduledObstacles ?? []; // level events, not yet fired
  }
}
