import { ServiceLocator } from "../../services/ServiceLocator.js";
import { EventBus } from "../../services/EventBus.js";
import { EntityManager } from "../../services/EntityManager.js";
import { PrefabFactory } from "../../services/PrefabFactory.js";
import { trafficComponentDefaults } from "../../data/TrafficDefaults.js";
import { assertValidLevel } from "../level/validateLevel.js";
import { instantiateLevel } from "../level/instantiateLevel.js";
import { TrafficDemandSystem } from "../../system/traffic/TrafficDemandSystem.js";
import { VehicleSpawnSystem } from "../../system/traffic/VehicleSpawnSystem.js";
import { TrafficSignalSystem } from "../../system/traffic/TrafficSignalSystem.js";
import { VehicleSystem } from "../../system/traffic/VehicleSystem.js";
import { JunctionConflictSystem } from "../../system/traffic/JunctionConflictSystem.js";
import { ObstacleSystem } from "../../system/traffic/ObstacleSystem.js";
import { JunctionSystem } from "../../system/traffic/JunctionSystem.js";
import { OutputGateSystem } from "../../system/traffic/OutputGateSystem.js";
import { TrafficStatsSystem } from "../../system/traffic/TrafficStatsSystem.js";
import { GridlockSystem } from "../../system/traffic/GridlockSystem.js";
import { StreamSystem } from "../../system/traffic/StreamSystem.js";
import { MultiplierSystem } from "../../system/traffic/MultiplierSystem.js";
import { InterventionSystem } from "../../system/traffic/InterventionSystem.js";
import { ShiftSystem } from "../../system/traffic/ShiftSystem.js";
import { DiversionSystem, incidentTarget } from "../../system/traffic/DiversionSystem.js";

const MAX_STEPS_PER_FRAME = 8;

// Per-intervention merge: a level can retune `tow.cost` without restating the rest.
function mergeInterventions(base = {}, over = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(base), ...Object.keys(over)])) out[id] = { ...base[id], ...over[id] };
  return out;
}

// One running level: an ECS world plus a fixed-timestep runner. No Phaser
// dependency, so it runs identically in the browser and under Node tests.
// Presentation attaches from outside and only reads this world.
export class TrafficSession {
  static create(level, gameConfig, overrides = {}) {
    assertValidLevel(level, { vehicleTypes: gameConfig.vehicleTypes });
    return new TrafficSession(level, gameConfig, overrides);
  }

  constructor(level, gameConfig, overrides) {
    this.level = level;
    this.gameConfig = gameConfig;
    this.disposed = false;

    // Order matters: EventBus -> EntityManager -> entities -> systems
    ServiceLocator.shutDown();
    this.events = new EventBus("game");
    this.entityManager = new EntityManager();
    this.entities = instantiateLevel(this.entityManager, level, overrides.seed);

    const traffic = level.traffic ?? {};
    const mix = Object.entries(traffic.vehicleMix ?? { car: 1 }).filter(([, w]) => w > 0);
    const rules = gameConfig.simulation;
    const factory = new PrefabFactory(this.entityManager, trafficComponentDefaults, level);
    this.simEntity = factory.createEntity({
      type: "simulation",
      uniqueId: `${level.id}__simulation`,
      components: {
        SimulationComponent: {
          levelId: level.id,
          tickRate: rules.tickRate,
          seed: overrides.seed ?? traffic.seed ?? 1,
          demandScale: overrides.demandScale ?? 1,
          vehicleMix: mix.map(([typeId, weight]) => ({ typeId, weight })),
          vehicleTypes: structuredClone(gameConfig.vehicleTypes), // sessions must not mutate shared config
          demandCurves: structuredClone(level.demandCurves),
          incidents: { ...rules.incidents, ...level.incidents },
          gridlock: { ...rules.gridlock, ...level.gridlock },
          scoring: { ...rules.scoring, ...level.scoring },
          economy: { ...rules.economy, ...level.economy },
          multiplier: { ...rules.multiplier, ...level.multiplier },
          pressure: { ...rules.pressure, ...level.pressure },
          interventions: mergeInterventions(rules.interventions, level.interventions),
          diversions: { slots: 0, cooldown: 0, ...rules.diversions, ...level.diversions },
          goal: level.goal,
          scheduledObstacles: structuredClone(level.obstacles ?? []).sort((a, b) => a.at - b.at),
        },
        TrafficStatsComponent: {},
      },
    });
    this.sim = this.simEntity.getComponent("SimulationComponent");
    this.stats = this.simEntity.getComponent("TrafficStatsComponent");
    ServiceLocator.register("game", "TrafficSimulation", this.sim);
    ServiceLocator.register("game", "TrafficStats", this.stats);

    // Update order is the causal order of the game. Each step only reads what
    // earlier steps produced this tick:
    //   1 demand      arrivals join the finite input queues
    //   2 spawn       queue heads enter the network if their lane has room
    //   3 signals     player commands -> signal group states
    //   4 interventions  player spends cash (tow truck): edits obstacle timers
    //   4b diversions player closes a movement: uncommitted paths are rewritten round it
    //   5-6 vehicles  approach, stop-line decisions, movement along paths
    //   7-8 conflicts two vehicles in one conflict zone -> incident + obstacle
    //   9 obstacles   activate, count down, clear (blocks act as stopped leaders)
    //  10 junctions   box occupancy / blocked-box detection
    //  11 outputs     arrived vehicles leave the network and are paid: base reward x current multiplier
    //  12 streams     per (signal group, lane): queue, pressure, risk
    //  13 stats       queues, capacity, load, congestion
    //  14 multiplier  congestion -> multiplier (eased)
    //  15 gridlock    a full input queue for long enough ends the level
    //  16 shift       surviving goal.surviveSeconds completes it
    // (presentation runs outside the simulation and only reads it.)
    this.vehicleSystem = new VehicleSystem();
    this.diversions = new DiversionSystem();
    this.systems = [
      new TrafficDemandSystem(),
      new VehicleSpawnSystem(this.diversions),
      new TrafficSignalSystem(),
      (this.interventions = new InterventionSystem()),
      this.diversions,
      this.vehicleSystem,
      new JunctionConflictSystem(),
      new ObstacleSystem(this.vehicleSystem, (id) => this.entities.get(id)),
      new JunctionSystem(),
      new OutputGateSystem(this.vehicleSystem),
      (this.streams = new StreamSystem()),
      new TrafficStatsSystem(),
      new MultiplierSystem(),
      new GridlockSystem(),
      new ShiftSystem(),
    ];

    this.accumulator = 0;
    this.perf = { tickMs: 0, tickMsMax: 0, ticks: 0 };
  }

  get time() {
    return this.sim.time;
  }

  // Advances by one fixed simulation tick.
  tick() {
    if (this.sim.status !== "running") return; // level over: the final state stays on screen
    const t0 = performance.now();
    const dt = this.sim.dt;
    for (let i = 0; i < this.systems.length; i++) this.systems[i].update(dt);
    this.sim.time += dt;
    this.sim.tick++;
    const ms = performance.now() - t0;
    this.perf.ticks++;
    this.perf.tickMs += (ms - this.perf.tickMs) * 0.05;
    if (ms > this.perf.tickMsMax) this.perf.tickMsMax = ms;
  }

  // Called once per rendered frame with real elapsed seconds.
  advance(realDt) {
    if (this.sim.paused || this.gameOver || !(realDt > 0)) return 0; // also rejects NaN/undefined
    this.accumulator += Math.min(realDt, 0.25) * this.sim.speed;
    let steps = 0;
    while (this.accumulator >= this.sim.dt && steps < MAX_STEPS_PER_FRAME) {
      this.tick();
      this.accumulator -= this.sim.dt;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return steps;
  }

  // Runs n ticks regardless of pause state (tests, single-step debugging).
  step(n = 1) {
    for (let i = 0; i < n; i++) this.tick();
  }

  command(cmd) {
    this.sim.commands.push(cmd);
  }

  // Player signal control: ask a group to turn green or red.
  setSignal(group, green) {
    this.command({ type: "signal.set", group, green });
  }

  toggleSignal(group) {
    this.command({ type: "signal.toggle", group });
  }

  // Player diversion: close a movement (a stream id, "groupId@laneId"), or reopen it.
  toggleDiversion(target) {
    this.command({ type: "diversion.toggle", target });
  }

  // Sign traffic round an incident (every movement into the road it blocks), or lift that.
  divertAround(obstacleId) {
    this.toggleDiversion(incidentTarget(obstacleId));
  }

  setPaused(paused) {
    this.sim.paused = paused;
  }

  setSpeed(multiplier) {
    this.sim.speed = multiplier;
  }

  entity(levelId) {
    return this.entities.get(levelId);
  }

  get gameOver() {
    return this.sim.status !== "running";
  }

  // Player intervention (tow truck...). Applied at the next tick if still allowed.
  intervene(id, target) {
    this.command({ type: `intervention.${id}`, target });
  }

  // End-of-run numbers for ratings and the result card.
  summary() {
    const st = this.stats;
    return {
      status: this.sim.status,
      time: st.time,
      score: st.score,
      earned: st.earned,
      cash: st.cash,
      incidents: st.incidents,
      throughput: st.completed,
      towsUsed: st.towsUsed,
      diversionsUsed: this.diversions.used,
      avgMultiplier: st.avgMultiplier,
      peakMultiplier: st.peakMultiplier,
    };
  }

  vehicles() {
    return this.vehicleSystem.entities;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ServiceLocator.shutDown();
  }
}
