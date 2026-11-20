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
export function laneEntryRoom(lane) {
  let free = lane.length;
  const list = lane.vehicles;
  if (list.length > 0) {
    const rear = list[list.length - 1];
    free = rear.components.VehicleStateComponent.s - rear.components.VehicleComponent.length;
  }
  for (let i = 0; i < lane.blockers.length; i++) if (lane.blockers[i].rear < free) free = lane.blockers[i].rear;
  return free;
}
