// Pure multiplier maths, shared by the simulation (MultiplierSystem) and tests.
// `cfg` is simulation.multiplier.

// The multiplier congestion points at: `max` while the network is calm, falling in a straight line
// to `min` once congestion reaches `jam`.
export function targetMultiplier(congestion, cfg) {
  const t = Math.min(1, Math.max(0, (congestion - cfg.calm) / (cfg.jam - cfg.calm)));
  return cfg.max - (cfg.max - cfg.min) * t;
}
