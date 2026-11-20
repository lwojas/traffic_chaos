import { System } from "../System.js";
import { ServiceLocator } from "../../services/ServiceLocator.js";
import { LightState } from "../../components/traffic/SignalGroupComponent.js";

// Step 3: signals. The player asks for a group to be green or red. Green takes
// effect at once; red goes through yellow first. There is deliberately no
// interlock: nothing stops the player opening conflicting groups together, and
// nothing inserts an all-red gap between them. Clearance is the player's job.
//
// Commands arrive on the simulation's command queue and are applied at tick
// boundaries, which keeps runs reproducible.
//   { type: "signal.set", group: levelId, green: boolean }
//   { type: "signal.toggle", group: levelId }
export class TrafficSignalSystem extends System {
  constructor() {
    super();
    this.entities = this.entityManager.registerSystem(this, ["SignalGroupComponent"]);
    this.sim = ServiceLocator.resolve("game", "TrafficSimulation");
  }

  update(dt) {
    this.drainCommands();
    for (let i = 0; i < this.entities.length; i++) {
      const g = this.entities[i].getComponent("SignalGroupComponent");
      g.timeInState += dt;
      if (g.wantGreen) {
        if (g.state !== LightState.GREEN) this.setState(g, LightState.GREEN);
      } else if (g.state === LightState.GREEN) {
        this.setState(g, g.yellowTime > 0 ? LightState.YELLOW : LightState.RED);
      } else if (g.state === LightState.YELLOW && g.timeInState >= g.yellowTime) {
        this.setState(g, LightState.RED);
      }
    }
  }

  setState(g, state) {
    g.state = state;
    g.timeInState = 0;
  }

  drainCommands() {
    const cmds = this.sim.commands;
    for (let i = 0; i < cmds.length; ) {
      const cmd = cmds[i];
      if (!cmd.type.startsWith("signal.")) {
        i++;
        continue;
      }
      cmds.splice(i, 1);
      const entity = this.entities.find((e) => e.id === cmd.group);
      if (!entity) continue;
      const g = entity.getComponent("SignalGroupComponent");
      g.wantGreen = cmd.type === "signal.toggle" ? !g.wantGreen : !!cmd.green;
    }
  }
}
