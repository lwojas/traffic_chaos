import { el } from "../dom.js";
import { TrafficEvents } from "../../TrafficEvents.js";

const HIGH_MULTIPLIER = 3; // exits paid at or above this get the highlight colour
const MAX_POPUPS = 6;

// The reward event, shown where the eye already is: top centre of the screen, under the
// congestion panel, not out on the map. Each exit pops "+points ×multiplier  $cash" and the text
// grows to 200% while it fades (CSS). Reads the VEHICLE_COMPLETED event only; writes nothing.
export class ExitPopups {
  constructor(parent, session) {
    this.root = el("div", "hud-popups");
    parent.append(this.root);
    this.count = 0;
    session.events.on(TrafficEvents.VEHICLE_COMPLETED, (vehicle, gate, reward) => this.pop(reward));
  }

  update() {} // event driven

  pop(r) {
    while (this.root.childElementCount >= MAX_POPUPS) this.root.firstElementChild.remove();
    const n = el("div", "hud-pop");
    n.dataset.tier = r.multiplier >= HIGH_MULTIPLIER ? "high" : "base";
    n.style.setProperty("--slot", String(this.count++ % 3));
    n.append(el("b", "", `+${Math.round(r.points)}`), el("i", "", `×${r.multiplier.toFixed(1)}`), el("span", "", `$${Math.round(r.cash)}`));
    n.addEventListener("animationend", () => n.remove());
    this.root.append(n);
  }
}
