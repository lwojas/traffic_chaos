import { el } from "../dom.js";

// Pause, speed, restart and the debug-mode switch. Pure buttons over GameActions.
export class GameControls {
  constructor(parent, actions) {
    this.actions = actions;
    this.root = el("div", "hud-panel hud-controls");
    this.pause = this.button("Pause", "Pause / resume (Space)", () => actions.togglePause());
    this.speeds = actions.speeds.map((x) => {
      const b = this.button(`×${x}`, `Speed ×${x}`, () => actions.setSpeed(x));
      b.dataset.speed = x;
      return b;
    });
    this.button("Restart", "Restart level (R)", () => actions.restart());
    this.debugButton = this.button("Debug", "Debug panel and overlay (D)", () => actions.toggleDebug());
    parent.append(this.root);
  }
  button(label, title, onClick) {
    const b = el("button", "hud-button", label);
    b.title = title;
    b.addEventListener("click", onClick);
    this.root.append(b);
    return b;
  }
  update(m) {
    this.pause.textContent = m.paused ? "Resume" : "Pause";
    for (const b of this.speeds) b.classList.toggle("active", Number(b.dataset.speed) === m.speed);
    this.debugButton.classList.toggle("active", this.actions.debug.open);
  }
}
