import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

const QUEUE_SPEED = 3; // px/s: slower than this counts as queued
const THROUGHPUT_WINDOW = 60; // seconds

// Steps 9 and 11: queues, capacity and score. Event listeners count discrete
// things, update() samples continuous ones. UI and debug tools read the stats
// component; they never compute.
export class TrafficStatsSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["TrafficStatsComponent"]);
    this.laneHelper = {};
    this.lanes = this.entityManager.registerSystem(this.laneHelper, ["LaneComponent"]);
    this.junctionHelper = {};
    this.junctions = this.entityManager.registerSystem(this.junctionHelper, ["JunctionComponent"]);
    this.vehicleHelper = {};
    this.vehicleHelper.entities = this.entityManager.registerSystem(this.vehicleHelper, ["VehicleStateComponent"]);
    this.gateHelper = {};
    this.gates = this.entityManager.registerSystem(this.gateHelper, ["InputGateComponent"]);
    this.obstacleHelper = {};
    this.obstacleHelper.entities = this.entityManager.registerSystem(this.obstacleHelper, ["ObstacleComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.approachCount = this.lanes.filter((l) => l.components.LaneComponent.kind === "approach").length;

    const events = ServiceLocator.resolve("game", "EventSystem");
    events.on(TrafficEvents.VEHICLE_SPAWNED, () => this.stats.spawned++);
    events.on(TrafficEvents.DEMAND_ARRIVED, () => this.stats.arrived++);
    events.on(TrafficEvents.VEHICLE_COMPLETED, (e) => {
      const s = this.stats;
      s.completed++;
      s.totalWaitCompleted += e.components.VehicleStateComponent.waitTime;
      s.completionTimes.push(this.sim.time);
    });
    events.on(TrafficEvents.INCIDENT, () => this.stats.incidents++);
    events.on(TrafficEvents.ENTRY_BLOCKED, () => this.stats.blockedEntries++);
    events.on(TrafficEvents.JUNCTION_BLOCKED, () => this.stats.blockedJunctionEvents++);
    // The bus warns when an event has no listener; these are emitted for presentation/UI to use
    for (const name of [TrafficEvents.VEHICLE_REMOVED, TrafficEvents.OBSTACLE_STARTED, TrafficEvents.OBSTACLE_CLEARED, TrafficEvents.GRIDLOCK, TrafficEvents.TOW_CALLED]) events.on(name, () => {});
  }

  update(dt) {
    const s = this.stats;
    const sim = this.sim;
    const t = sim.time + dt; // stats run late, so this tick has completed
    s.time = t;

    let queueTotal = 0;
    let blockedLanes = 0;
    let loadSum = 0;
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i].components.LaneComponent;
      if (lane.blockers.length > 0) blockedLanes++;
      let q = 0;
      if (lane.kind === "approach") {
        const list = lane.vehicles;
        let occupied = 0;
        for (let k = 0; k < list.length; k++) {
          occupied += list[k].components.VehicleComponent.length;
          if (q === k && list[k].components.VehicleStateComponent.speed < QUEUE_SPEED) q++;
        }
        loadSum += Math.min(1, occupied / lane.length);
        queueTotal += q;
        if (q > s.maxQueueLength) s.maxQueueLength = q;
        s.queueByLane[lane.levelId] = q;
      }
      lane.queueLength = q;
    }
    s.queueNow = queueTotal;
    if (this.approachCount > 0) {
      s.queueIntegral += (queueTotal / this.approachCount) * dt;
      s.networkLoad = loadSum / this.approachCount;
    }
    s.avgQueueLength = t > 0 ? s.queueIntegral / t : 0;
    s.blockedLanes = blockedLanes;
    s.networkCapacity = this.lanes.length > 0 ? 1 - blockedLanes / this.lanes.length : 1;
    s.activeObstacles = this.obstacleHelper.entities.length;

    // Vehicles come and go, so read the list fresh (the manager replaces it on refresh)
    const vehicles = this.vehicleHelper.entities;
    s.current = vehicles.length;
    let waiting = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const vs = vehicles[i].components.VehicleStateComponent;
      if (vs.speed < 1 && vs.segment.components.LaneComponent.kind === "approach") waiting++;
    }
    s.waiting = waiting;
    s.avgWaitTime = s.completed > 0 ? s.totalWaitCompleted / s.completed : 0;

    const times = s.completionTimes;
    let drop = 0;
    while (drop < times.length && times[drop] < t - THROUGHPUT_WINDOW) drop++;
    if (drop > 0) times.splice(0, drop);
    s.throughputPerMin = (times.length * 60) / Math.min(THROUGHPUT_WINDOW, Math.max(t, 1));

    let used = 0;
    for (let i = 0; i < this.junctions.length; i++) used += this.junctions[i].components.JunctionComponent.usedTime;
    s.junctionUtilisation = t > 0 && this.junctions.length > 0 ? used / (t * this.junctions.length) : 0;

    let queued = 0;
    let capacity = 0;
    let rate = 0;
    let peakFill = 0;
    let peakFull = 0;
    const fullSeconds = sim.gridlock.fullSeconds;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i].components.InputGateComponent;
      queued += g.queue.length;
      capacity += g.queueCapacity;
      rate += g.rate;
      const fill = g.queue.length / g.queueCapacity;
      if (fill > peakFill) peakFill = fill;
      const full = fullSeconds > 0 ? g.fullTime / fullSeconds : 0; // GridlockSystem runs after this, so one tick behind
      if (full > peakFull) peakFull = full;
    }
    s.peakQueueFill = peakFill;
    s.gridlockProgress = Math.min(1, peakFull);
    s.inputQueued = queued;
    s.inputCapacity = capacity;
    s.demandRate = rate;

    // Biggest single release: the most satisfaction a 3 s window of releases paid
    if (s.satRecent > s.biggestRelease) s.biggestRelease = s.satRecent;

    s.score = s.completed * sim.scoring.perVehicle - s.incidents * sim.scoring.perIncident;
  }
}
