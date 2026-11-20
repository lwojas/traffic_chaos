// Where vehicles leave the network. Optional `outflowPerMinute` limits how fast
// the gate drains its lane (a bottleneck downstream of the map).
export class OutputGateComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.laneId = data.lane;
    this.label = data.label ?? data.levelId;
    this.outflowPerMinute = data.outflowPerMinute ?? 0;
    this.lane = null; // resolved by the instantiator
    // Runtime state
    this.tokens = 1;
    this.throughput = 0;
  }
}
