// Simulation statistics. Written by TrafficStatsSystem, read by UI/debug tools.
// `custom` lets new gameplay systems publish extra values without schema changes.
export class TrafficStatsComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.spawned = 0; // vehicles injected into the network
    this.arrived = 0; // demand that reached an input queue
    this.completed = 0; // throughput: vehicles that reached an output gate
    this.current = 0;
    this.waiting = 0;
    this.totalWaitCompleted = 0;
    this.avgWaitTime = 0;
    this.queueNow = 0; // stopped vehicles on approach lanes
    this.avgQueueLength = 0;
    this.maxQueueLength = 0;
    this.queueIntegral = 0;
    this.inputQueued = 0; // vehicles waiting in input gate queues
    this.inputCapacity = 0;
    this.peakQueueFill = 0; // 0..1: fullest input queue; 1 means a gate is full and the gridlock timer is running
    this.gridlockProgress = 0; // 0..1: how far the longest full-queue timer is toward ending the level
    this.throughputPerMin = 0;
    this.junctionUtilisation = 0;
    this.incidents = 0;
    this.activeObstacles = 0;
    this.blockedLanes = 0;
    this.networkCapacity = 1; // 0..1: share of lanes not blocked by an obstacle
    this.networkLoad = 0; // 0..1: share of lane length occupied by vehicles
    this.congestion = 0; // 0..1: pressure of the most backed-up stream (StreamSystem); the only input to the multiplier
    this.congestionStream = null; // id of that stream ("groupId@laneId"), null while nothing is queued
    this.congestionTrend = 0; // congestion minus its recent average: > 0 rising, < 0 falling
    this.demandRate = 0; // total arrivals per second right now
    this.score = 0; // points from exits, each at the multiplier of the moment (written by OutputGateSystem)
    this.blockedEntries = 0; // vehicles held at a green line with no room beyond
    this.blockedJunctionEvents = 0;
    this.multiplier = 1; // current reward multiplier: eases toward what congestion allows (MultiplierSystem)
    this.multiplierTarget = 1; // where congestion is pointing it
    this.multiplierIntegral = 0;
    this.avgMultiplier = 0;
    this.peakMultiplier = 0;
    this.cash = 0; // spendable money: earned from vehicles that reached an exit
    this.earned = 0; // total cash earned this run (never reduced by spending)
    this.towsUsed = 0;
    this.time = 0;
    this.completionTimes = []; // rolling window for throughput
    this.queueByLane = {};
    this.custom = {};
  }
}
