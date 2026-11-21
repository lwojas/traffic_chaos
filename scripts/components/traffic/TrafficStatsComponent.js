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
    this.demandRate = 0; // total arrivals per second right now
    this.score = 0;
    this.blockedEntries = 0; // vehicles held at a green line with no room beyond
    this.blockedJunctionEvents = 0;
    this.satisfaction = 0; // 0..1 meter: waiting traffic lowers it, traffic that gets moving after a wait raises it
    this.satMultiplier = 1; // income multiplier derived from satisfaction
    this.satWaiting = 0; // cars waiting past the free grace period
    this.satDrain = 0; // meter share lost per second right now
    this.satRecent = 0; // decaying sum of recent release gain (HUD trend)
    this.satPool = 0; // release gain still to be paid out
    this.satIntegral = 0;
    this.avgSatisfaction = 0;
    this.peakSatisfaction = 0;
    this.minSatisfaction = 1;
    this.cash = 0; // spendable money: earned from traffic that actually got through
    this.earned = 0; // total income this run (never reduced by spending)
    this.baseIncome = 0; // funds/s at multiplier x1
    this.incomeRate = 0; // funds/s right now: baseIncome x satMultiplier
    this.biggestRelease = 0; // most satisfaction (share of the meter) one release window paid
    this.towsUsed = 0;
    this.time = 0;
    this.completionTimes = []; // rolling window for throughput
    this.queueByLane = {};
    this.custom = {};
  }
}
