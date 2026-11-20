import { pointAt } from "../util/geometry.js";
import { LightState } from "../../components/traffic/SignalGroupComponent.js";

export const DEBUG_LAYERS = ["lanes", "movements", "stopLines", "decision", "junctions", "conflicts", "gates", "signals", "obstacles", "vehicles", "routes", "queues"];

const _p = { x: 0, y: 0, angle: 0 };
const STATE_NAMES = ["driving", "approaching", "slowing", "stopped", "entering", "crossing", "exiting", "crashed"];
const LIGHT_CSS = ["#e5484d", "#f2c744", "#46c46a"];

// Debug overlay drawn into the engine's DebugSystem bitmap. Reads ECS state only.
export class TrafficDebugView {
  constructor(session, debugSystem, flags) {
    this.session = session;
    this.debugSystem = debugSystem;
    this.flags = flags;
    this.selected = null;
    const em = session.entityManager;
    this.lanes = em.registerSystem({}, ["LaneComponent"]);
    this.junctions = em.registerSystem({}, ["JunctionComponent"]);
    this.inputs = em.registerSystem({}, ["InputGateComponent"]);
    this.outputs = em.registerSystem({}, ["OutputGateComponent"]);
    this.groups = em.registerSystem({}, ["SignalGroupComponent"]);
    this.obstacleSystem = {}; // the entity manager replaces .entities as obstacles come and go
    this.obstacleSystem.entities = em.registerSystem(this.obstacleSystem, ["ObstacleComponent"]);
  }

  update() {
    const ds = this.debugSystem;
    ds.update(); // clears
    if (!this.flags.enabled) return (ds.debugData.dirty = true);
    const ctx = ds.debugData.ctx;
    const on = this.flags.layers;
    ctx.lineJoin = "round";
    ctx.font = "11px monospace";

    for (const e of this.lanes) {
      const lane = e.components.LaneComponent;
      if (lane.kind === "connector") {
        if (on.movements) this.drawMovement(ctx, lane);
        continue;
      }
      if (on.lanes) {
        this.poly(ctx, lane.points, lane.kind === "exit" ? "#4bd37b" : "#35c5e8", 1.5);
        pointAt(lane.path, lane.length * 0.5, _p);
        ctx.fillStyle = lane.blockers.length ? "#ff8a1f" : "#9ad7ff";
        ctx.fillText(lane.levelId, _p.x + 6, _p.y - 4);
      }
      if (lane.kind !== "approach") continue;
      if (on.decision) {
        const a = pointAt(lane.path, Math.max(0, lane.stopLineS - lane.decisionDistance), { x: 0, y: 0, angle: 0 });
        const b = pointAt(lane.path, lane.stopLineS, _p);
        ctx.strokeStyle = "rgba(255,220,60,0.22)";
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (on.stopLines) {
        pointAt(lane.path, lane.stopLineS, _p);
        const nx = -Math.sin(_p.angle) * 20;
        const ny = Math.cos(_p.angle) * 20;
        ctx.strokeStyle = "#ff4060";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(_p.x - nx, _p.y - ny);
        ctx.lineTo(_p.x + nx, _p.y + ny);
        ctx.stroke();
      }
      if (on.queues) {
        pointAt(lane.path, lane.stopLineS - 50, _p);
        ctx.fillStyle = lane.queueLength > 0 ? "#ffd24a" : "#7a8190";
        ctx.fillText(`q=${lane.queueLength}`, _p.x + 12, _p.y);
      }
    }

    for (const e of this.junctions) {
      const j = e.components.JunctionComponent;
      const b = j.bounds;
      if (on.conflicts) for (const z of j.zones) this.drawZone(ctx, z);
      if (on.junctions) {
        if (j.blocked) {
          ctx.fillStyle = "rgba(255,40,60,0.35)";
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        ctx.strokeStyle = j.blocked ? "#ff3050" : "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${j.levelId} occ=${j.occupants}${j.blocked ? " BLOCKED" : ""}`, b.x - 20, b.y - 6);
      }
    }
    if (on.gates) this.drawGates(ctx);
    if (on.signals) this.drawSignals(ctx);
    if (on.obstacles) this.drawObstacles(ctx);
    if (on.vehicles) this.drawVehicleLabels(ctx);
    if (on.routes && this.selected && this.selected.components.VehicleStateComponent) this.drawRoute(ctx, this.selected);
    ds.debugData.dirty = true;
  }

  drawMovement(ctx, lane) {
    const group = lane.signalGroup.components.SignalGroupComponent;
    this.poly(ctx, lane.points, lane.blockers.length ? "#ff8a1f" : LIGHT_CSS[group.state], lane.vehicles.length ? 3 : 1.2);
    if (this.flags.layers.lanes) {
      pointAt(lane.path, lane.length * 0.5, _p);
      ctx.fillStyle = "#c9a8ff";
      ctx.fillText(lane.levelId.replace("mv_", ""), _p.x + 4, _p.y + 12);
    }
  }

  // Both sides of a conflict zone; bright red while both are occupied (the moment of an incident).
  drawZone(ctx, z) {
    const live = z.occupied.a && z.occupied.b;
    for (const side of [z.a, z.b]) {
      const lane = side.lane.components.LaneComponent;
      const hot = z.occupied[side === z.a ? "a" : "b"];
      ctx.strokeStyle = live ? "#ff2040" : hot ? "#ffb020" : z.kind === "merge" ? "rgba(255,120,220,0.55)" : "rgba(255,90,90,0.5)";
      ctx.lineWidth = 9;
      ctx.beginPath();
      for (let s = side.s0, first = true; s <= side.s1 + 0.1; s += 2, first = false) {
        pointAt(lane.path, Math.min(s, lane.length), _p);
        if (first) ctx.moveTo(_p.x, _p.y);
        else ctx.lineTo(_p.x, _p.y);
      }
      ctx.stroke();
    }
  }

  drawGates(ctx) {
    let row = 0;
    for (const e of this.inputs) {
      const g = e.components.InputGateComponent;
      const lane = g.lanes[0].components.LaneComponent;
      const full = g.queue.length >= g.queueCapacity;
      pointAt(lane.path, 30, _p);
      const x = Math.min(Math.max(_p.x + 14, 4), 1100);
      const y = Math.min(Math.max(_p.y - 6, 14), 700);
      ctx.fillStyle = full ? "#ff4060" : "#46c46a";
      ctx.fillText(`${g.label} ${this.bar(g.queue.length, g.queueCapacity)} ${g.queue.length}/${g.queueCapacity}  ${g.rate.toFixed(2)}/s${g.overflow ? " lost " + g.overflow : ""}`, x, y);
      row++;
    }
    for (const e of this.outputs) {
      const g = e.components.OutputGateComponent;
      const lane = g.lane.components.LaneComponent;
      pointAt(lane.path, lane.length - 30, _p);
      ctx.fillStyle = "#ff9a9a";
      ctx.fillText(`${g.label} ${g.throughput}`, Math.min(Math.max(_p.x + 14, 4), 1100), Math.min(Math.max(_p.y + 14, 14), 700));
    }
  }

  bar(n, max, width = 10) {
    const fill = Math.min(width, Math.round((n / max) * width));
    return "█".repeat(fill) + "░".repeat(width - fill);
  }

  drawSignals(ctx) {
    let i = 0;
    for (const e of this.groups) {
      const g = e.components.SignalGroupComponent;
      const j = this.session.entity(g.junctionId).getComponent("JunctionComponent").bounds;
      ctx.fillStyle = LIGHT_CSS[g.state];
      ctx.fillText(`${g.label} ${["RED", "YELLOW", "GREEN"][g.state]} ${g.timeInState.toFixed(1)}s`, j.x - 60, j.y + j.h + 18 + i * 13);
      i++;
    }
  }

  drawObstacles(ctx) {
    for (const e of this.obstacleSystem.entities) {
      const o = e.components.ObstacleComponent;
      for (const b of o.blocks) {
        const lane = b.lane.components.LaneComponent;
        pointAt(lane.path, Math.min(b.rear, lane.length), _p);
        const nx = -Math.sin(_p.angle) * 12;
        const ny = Math.cos(_p.angle) * 12;
        ctx.strokeStyle = "#ff8a1f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(_p.x - nx, _p.y - ny);
        ctx.lineTo(_p.x + nx, _p.y + ny);
        ctx.stroke();
        ctx.fillStyle = "#ffb060";
        ctx.fillText(`${o.kind} ${Math.max(0, o.remaining).toFixed(1)}s`, _p.x + 6, _p.y - 6);
      }
    }
  }

  drawVehicleLabels(ctx) {
    ctx.fillStyle = "#e8e8e8";
    for (const v of this.session.vehicles()) {
      const p = v.components.Position;
      const vs = v.components.VehicleStateComponent;
      const steps = vs.route.components.RouteComponent.steps;
      const move = steps[1].id.replace("mv_", "");
      ctx.fillText(`${move} ${STATE_NAMES[vs.state][0]}`, p.x + 12, p.y - 10);
    }
  }

  drawRoute(ctx, vehicle) {
    const vs = vehicle.components.VehicleStateComponent;
    const steps = vs.route.components.RouteComponent.steps;
    for (let i = vs.routeIndex; i < steps.length; i++) this.poly(ctx, steps[i].components.LaneComponent.points, "#ffffff", 3);
    const pos = vehicle.components.Position;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pos.x - 22, pos.y - 22, 44, 44);
    const vc = vehicle.components.VehicleComponent;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${vehicle.id} ${vc.typeId} ${STATE_NAMES[vs.state]} on ${vs.segment.id} v=${vs.speed.toFixed(0)} wait=${vs.waitTime.toFixed(1)}s patience=${vs.blockedAtLine.toFixed(1)}/${vc.patience}`, pos.x + 26, pos.y - 24);
  }

  poly(ctx, pts, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  pick(x, y) {
    let best = null;
    let bestD = 40;
    for (const v of this.session.vehicles()) {
      const p = v.components.Position;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    this.selected = best;
  }
}
