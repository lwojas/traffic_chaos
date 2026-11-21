import { drawSignalControl, drawRouteHighlight, drawLaneGauge } from "./signalControlSkin.js";
import { UI, Theme, world, signalTokens, riskHex } from "../ui/theme.js";
import { computeSignalControls } from "../view/signalControlLayout.js";
import { buildPath, pointAt } from "../util/geometry.js";
import { RISK_NAMES } from "../util/pressureMath.js";
import { LightState } from "../../components/traffic/SignalGroupComponent.js";

const TURN_WORDS = { straight: "straight on", right: "turning right", left: "turning left", uturn: "U-turn" };
const FLASH_SECONDS = 0.45;

// World-space signal controls. Each control sits at a fixed WORLD position beside
// its stop line, so it moves with the camera because it lives in the world
// layer, not because anything repositions it.
//
//   simulation (SignalGroupComponent.state, streams) --read-->  control appearance
//   pointer press on a control                            --calls-->  onToggle(groupId)
//
// A control is one stream (same id as `StreamSystem` streams), so the queue
// count, risk ring and "x2.4" payout it shows are the simulation's own numbers.
// Hovering a control paints the lane and junction path it governs, so the
// question "what does this button do?" is answered on the road itself.
//
// The layer holds no signal state of its own and never writes to the ECS: the
// only way a control changes the game is the injected onToggle command callback.
// Hit-testing is done in world coordinates (by the viewport input router, via
// pick()), so the same code path works at any camera position.
export class SignalControlLayer {
  constructor({ level, groups, streams, layer, onToggle, isPending = () => false, style = UI.signalControl }) {
    this.style = style;
    this.onToggle = onToggle;
    this.isPending = isPending;
    this.streams = new Map(streams.streams.map((s) => [s.id, s]));
    this.controls = computeSignalControls(level, undefined, style)
      .map((def) => ({
        ...def,
        group: groups.get(def.groupId),
        stream: this.streams.get(def.id),
        flashAt: -10,
        routeViews: def.routes.map((points) => {
          const path = buildPath(points);
          return { points, path, at: (s, out) => pointAt(path, s, out) };
        }),
      }))
      .filter((c) => c.group && c.stream);
    // One gauge per approach lane (streams sharing a lane share its gauge)
    this.lanes = new Map();
    for (const c of this.controls) {
      if (this.lanes.has(c.laneId)) continue;
      const path = buildPath(c.approach);
      const lane = c.stream.lane;
      this.lanes.set(c.laneId, { stopS: lane.stopLineS, slot: lane.length / c.stream.capacity, at: (s, out) => pointAt(path, s, out), streams: [] });
    }
    for (const c of this.controls) this.lanes.get(c.laneId).streams.push(c.stream);

    this.hovered = null;
    this.gaugeGfx = game.add.graphics(0, 0);
    this.routeGfx = game.add.graphics(0, 0);
    this.gfx = game.add.graphics(0, 0);
    layer.add(this.gaugeGfx);
    layer.add(this.routeGfx);
    layer.add(this.gfx);
    this.labels = new Map();
    for (const c of this.controls) {
      const label = game.add.text(0, 0, "", { font: style.label.font, fill: "#ffffff", stroke: "#10131a", strokeThickness: 3 });
      label.anchor.setTo(0.5, 0.5);
      const risk = game.add.text(0, 0, "", { font: style.label.risk, fill: "#ffffff", stroke: "#10131a", strokeThickness: 3 });
      risk.anchor.setTo(0.5, 1);
      layer.add(label);
      layer.add(risk);
      this.labels.set(c, { label, risk });
    }
    this.tip = game.add.text(0, 0, "", { font: style.tooltip.font, fill: "#ffffff", backgroundColor: "#000000", align: "left" });
    this.tip.anchor.setTo(0.5, 1);
    this.tip.visible = false;
    layer.add(this.tip);
    this.themeId = null;
    this.restyleText();
  }

  // Text colours follow the theme (checked each frame; cheap, changes rarely)
  restyleText() {
    this.themeId = Theme.id;
    const w = world();
    const sig = signalTokens();
    for (const { label, risk } of this.labels.values()) {
      label.fill = w.labelText;
      label.stroke = w.labelStroke;
      risk.stroke = w.labelStroke;
    }
    this.tip.fill = sig.tipText;
    this.tip.backgroundColor = sig.tipBackground;
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
    control.flashAt = game.time.now / 1000;
    this.onToggle(control.groupId);
  }

  // Redraws every frame: the controls are few, and the pulse and chevrons animate.
  update() {
    if (this.themeId !== Theme.id) this.restyleText();
    const time = game.time.now / 1000;
    const st = this.style;
    const gauge = this.gaugeGfx;
    gauge.clear();
    for (const lane of this.lanes.values()) {
      const worst = lane.streams.reduce((a, s) => (s.queue > a.queue ? s : a), lane.streams[0]);
      if (worst.queue > 0) drawLaneGauge(gauge, lane, worst.queue * lane.slot, riskHex(worst.risk));
    }

    const h = this.hovered;
    this.routeGfx.clear();
    if (h) {
      const color = world().light[h.group.state];
      for (const route of h.routeViews) drawRouteHighlight(this.routeGfx, route, color, time, st);
    }

    const g = this.gfx;
    g.clear();
    for (const c of this.controls) {
      const s = c.stream;
      const flash = Math.max(0, 1 - (time - c.flashAt) / FLASH_SECONDS);
      drawSignalControl(
        g,
        { x: c.x, y: c.y, heading: c.heading, turns: c.turns, state: c.group.state, hovered: c === h, pending: this.isPending(c.groupId), pressure: s.pressure, risk: s.risk, blocked: s.blocked, time, flash },
        st,
      );
      this.updateLabels(c, s);
    }
    this.updateTooltip(h);
  }

  updateLabels(c, s) {
    const { label, risk } = this.labels.get(c);
    const text = s.queue > 0 ? `${s.queue}` : "";
    if (label.text !== text) label.text = text;
    label.x = c.x;
    label.y = c.y + this.style.size / 2 - 7;
    const warn = s.blocked ? "BLOCKED" : s.risk >= 2 ? RISK_NAMES[s.risk] : "";
    if (risk.text !== warn) {
      risk.text = warn;
      risk.fill = s.risk >= 3 || s.blocked ? world().warnText : world().cashBig;
    }
    risk.x = c.x;
    risk.y = c.y - this.style.size / 2 - this.style.ring - this.style.lift - 14;
  }

  updateTooltip(h) {
    this.tip.visible = !!h;
    if (!h) return;
    const s = h.stream;
    const state = h.group.state;
    const turn = TURN_WORDS[h.turns[0]] ?? h.turns[0];
    const lines = [`${h.direction.toUpperCase()} · ${turn}`, `${s.queue} waiting · ${s.blocked ? "BLOCKED" : RISK_NAMES[s.risk]}`];
    if (s.queue >= 1) lines.push(s.gain > 0 ? `waited ${Math.round(s.waitAvg)}s → release ≈ +${Math.round(s.gain * 100)}%` : s.blocked ? "no recovery while blocked" : `waited ${Math.round(s.waitAvg)}s`);
    lines.push(state === LightState.GREEN || h.group.wantGreen ? "click to HOLD" : "click to RELEASE");
    const text = lines.join("\n");
    if (this.tip.text !== text) this.tip.text = text;
    this.tip.x = h.x;
    this.tip.y = h.y - this.style.size / 2 - this.style.lift - 22;
  }

  destroy() {
    this.gaugeGfx.destroy();
    this.routeGfx.destroy();
    this.gfx.destroy();
    this.tip.destroy();
    for (const { label, risk } of this.labels.values()) {
      label.destroy();
      risk.destroy();
    }
  }
}
