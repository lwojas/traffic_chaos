import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { targetMultiplier } from "../../traffic/util/multiplierMath.js";

const SMOOTH_SECONDS = 3; // congestion change is measured on a smoothed value, so a whole queue clearing in one tick pays out over a few seconds, not in one jump
const TREND_SECONDS = 4; // congestion is compared with its own recent average to tell rising from falling

// Step 14: the multiplier. It starts at `min` and is earned in small steps:
//
//   - it only RISES when congestion (stats.congestion, the worst stream's pressure) FALLS: each
//     drop of congestion adds `riseGain` per unit cleared. A calm network that never backed up
//     earns nothing; clearing a queue does.
//   - it FALLS when congestion rises (`fallGain` per unit), and is never allowed above the ceiling
//     congestion currently allows (max when calm, min when jammed), so a jam cuts it at once.
//
// Nothing else feeds it: no waiting-car penalty, no queue bonus. Exits are paid at the current
// value by OutputGateSystem. The multiplier is a measure of performance, never a failure state;
// only gridlock ends a level.
export class MultiplierSystem extends System {
  constructor() {
    super();
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.cfg = this.sim.multiplier;
    this.average = 0;
    this.smooth = 0;
    this.stats.multiplier = this.cfg.start ?? this.cfg.min;
    this.stats.multiplierTarget = this.stats.multiplier;
  }

  update(dt) {
    const st = this.stats;
    const cfg = this.cfg;
    const ceiling = targetMultiplier(st.congestion, cfg);
    const before = this.smooth;
    this.smooth += (st.congestion - this.smooth) * (1 - Math.exp(-dt / SMOOTH_SECONDS));
    const change = this.smooth - before;
    let m = st.multiplier;
    m += change < 0 ? -change * cfg.riseGain : -change * cfg.fallGain;
    if (m > ceiling) m += (ceiling - m) * (1 - Math.exp(-dt / cfg.fallSeconds));
    st.multiplier = Math.min(cfg.max, Math.max(cfg.min, m));
    st.multiplierTarget = ceiling;
    this.average += (st.congestion - this.average) * (1 - Math.exp(-dt / TREND_SECONDS));
    st.congestionTrend = st.congestion - this.average;
    st.multiplierIntegral += st.multiplier * dt;
    st.avgMultiplier = this.sim.time > 0 ? st.multiplierIntegral / this.sim.time : st.multiplier;
    if (st.multiplier > st.peakMultiplier) st.peakMultiplier = st.multiplier;
  }
}
