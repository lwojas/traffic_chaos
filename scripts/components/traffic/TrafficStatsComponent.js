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
    this.throughputPerMin = 0;
    this.junctionUtilisation = 0;
    this.incidents = 0;
    this.activeObstacles = 0;
    this.blockedLanes = 0;
    this.networkCapacity = 1; // 0..1: share of lanes not blocked by an obstacle
    this.networkLoad = 0; // 0..1: share of lane length occupied by vehicles
    this.demandRate = 0; // total arrivals per second right now
    this.score = 0;
    this.blockedEntries = 0; // vehicles held at a green line with no room beyond
    this.blockedJunctionEvents = 0;
    this.time = 0;
    this.completionTimes = []; // rolling window for throughput
    this.queueByLane = {};
    this.custom = {};
  }
}
