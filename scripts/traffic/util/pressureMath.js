// Pure network-pressure maths shared by the simulation and tests. Nothing here
// knows about ECS or Phaser. Every number a player sees (risk band) is derived
// from the lane's real capacity, not from fixed car counts.

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

// Pressure is how full the holding space is: the lane plus this lane's share of
// the off-map input queue behind it. 0..1+, mapped onto bands from the config.
export function riskBand(pressure, bands) {
  let band = 0;
  for (let i = 0; i < bands.length; i++) if (pressure >= bands[i]) band = i + 1;
  return band;
}
