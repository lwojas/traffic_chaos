import { el } from "../dom.js";
import { applyTheme } from "../theme.js";
import { HudReadModel } from "../../view/HudReadModel.js";
import { CashDisplay } from "./CashDisplay.js";
import { TowPanel } from "./TowPanel.js";
import { MapSelect } from "./MapSelect.js";
import { GridlockDisplay } from "./GridlockDisplay.js";
import { QueueStatus } from "./QueueStatus.js";
import { IncidentStatus } from "./IncidentStatus.js";
import { StatusDisplay } from "./StatusDisplay.js";
import { GameControls } from "./GameControls.js";
import { StatusBanner } from "./StatusBanner.js";
import { Minimap } from "./Minimap.js";

const REFRESH_SECONDS = 0.1; // simulation values change per tick; the DOM refreshes at 10 Hz
const HINT = "Hold traffic to build a queue, then click its control to RELEASE · T tow · drag or arrow keys to scroll · Space pause · R restart";

// The player HUD: a set of independent widgets anchored to the corners of the
// game viewport (CSS, so it follows resizes and is unrelated to world size).
// It reads one HudReadModel snapshot per refresh and hands it to every widget;
// each widget touches the DOM only when its own values change.
export class GameHud {
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.widgets = [];
    applyTheme(root);
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener("keydown", this.onKey);
  }

  // Rebuilds the level-specific widgets for a new session.
  bind(session, camera) {
    this.clear();
    this.camera = camera;
    this.model = new HudReadModel(session);
    const r = this.root;
    const zone = (name) => r.appendChild(el("div", `hud-zone hud-${name}`));
    const topLeft = zone("top-left");
    const topCenter = zone("top-center");
    const topRight = zone("top-right");
    const bottomLeft = zone("bottom-left");
    const bottomRight = zone("bottom-right");
    const center = zone("center");

    const first = this.model.read();
    const maps = new MapSelect(center, this.actions);
    const openMaps = () => maps.toggle();
    this.tow = new TowPanel(topLeft, this.actions, camera);
    this.widgets = [
      new CashDisplay(topLeft),
      new IncidentStatus(topLeft, camera),
      this.tow,
      new QueueStatus(topLeft, first.gates, camera),
      new GridlockDisplay(topCenter),
      new StatusDisplay(topRight),
      new GameControls(topRight, this.actions, openMaps),
      new Minimap(bottomRight, { level: session.level, camera, gates: this.model.inputGatePoints(), outputs: this.model.outputGatePoints() }),
      new StatusBanner(center, this.actions, openMaps),
    ];
    bottomLeft.append(el("div", "hud-hint", HINT));
    this.minimap = this.widgets.find((w) => w instanceof Minimap);
    this.snapshot = first;
    this.elapsed = REFRESH_SECONDS;
  }

  clear() {
    this.root.replaceChildren();
    this.widgets = [];
    this.minimap = null;
  }

  update(dt) {
    if (this.widgets.length === 0) return;
    this.elapsed += dt;
    if (this.elapsed >= REFRESH_SECONDS) {
      this.elapsed = 0;
      this.snapshot = this.model.read();
      for (const w of this.widgets) w.update(this.snapshot);
    }
    this.minimap.update(this.snapshot); // cheap: redraws only when the camera or snapshot changed
  }

  handleKey(e) {
    const t = e.target.tagName;
    if (t === "SELECT" || t === "INPUT" || t === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey || !this.actions.session) return;
    const key = e.key.toLowerCase();
    if (key === " ") {
      e.preventDefault();
      this.actions.togglePause();
    } else if (key === "r") this.actions.restart();
    else if (key === "d") this.actions.toggleDebug();
    else if (key === "t") this.tow?.towWorst();
    else if (["q", "w", "e"].includes(key)) {
      const speed = this.actions.speeds[["q", "w", "e"].indexOf(key)];
      if (speed) this.actions.setSpeed(speed);
    }
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.clear();
  }
}
