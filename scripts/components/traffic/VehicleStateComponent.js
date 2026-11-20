export const VehicleStates = {
  DRIVING: 0,
  APPROACHING: 1,
  SLOWING: 2,
  STOPPED: 3,
  ENTERING_JUNCTION: 4,
  CROSSING_JUNCTION: 5,
  EXITING: 6,
  CRASHED: 7,
};

// Dynamic vehicle state. Position along the current segment is `s`, measured at
// the front bumper. Entity Position/angle are derived from it each tick.
export class VehicleStateComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.route = data.route; // route entity
    this.routeIndex = data.routeIndex ?? 0;
    this.segment = data.segment; // current lane/connector entity
    this.s = data.s ?? 0;
    this.speed = data.speed ?? 0;
    this.state = VehicleStates.DRIVING;
    this.braking = false;
    this.angle = 0;
    this.waitTime = 0; // total seconds spent stopped on approach lanes
    this.stillTime = 0; // consecutive seconds with speed ~0
    this.blockedAtLine = 0; // consecutive seconds held at a green line with no room beyond
    this.arrived = false; // reached the end of its route; the output gate removes it
    this.disabled = false; // in an incident: part of an obstacle until it clears
    this.spawnTime = data.spawnTime ?? 0;
  }
}
