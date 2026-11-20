import { el } from "../dom.js";
import { icon } from "../icons.js";

const KEY = "traffic.hintDismissed";

// One quiet instruction card, bottom-left. Dismissable and remembered per browser.
export class HintCard {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-hint");
    const badge = el("span", "hud-hint-icon");
    badge.append(icon("touch", 18));
    const text = el("div", "hud-hint-text");
    text.append(el("div", "hud-label hud-hint-title", "HOLD, THEN RELEASE"), el("div", "", "Click a signal to hold or release that traffic. A longer queue pays more when it goes, and risks more while it waits."));
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
