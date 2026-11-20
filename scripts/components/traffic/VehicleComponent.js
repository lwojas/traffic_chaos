// Static vehicle parameters, copied from a data-driven vehicle type.
export class VehicleComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.typeId = data.typeId;
    this.length = data.length;
    this.width = data.width;
    this.maxSpeed = data.maxSpeed;
    this.accel = data.accel;
    this.decel = data.decel; // comfortable braking, used for planning
    this.maxDecel = data.maxDecel ?? data.decel * 2; // emergency braking
    this.reactionTime = data.reactionTime;
    this.minGap = data.minGap;
    // Seconds a driver waits at a green line with no room beyond it before
    // pushing in anyway. Only affects box-blocking; never signals or conflicts.
    this.patience = data.patience;
    this.color = data.color;
  }
}
