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
    this.status = "running"; // running | gridlock | complete
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
    this.scoring = data.scoring; // { perVehicle }: base points per exit, before the multiplier
    this.economy = data.economy; // { cashPerVehicle, startCash }: base cash per exit, before the multiplier
    this.multiplier = data.multiplier; // { min, max, calm, jam, riseSeconds, fallSeconds }: congestion -> multiplier
    this.pressure = data.pressure; // { riskBands }: how full a stream's holding space must be for each risk band
    this.interventions = data.interventions; // { tow: { cost, costStep, cooldown, delay } }
    this.diversions = data.diversions ?? { slots: 0, cooldown: 0 }; // { slots, cooldown }: movements the player can close at once
    this.goal = data.goal ?? null; // { surviveSeconds }: reaching it completes the level
    this.scheduledObstacles = data.scheduledObstacles ?? []; // level events, not yet fired
  }
}
