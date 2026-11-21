import { el } from "../dom.js";
import { applyLayout } from "../theme.js";
import { HudReadModel } from "../../view/HudReadModel.js";
import { CashDisplay } from "./CashDisplay.js";
import { TowPanel } from "./TowPanel.js";
import { MapSelect } from "./MapSelect.js";
import { LoadDisplay } from "./LoadDisplay.js";
import { QueueStatus } from "./QueueStatus.js";
import { HintCard } from "./HintCard.js";
import { GameControls } from "./GameControls.js";
import { StatusBanner } from "./StatusBanner.js";
import { Minimap } from "./Minimap.js";

const REFRESH_SECONDS = 0.1; // simulation values change per tick; the DOM refreshes at 10 Hz
// The player HUD: a set of independent widgets anchored to the corners of the
// game viewport (CSS, so it follows resizes and is unrelated to world size).
// It reads one HudReadModel snapshot per refresh and hands it to every widget;
// each widget touches the DOM only when its own values change.
export class GameHud {
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.widgets = [];
    applyLayout(root);
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
    const recenter = () => {
      const j = session.level.junctions[0].bounds;
      camera.glideTo(j.x + j.w / 2, j.y + j.h / 2);
    };
    // Reading order: what is happening (load), what am I earning (cash/flow),
    // what needs attention (incidents, queues), what can I do (controls, hint).
    this.widgets = [
      new LoadDisplay(topLeft),
      new QueueStatus(topLeft, first.gates, camera),
      (this.tow = new TowPanel(topLeft, this.actions, camera)), // conditional: last in the column so it can never move a permanent panel
      new CashDisplay(topCenter),
      new GameControls(topRight, this.actions, { onMaps: openMaps, onRecenter: recenter }),
      new Minimap(bottomRight, { level: session.level, camera, gates: this.model.inputGatePoints(), outputs: this.model.outputGatePoints() }),
      new StatusBanner(center, this.actions, openMaps),
      new HintCard(bottomLeft),
    ];
    this.minimap = this.widgets.find((w) => w instanceof Minimap);
    this.snapshot = first;
    this.elapsed = REFRESH_SECONDS;
  }

  clear() {
    for (const w of this.widgets) w.destroy?.();
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
