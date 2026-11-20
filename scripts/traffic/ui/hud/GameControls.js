import { el, Cell, clock } from "../dom.js";
import { icon } from "../icons.js";
import { SettingsMenu } from "./SettingsMenu.js";

// Top-right control cluster: shift clock, pause, speed, recentre, settings.
// Pure buttons over GameActions. Debug and development controls are not here:
// they live behind Settings > Developer mode.
export class GameControls {
  constructor(parent, actions, { onMaps = () => {}, onRecenter = () => {} } = {}) {
    this.actions = actions;
    this.root = el("div", "hud-panel hud-controls");

    const clockBox = el("div", "hud-clock");
    this.time = new Cell(el("b", "", "0:00"));
    this.goal = new Cell(el("span", "hud-sub", ""));
    this.clockBar = new Cell(el("span", "hud-fill"));
    const track = el("span", "hud-track");
    track.append(this.clockBar.node);
    const line = el("div", "hud-clock-line");
    line.append(this.time.node, this.goal.node);
    clockBox.append(line, track);
    this.root.append(clockBox, el("span", "hud-divider"));

    this.pause = this.button("pause", "Pause / resume (Space)", () => actions.togglePause());
    this.speeds = actions.speeds.map((x) => {
      const b = el("button", "hud-button hud-speed", `${x}×`);
      b.title = `Speed ${x}×`;
      b.addEventListener("click", () => actions.setSpeed(x));
      b.dataset.speed = x;
      this.root.append(b);
      return b;
    });
    this.root.append(el("span", "hud-divider"));
    this.button("recenter", "Re-centre the view", onRecenter);
    this.settingsButton = this.button("settings", "Settings", () => this.menu.toggle());
    this.menu = new SettingsMenu(this.root, actions, { onMaps, anchor: this.settingsButton });
    parent.append(this.root);
  }

  button(name, title, onClick) {
    const b = el("button", "hud-button hud-icon-button");
    b.append(icon(name, 16));
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", onClick);
    this.root.append(b);
    if (name === "pause") this.pauseIcon = b;
    return b;
  }

  update(m) {
    this.time.set(clock(m.time));
    this.goal.set(m.goalSeconds ? `/ ${clock(m.goalSeconds)}` : "");
    this.clockBar.css("width", m.goalSeconds ? `${Math.min(100, (m.time / m.goalSeconds) * 100).toFixed(1)}%` : "0%");
    const paused = m.paused;
    if (this.wasPaused !== paused) {
      this.wasPaused = paused;
      this.pauseIcon.replaceChildren(icon(paused ? "play" : "pause", 16));
      this.pauseIcon.classList.toggle("active", paused);
    }
    for (const b of this.speeds) b.classList.toggle("active", Number(b.dataset.speed) === m.speed);
    this.menu.sync();
  }

  destroy() {
    this.menu.destroy();
  }
}
