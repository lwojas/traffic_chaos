import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { TrafficEvents } from "../../traffic/TrafficEvents.js";

// Step 4: player interventions. Spend cash to change the network: the tow
// truck is the first. Commands arrive on the simulation queue like signal
// commands and are applied at tick boundaries:
//   { type: "intervention.tow", target: obstacleLevelId }    crashes
//   { type: "intervention.crew", target: obstacleLevelId }   roadworks (a burst pipe: the road crew fixes it quickly, for a price)
//
// An intervention is a handler in `handlers` plus a config entry under
// `interventions` (cost, costStep, cooldown...). Adding another (capacity
// boost...) means adding one handler; the cash, cost-escalation and
// cooldown bookkeeping here is shared. Interventions only edit existing
// simulation state (the tow and the road crew shorten an obstacle's timer): they never add
// vehicle behaviour, and the collision model is untouched.
export class InterventionSystem extends System {
  constructor() {
    super();
    this.obstacleHelper = {};
    this.obstacleHelper.entities = this.entityManager.registerSystem(this.obstacleHelper, ["ObstacleComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
    this.stats = ServiceLocator.resolve("game", "TrafficStats");
    this.events = ServiceLocator.resolve("game", "EventSystem");
    this.state = {}; // id -> { uses, readyAt }
    for (const id of Object.keys(this.sim.interventions)) this.state[id] = { uses: 0, readyAt: 0 };
    // Both clear an obstacle early by shortening its timer; they differ in what they can fix and what they cost
    const clearing = (kind, busy, invalid, wrong) => ({
      check: (target) => this.findObstacle(target),
      invalid,
      busy,
      apply: (obstacleEntity, cfg, id) => {
        const o = obstacleEntity.getComponent("ObstacleComponent");
        o.towed = true; // "being cleared": drawn as a shrinking bar until it ends
        o.remaining = Math.min(o.remaining, cfg.delay);
        this.events.emit(TrafficEvents.TOW_CALLED, obstacleEntity, this.cost(id));
      },
      usable: (obstacleEntity) => {
        const o = obstacleEntity.getComponent("ObstacleComponent");
        if ((o.kind === "collision") !== (kind === "collision")) return wrong;
        if (!o.active) return "incident not active yet";
        if (o.towed) return kind === "collision" ? "tow already on the way" : "crew already on the way";
        return null;
      },
    });
    this.handlers = {
      tow: clearing("collision", "tow truck is recovering", "no such incident", "the tow truck only clears crashes"),
      crew: clearing("roadworks", "road crew is busy", "no such roadworks", "the road crew only fixes roadworks"),
    };
  }

  findObstacle(levelId) {
    return this.obstacleHelper.entities.find((e) => e.id === levelId) ?? null;
  }

  cost(id) {
    const cfg = this.sim.interventions[id];
    return cfg.cost + cfg.costStep * this.state[id].uses;
  }

  // Everything the UI needs to draw an intervention button.
  describe(id) {
    const cfg = this.sim.interventions[id];
    const st = this.state[id];
    const cooldownLeft = Math.max(0, st.readyAt - this.sim.time);
    const cost = this.cost(id);
    return { id, cost, uses: st.uses, cooldownLeft, cooldown: cfg.cooldown, affordable: this.stats.cash >= cost, ready: cooldownLeft <= 0, delay: cfg.delay };
  }

  // Why a request would be refused right now, or null if it would go through.
  refusal(id, target) {
    const h = this.handlers[id];
    if (!h) return "unknown intervention";
    const d = this.describe(id);
    const entity = h.check(target);
    if (!entity) return h.invalid;
    const why = h.usable?.(entity);
    if (why) return why;
    if (!d.ready) return h.busy;
    if (!d.affordable) return "not enough cash";
    return null;
  }

  update() {
    const cmds = this.sim.commands;
    for (let i = 0; i < cmds.length; ) {
      if (!cmds[i].type.startsWith("intervention.")) {
        i++;
        continue;
      }
      const [cmd] = cmds.splice(i, 1);
      const id = cmd.type.slice("intervention.".length);
      if (this.refusal(id, cmd.target)) continue;
      const cfg = this.sim.interventions[id];
      const st = this.state[id];
      this.stats.cash -= this.cost(id);
      st.uses++;
      st.readyAt = this.sim.time + cfg.cooldown;
      this.stats.towsUsed = this.state.tow?.uses ?? 0;
      this.handlers[id].apply(this.handlers[id].check(cmd.target), cfg, id);
    }
  }
}
