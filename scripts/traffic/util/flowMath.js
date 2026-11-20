// Pure Flow/economy maths shared by the simulation and tests. Nothing here
// knows about ECS or Phaser. Every number a player sees (burst bonus, risk
// band) is derived from the lane's real capacity, not from fixed car counts.

export const RISK = { SAFE: 0, PRESSURE: 1, DANGER: 2, CRITICAL: 3 };
export const RISK_NAMES = ["SAFE", "PRESSURE", "DANGER", "CRITICAL"];

// How many average vehicles fit nose to tail on a lane, given the level's mix.
export function laneCapacity(laneLength, vehicleMix, vehicleTypes) {
  let weight = 0;
  let slot = 0;
  for (const { typeId, weight: w } of vehicleMix) {
    const t = vehicleTypes[typeId];
    weight += w;
    slot += w * (t.length + t.minGap);
  }
  return Math.max(1, Math.floor(laneLength / (weight > 0 ? slot / weight : 41)));
}

// Per-car payout multiplier for releasing `size` waiting cars from a lane that
// holds `capacity`. 1 below minQueue, then grows faster than linearly so that
// holding a long queue pays much more than releasing in dribs.
export function burstMultiplier(size, capacity, flow) {
  if (size < flow.minQueue) return 1;
  const fill = Math.min(1, size / Math.max(1, capacity));
  return 1 + flow.burstMax * Math.pow(fill, 1.3);
}

// Pressure is how full the holding space is: the lane plus this lane's share of
// the off-map input queue behind it. 0..1+, mapped onto bands from the config.
export function riskBand(pressure, bands) {
  let band = 0;
  for (let i = 0; i < bands.length; i++) if (pressure >= bands[i]) band = i + 1;
  return band;
}

// A release is worth chaining only when it is a real charge for that lane.
export function chainThreshold(capacity, flow) {
  return Math.max(flow.minQueue, Math.ceil(flow.chainFill * capacity));
}
