// Pure helpers for the lightweight traffic model. Units are pixels and seconds.

// Krauss safe speed: the highest speed at which a follower can still stop behind
// a leader travelling at leaderSpeed, given its braking and reaction time.
// `gap` is the free bumper-to-bumper distance after the standstill gap.
export function safeSpeed(gap, leaderSpeed, speed, decel, reactionTime) {
  if (gap <= 0) return 0;
  const v = leaderSpeed + (gap - leaderSpeed * reactionTime) / ((speed + leaderSpeed) / (2 * decel) + reactionTime);
  return v > 0 ? v : 0;
}

// Free space at the start of a lane: distance from the lane start to the rear
// bumper of the last vehicle, or to the nearest obstacle block, whichever is
// closer. Used for the one courtesy rule drivers follow: don't enter a junction
// with nowhere to go. Deliberately naive: it ignores vehicles still in the box.
// A last vehicle that is moving freely does not count: drivers expect it to keep
// going, so only a stopped or crawling one (a real queue) or a block takes room.
export const FLOWING_SPEED = 10;
export function laneEntryRoom(lane) {
  let free = lane.length;
  const list = lane.vehicles;
  if (list.length > 0) {
    const rear = list[list.length - 1];
    const rs = rear.components.VehicleStateComponent;
    if (rs.speed < FLOWING_SPEED) free = rs.s - rear.components.VehicleComponent.length;
  }
  for (let i = 0; i < lane.blockers.length; i++) if (lane.blockers[i].rear < free) free = lane.blockers[i].rear;
  return free;
}
