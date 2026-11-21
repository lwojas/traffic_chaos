import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";
import { contribution, releaseGain, incomeMultiplier } from "../../traffic/util/satisfactionMath.js";

const QUEUE_SPEED = 3; // px/s: slower than this counts as waiting (same as TrafficStatsSystem)

// Step 11: Satisfaction. Waiting traffic makes the city unhappy; traffic that gets
// moving after a wait makes it happy. One meter (0..1) and one income multiplier
// derived from it; this is the single answer to "why am I earning more?".
//
//   WAITING   each car's `spell` (seconds held) maps to a contribution c(w): free
//             for `grace` seconds, then rising to 1 at `fullWait`. Contributions
//             are summed (S) and drain is SATURATING in S, so a long queue is
//             bad but not catastrophic and the curve stays tunable:
//                 drain/s = drainMax x (1 - e^(-S/drainK))
//   RELEASE   a car that waited w and then enters the junction (or leaves the
//             map) is worth gain(w), growing faster than linearly with w. Gains
//             go into a pool that pays out over `recoverSeconds`, so even a big
//             release is a visible climb, never a jump to full.
//   SIZE      both sides scale with the number of entries (see `size`), so the same
//             meter means the same thing on a 2-entry and a 10-entry map.
//   REST      with nothing waiting satisfaction relaxes toward `rest`. Only
//             releasing long waits lifts it above, and that surge fades: the
//             reward for holding is real but temporary.
//
// Satisfaction 0 is not a failure: it collapses the multiplier. Gridlock is the
// only way to lose. Gate-queue cars (waiting off the map) count at gateWeight.
export class SatisfactionSystem extends System {
  constructor() {
    super();
    this.vehicleHelper = {};
    this.vehicleHelper.entities = this.entityManager.registerSystem(this.vehicleHelper, ["VehicleStateComponent"]);
    this.gateHelper = {};
    this.gates = this.entityManager.registerSystem(this.gateHelper, ["InputGateComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.cfg = this.sim.satisfaction;
    // The meter is the share of the whole city that is happy, so it is sized by the number of
    // entries: a city with twice the entries has twice the cars waiting and releasing at any moment,
    // and each car is worth proportionally less. `refEntries` is the size the numbers are tuned for.
    this.size = Math.max(1, this.gates.length / this.cfg.refEntries);
    this.value = this.cfg.start ?? this.cfg.rest;
    this.pool = 0; // gain earned but not yet paid out
    this.recent = 0; // decaying sum of recent gain, for the HUD trend
    this.completedGain = 0;
    this.events.on(TrafficEvents.VEHICLE_COMPLETED, (v) => this.onCompleted(v));
    this.events.on(TrafficEvents.SATISFACTION_GAIN, () => {});
    this.publish();
  }

  contribution(w) {
    return contribution(w, this.cfg);
  }

  gain(w) {
    return releaseGain(w, this.cfg) / this.size;
  }

  multiplierAt(v) {
    return incomeMultiplier(v, this.sim.multiplier);
  }

  onCompleted(vehicle) {
    const vs = vehicle.components.VehicleStateComponent;
    const g = this.gain(vs.spell);
    this.completedGain += g;
    if (g > 0) this.events.emit(TrafficEvents.SATISFACTION_GAIN, vehicle, g);
    vs.spell = 0;
  }

  update(dt) {
    const cfg = this.cfg;
    const vehicles = this.vehicleHelper.entities;
    let sum = 0;
    let waiting = 0;
    let gained = this.completedGain;
    let released = gained > 0 ? 1 : 0;
    this.completedGain = 0;

    for (let i = 0; i < vehicles.length; i++) {
      const vs = vehicles[i].components.VehicleStateComponent;
      const kind = vs.segment.components.LaneComponent.kind;
      let held;
      if (kind === "connector") {
        // Entering the junction is the release: settle the wait it spent on the approach
        if (vs.spell > 0) {
          const g = this.gain(vs.spell);
          if (g > 0) {
            gained += g;
            released++;
            this.events.emit(TrafficEvents.SATISFACTION_GAIN, vehicles[i], g);
          }
          vs.spell = 0;
        }
        held = vs.speed < QUEUE_SPEED ? vs.stillTime : 0; // stuck inside the box (or an incident)
      } else {
        if (vs.speed < QUEUE_SPEED) vs.spell += dt;
        held = vs.speed < QUEUE_SPEED ? vs.spell : 0; // creeping forward in a queue is not waiting
      }
      if (vs.disabled) held = vs.stillTime;
      const c = this.contribution(held);
      if (c > 0) {
        sum += c;
        waiting++;
      }
    }
    for (let i = 0; i < this.gates.length; i++) {
      const q = this.gates[i].components.InputGateComponent.queue;
      for (let k = 0; k < q.length; k++) {
        const c = this.contribution(this.sim.time - q[k].arrivedAt) * cfg.gateWeight;
        if (c > 0) {
          sum += c;
          waiting++;
        }
      }
    }

    const drain = cfg.drainMax * (1 - Math.exp(-sum / (cfg.drainK * this.size)));
    this.pool += gained;
    const paid = this.pool * (1 - Math.exp(-dt / cfg.recoverSeconds));
    this.pool -= paid;
    const relax = (cfg.rest - this.value) / cfg.restSeconds;
    this.value = Math.min(1, Math.max(0, this.value + (relax - drain) * dt + paid));

    this.recent = this.recent * Math.exp(-dt / 3) + gained;
    this.drain = drain;
    this.waiting = waiting;
    this.publish();
  }

  publish() {
    const st = this.stats;
    st.satisfaction = this.value;
    st.satMultiplier = this.multiplierAt(this.value);
    st.satWaiting = this.waiting ?? 0; // cars past the free grace period
    st.satDrain = this.drain ?? 0; // meter share lost per second right now
    st.satRecent = this.recent; // decaying sum of recent release gain
    st.satPool = this.pool; // gain still to be paid out
    st.satIntegral = (st.satIntegral ?? 0) + this.value * this.sim.dt;
    st.avgSatisfaction = this.sim.time > 0 ? st.satIntegral / this.sim.time : this.value;
    if (this.value > st.peakSatisfaction) st.peakSatisfaction = this.value;
    if (this.value < st.minSatisfaction) st.minSatisfaction = this.value;
  }
}
