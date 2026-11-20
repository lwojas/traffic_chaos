import { drawSignalControl } from "./signalControlSkin.js";
import { UI } from "../ui/theme.js";
import { computeSignalControls } from "../view/signalControlLayout.js";

const STATE_NAMES = ["RED", "YELLOW", "GREEN"];

// World-space signal controls. Each control sits at a fixed WORLD position beside
// its stop line, so it moves with the camera because it lives in the world
// layer, not because anything repositions it.
//
//   simulation (SignalGroupComponent.state)  --read-->  control appearance
//   pointer press on a control               --calls-->  onToggle(groupId)
//
// The layer holds no signal state of its own and never writes to the ECS: the
// only way a control changes the game is the injected onToggle command callback.
// Hit-testing is done in world coordinates (by the viewport input router, via
// pick()), so the same code path works at any camera position.
export class SignalControlLayer {
  constructor({ level, groups, layer, onToggle, isPending = () => false, style = UI.signalControl }) {
    this.style = style;
    this.onToggle = onToggle;
    this.isPending = isPending;
    this.controls = computeSignalControls(level, undefined, style).map((def) => ({ ...def, group: groups.get(def.groupId) }));
    this.controls = this.controls.filter((c) => c.group);
    this.hovered = null;
    this.key = "";
    this.gfx = game.add.graphics(0, 0);
    layer.add(this.gfx);
    this.tip = game.add.text(0, 0, "", { font: style.tooltip.font, fill: "#ffffff", backgroundColor: "rgba(10,12,16,0.88)" });
    this.tip.anchor.setTo(0.5, 1);
    this.tip.visible = false;
    layer.add(this.tip);
  }

  // Control under a world point, or null. Top-most (last drawn) wins.
  pick(wx, wy) {
    const r = this.style.size / 2 + this.style.hitPadding;
    for (let i = this.controls.length - 1; i >= 0; i--) {
      const c = this.controls[i];
      if (Math.abs(wx - c.x) <= r && Math.abs(wy - c.y) <= r) return c;
    }
    return null;
  }

  setHover(control) {
    this.hovered = control;
  }

  activate(control) {
    this.onToggle(control.groupId);
  }

  // Redraws only when something visible changed.
  update() {
    let key = this.hovered ? this.hovered.id : "-";
    for (const c of this.controls) key += c.group.state + (this.isPending(c.groupId) ? "p" : "");
    if (key === this.key) return;
    this.key = key;
    const g = this.gfx;
    g.clear();
    for (const c of this.controls) {
      drawSignalControl(g, { x: c.x, y: c.y, heading: c.heading, turns: c.turns, state: c.group.state, hovered: c === this.hovered, pending: this.isPending(c.groupId) }, this.style);
    }
    const h = this.hovered;
    this.tip.visible = !!h;
    if (h) {
      this.tip.text = `${h.label}  ${STATE_NAMES[h.group.state]}`;
      this.tip.x = h.x;
      this.tip.y = h.y - this.style.size / 2 - 8;
    }
  }

  // Hover tooltip also tracks the time in state; cheap enough to refresh each frame it is visible
  refreshTooltip() {
    const h = this.hovered;
    if (!h) return;
    this.tip.text = `${h.label}  ${STATE_NAMES[h.group.state]} ${h.group.timeInState.toFixed(0)}s`;
  }

  destroy() {
    this.gfx.destroy();
    this.tip.destroy();
  }
}
