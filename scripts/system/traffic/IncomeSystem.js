import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";

// Step 12: income. Funds accrue continuously:
//
//     funds/s = economy.incomePerSecond x satisfaction multiplier
//
// There is no per-vehicle payout. Good traffic management raises Satisfaction,
// which raises the multiplier, which raises the rate. This is the only system
// that adds to `stats.cash`; the tow truck is the only thing that spends it.
export class IncomeSystem extends System {
  constructor() {
    super();
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.base = this.sim.economy.incomePerSecond;
    this.stats.cash = this.sim.economy.startCash ?? 0;
    this.stats.baseIncome = this.base;
  }

  update(dt) {
    const rate = this.base * this.stats.satMultiplier;
    this.stats.incomeRate = rate;
    this.stats.cash += rate * dt;
    this.stats.earned += rate * dt;
  }
}
