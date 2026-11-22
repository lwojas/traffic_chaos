import { el } from "../dom.js";
import { icon } from "../icons.js";

const COUNT_MS = 650; // how long the figure takes to catch up with a payout

// Top-right, small: cash on hand. When it goes up the figure counts up to the new value and the
// pill pulses, so every exit is felt here as well as in the popup. Spending (the tow) just snaps
// down; only gains are celebrated. The counting runs on its own animation frame, so it is smooth
// even though the HUD snapshot only refreshes at 10 Hz.
export class CashDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-cash");
    this.root.append(icon("coin", 14));
    this.value = el("b", "hud-cash-value", "$0");
    this.root.append(this.value);
    parent.append(this.root);
    this.target = 0;
    this.shown = 0;
    this.from = 0;
    this.start = 0;
    this.frame = 0;
    this.text = "";
    this.draw();
  }

  draw() {
    const text = `$${Math.round(this.shown).toLocaleString("en-US")}`;
    if (text !== this.text) {
      this.text = text;
      this.value.textContent = text;
    }
  }

  step = (now) => {
    const k = Math.min(1, (now - this.start) / COUNT_MS);
    this.shown = this.from + (this.target - this.from) * (1 - Math.pow(1 - k, 3));
    this.draw();
    this.frame = k < 1 ? requestAnimationFrame(this.step) : 0;
  };

  update(m) {
    const cash = Math.max(0, m.cash);
    if (Math.round(cash) === Math.round(this.target)) return;
    const gained = cash > this.target;
    this.target = cash;
    if (!gained) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.shown = cash;
      this.draw();
      return;
    }
    this.from = this.shown;
    this.start = performance.now();
    if (!this.frame) this.frame = requestAnimationFrame(this.step);
    this.root.classList.remove("bump");
    void this.root.offsetWidth; // restart the animation if a payout lands mid-pulse
    this.root.classList.add("bump");
  }

  destroy() {
    cancelAnimationFrame(this.frame);
  }
}
