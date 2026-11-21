// Pure Satisfaction maths, shared by the simulation (SatisfactionSystem), the
// stream read-outs and tests. `cfg` is simulation.satisfaction.

// 0..1 unhappiness of one car that has been held w seconds: free for `grace`,
// then rising (convex) to 1 at `fullWait`.
export function contribution(w, cfg) {
  const x = (w - cfg.grace) / (cfg.fullWait - cfg.grace);
  return x <= 0 ? 0 : Math.pow(Math.min(1, x), cfg.curve);
}

// Share of the meter a car is worth when it finally moves after waiting w (before the map-size
// scaling the SatisfactionSystem applies).
// Nothing inside the grace period; beyond it, faster than linear in w.
export function releaseGain(w, cfg) {
  if (w < cfg.grace) return 0;
  return cfg.gain * Math.pow(Math.min(w, cfg.fullWait * 1.5) / cfg.gainRef, cfg.gainCurve);
}

// Income multiplier for a satisfaction level 0..1
export function incomeMultiplier(satisfaction, range) {
  return range.min + (range.max - range.min) * satisfaction;
}
