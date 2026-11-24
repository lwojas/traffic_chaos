import { el } from "../dom.js";
import { icon } from "../icons.js";

const KEY = "traffic.hintDismissed.v3";

// One quiet instruction card, bottom-left. Dismissable and remembered per browser.
export class HintCard {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-hint");
    const badge = el("span", "hud-hint-icon");
    badge.append(icon("touch", 18));
    const text = el("div", "hud-hint-text");
    text.append(el("div", "hud-label hud-hint-title", "KEEP TRAFFIC MOVING"), el("div", "", "Click a signal to stop or release that traffic; hold it (or right-click) to divert traffic round that turn. Every car that reaches an exit pays points and cash times your multiplier; queues lower it. A full queue ends the shift."));
    const close = el("button", "hud-hint-close");
    close.append(icon("close", 12));
    close.title = "Dismiss";
    close.addEventListener("click", () => {
      this.root.hidden = true;
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        /* storage blocked */
      }
    });
    this.root.append(badge, text, close);
    try {
      this.root.hidden = localStorage.getItem(KEY) === "1";
    } catch {
      /* storage blocked */
    }
    parent.append(this.root);
  }
  update() {}
}
