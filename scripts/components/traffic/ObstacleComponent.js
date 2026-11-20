// A temporary reduction in network capacity. Deliberately not "a crashed car":
// it is a timer plus a list of blocked places, so collisions, roadworks, a
// broken-down vehicle or a closed bridge are all the same thing with a
// different `kind` and cause.
//   blocks: [{ lane: laneEntity, rear: s }]  a stationary virtual vehicle whose
//           rear bumper sits at path distance `rear` on that lane/connector
//   vehicles: vehicle entities disabled by this obstacle (removed on expiry)
export class ObstacleComponent {
  constructor(entity, data) {
    this.entity = entity;
    this.levelId = data.levelId;
    this.kind = data.kind;
    this.duration = data.duration;
    this.remaining = data.duration;
    this.blocks = data.blocks ?? [];
    this.vehicles = data.vehicles ?? [];
    this.zone = data.zone ?? null; // collision: the conflict zone it happened in
    this.createdAt = data.createdAt ?? 0;
    this.towed = false; // a tow truck has been called: remaining time is the truck's ETA
    this.active = false; // set by ObstacleSystem once its blockers are registered
  }
}
