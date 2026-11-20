import { initialiseSpriteLayers, spriteLayers } from "../../system/utils/spriteLayers.js";
import { DebugSystem } from "../../system/DebugSystem.js";
import { VehicleStates } from "../../components/traffic/VehicleStateComponent.js";
import { VehicleTextures } from "./vehicleTextures.js";
import { TrafficDebugView } from "./TrafficDebugView.js";
import { PALETTE, hex } from "./colors.js";
import { pointAt } from "../util/geometry.js";
import { SignalControlLayer } from "./SignalControlLayer.js";
import { TrafficEvents } from "../TrafficEvents.js";
import { UI } from "../ui/theme.js";

const _p = { x: 0, y: 0, angle: 0 };

// Phaser-side view of a TrafficSession. Reads ECS state and draws it; owns no
// simulation state and never writes back into the world. The only way it changes
// the game is the `actions` it is given (signal commands from world controls).
//   camera   ViewCamera: the single source of truth for where the view is. This
//            class only copies it onto the engine camera each frame.
export class TrafficPresentation {
  constructor(session, { debugFlags, camera, actions }) {
    this.session = session;
    this.camera = camera;
    const em = session.entityManager;
    const map = session.level.map;

    initialiseSpriteLayers();
    game.world.setBounds(0, 0, map.width, map.height);
    game.stage.backgroundColor = map.background ?? "#222";
    this.syncCamera();

    this.lanes = em.registerSystem({}, ["LaneComponent"]);
    this.inputGates = em.registerSystem({}, ["InputGateComponent"]);
    this.outputGates = em.registerSystem({}, ["OutputGateComponent"]);
    this.groups = em.registerSystem({}, ["SignalGroupComponent"]);
    this.obstacleSystem = {}; // lists of added/removed entities are replaced on the system object, so read .entities
    this.obstacleSystem.entities = em.registerSystem(this.obstacleSystem, ["ObstacleComponent"]);
    this.vehicleSystem = session.vehicleSystem;
    // Approach lane -> the signal group of the movement it feeds (a stop line shows that group's state)
    this.stopLines = [];
    for (const e of this.lanes) {
      const c = e.components.LaneComponent;
      if (c.kind !== "connector") continue;
      const from = session.entity(c.fromId).getComponent("LaneComponent");
      if (!this.stopLines.some((x) => x.lane === from)) this.stopLines.push({ lane: from, group: c.signalGroup.components.SignalGroupComponent });
    }

    this.drawStatic(session);
    this.lightGfx = game.add.graphics(0, 0);
    spriteLayers.fg3.add(this.lightGfx);
    this.lastLightKey = "";
    this.obstacleGfx = game.add.graphics(0, 0);
    spriteLayers.fg3.add(this.obstacleGfx);

    this.textures = new VehicleTextures();
    this.sprites = new Map(); // vehicle entity -> sprite
    this.pool = [];
    this.frame = 0;

    // World-space UI: lives in the world, so it moves with the camera by itself
    this.worldUi = new SignalControlLayer({
      level: session.level,
      groups: new Map(this.groups.map((e) => [e.id, e.components.SignalGroupComponent])),
      flow: session.flow,
      layer: spriteLayers.fg5,
      onToggle: (groupId) => actions.toggleSignal(groupId),
      isPending: (groupId) => actions.isSignalPending(groupId),
    });

    // Floating payout / event text. Events are only read: nothing here writes to the simulation.
    this.floats = [];
    this.base = session.sim.economy.perVehicle;
    this.towDelay = session.sim.interventions.tow?.delay ?? 3;
    const events = session.events;
    events.on(TrafficEvents.CASH_EARNED, (vehicle, amount) => {
      if (amount <= this.base * 1.3) return; // only released queues are worth a popup
      const p = vehicle.components.Position;
      this.float(`+$${amount}`, p.x, p.y - 14, amount >= this.base * 5 ? UI.world.cashBig : UI.world.cash, amount >= this.base * 5 ? "bold 20px system-ui" : "bold 15px system-ui");
    });
    events.on(TrafficEvents.FLOW_RELEASE, (stream, release, clean) => {
      pointAt(stream.lane.path, stream.lane.stopLineS, _p);
      this.float(clean ? `CLEAN RELEASE  +$${release.paid}` : "POOR RELEASE", _p.x, _p.y - 40, clean ? UI.world.cashBig : "#ff8a8a", "bold 18px system-ui", 2.2);
    });
    events.on(TrafficEvents.FLOW_BROKEN, (reason) => {
      const c = session.level.junctions[0].bounds;
      this.float(reason === "timeout" ? "FLOW FADING" : "FLOW BROKEN", c.x + c.w / 2, c.y - 30, "#ff8a8a", "bold 18px system-ui", 1.6);
    });

    this.debugSystem = new DebugSystem({ testSprite: false });
    this.debugView = new TrafficDebugView(session, this.debugSystem, debugFlags, camera);
    this.pointerBinding = game.input.onDown.add((p) => this.debugView.pick(p.worldX, p.worldY));
  }

  // Viewport size flows engine -> ViewCamera (it resizes with the window); position flows ViewCamera -> engine.
  syncCamera() {
    this.camera.setViewport(game.camera.width, game.camera.height);
    game.camera.x = this.camera.x;
    game.camera.y = this.camera.y;
  }

  drawStatic(session) {
    const level = session.level;
    const g = game.add.graphics(0, 0);
    spriteLayers.bg0.add(g);

    for (const b of level.buildings ?? []) {
      g.beginFill(hex(b.color), 1);
      g.drawRect(b.x, b.y, b.w, b.h);
      g.endFill();
      g.beginFill(0xffffff, 0.08);
      g.drawRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      g.endFill();
    }
    for (const r of level.roads ?? []) {
      g.lineStyle(r.width, PALETTE.road, 1);
      g.moveTo(r.points[0][0], r.points[0][1]);
      for (let i = 1; i < r.points.length; i++) g.lineTo(r.points[i][0], r.points[i][1]);
    }
    g.lineStyle(0);
    for (const j of level.junctions) {
      g.beginFill(PALETTE.junction, 1);
      g.drawRect(j.bounds.x, j.bounds.y, j.bounds.w, j.bounds.h);
      g.endFill();
    }
    // Centre dashes between opposing lanes, stopping short of junctions
    for (const r of level.roads ?? []) this.dashes(g, r.points, level.junctions);
    // Faint divider between the two inbound lanes of each approach
    g.lineStyle(1.5, PALETTE.marking, 0.45);
    for (const e of this.lanes) {
      const lane = e.components.LaneComponent;
      if (lane.kind !== "approach" || lane.index !== 0) continue;
      pointAt(lane.path, 0, _p);
      const nx = -Math.sin(_p.angle) * 10;
      const ny = Math.cos(_p.angle) * 10;
      g.moveTo(lane.points[0][0] + nx, lane.points[0][1] + ny);
      g.lineTo(lane.points[lane.points.length - 1][0] + nx, lane.points[lane.points.length - 1][1] + ny);
    }
    // Stop lines at the end of approach lanes (recoloured by syncLights)
    g.lineStyle(3, PALETTE.stopLine, 1);
    for (const { lane } of this.stopLines) this.line(g, lane, lane.stopLineS, 17);
    // Gates: a green chevron where traffic enters, a red bar where it leaves
    for (const e of this.inputGates) {
      for (const laneEntity of e.components.InputGateComponent.lanes) {
        const lane = laneEntity.components.LaneComponent;
        pointAt(lane.path, 8, _p);
        g.beginFill(PALETTE.inputGate, 1);
        g.drawCircle(_p.x, _p.y, 12);
        g.endFill();
      }
    }
    g.lineStyle(5, PALETTE.outputGate, 1);
    for (const e of this.outputGates) {
      const lane = e.components.OutputGateComponent.lane.components.LaneComponent;
      this.line(g, lane, lane.length - 3, 17);
    }
    this.staticGfx = g;
  }

  dashes(g, pts, junctions) {
    g.lineStyle(2, PALETTE.marking, 0.8);
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[pts.length - 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    for (let d = 0; d < len; d += 36) {
      const ax = x0 + dx * d;
      const ay = y0 + dy * d;
      const bx = x0 + dx * Math.min(d + 18, len);
      const by = y0 + dy * Math.min(d + 18, len);
      const inside = junctions.some((j) => ax > j.bounds.x - 4 && ax < j.bounds.x + j.bounds.w + 4 && ay > j.bounds.y - 4 && ay < j.bounds.y + j.bounds.h + 4);
      if (inside) continue;
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
    }
  }

  float(text, x, y, fill, font, life = 1.4) {
    const t = game.add.text(x, y, text, { font, fill, stroke: "#10131a", strokeThickness: 4 });
    t.anchor.setTo(0.5, 1);
    spriteLayers.fg5.add(t);
    this.floats.push({ t, y0: y, born: game.time.now, life: life * 1000 });
  }

  syncFloats() {
    const now = game.time.now;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      const k = (now - f.born) / f.life;
      if (k >= 1) {
        f.t.destroy();
        this.floats.splice(i, 1);
      } else {
        f.t.y = f.y0 - k * 36;
        f.t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      }
    }
  }

  update() {
    this.syncCamera();
    this.syncFloats();
    this.worldUi.update();
    this.syncLights();
    this.syncVehicles();
    this.syncObstacles();
    this.debugView.update();
  }

  // A line across a lane at path distance s, `half` px either side of the centre.
  line(g, lane, s, half) {
    pointAt(lane.path, s, _p);
    const nx = -Math.sin(_p.angle) * half;
    const ny = Math.cos(_p.angle) * half;
    g.moveTo(_p.x - nx, _p.y - ny);
    g.lineTo(_p.x + nx, _p.y + ny);
  }

  // Stop-line stripes take the signal group's colour so each stream reads at a glance
  syncLights() {
    let key = "";
    for (const e of this.groups) key += e.components.SignalGroupComponent.state;
    if (key === this.lastLightKey) return;
    this.lastLightKey = key;
    const g = this.lightGfx;
    g.clear();
    for (const { lane, group } of this.stopLines) {
      g.lineStyle(5, PALETTE.light[group.state], 1);
      this.line(g, lane, lane.stopLineS, 17);
    }
  }

  // Active obstacles: a pulsing hazard bar across every blocked lane or movement,
  // and a ring around each disabled vehicle. Few of these exist at once.
  syncObstacles() {
    const g = this.obstacleGfx;
    g.clear();
    const obstacles = this.obstacleSystem.entities;
    if (obstacles.length === 0) return;
    const pulse = 0.55 + 0.35 * Math.sin(this.frame * 0.2);
    for (const e of obstacles) {
      const o = e.components.ObstacleComponent;
      if (!o.active) continue;
      g.lineStyle(6, PALETTE.hazard, pulse);
      for (const b of o.blocks) this.line(g, b.lane.components.LaneComponent, b.rear, 11);
      g.lineStyle(2, o.towed ? UI.world.tow : PALETTE.hazard, pulse);
      for (const v of o.vehicles) {
        const p = v.components.Position;
        g.drawCircle(p.x, p.y, 44);
        if (o.towed) {
          // Tow truck on its way: a yellow bar that shrinks as the wreck clears
          g.lineStyle(4, UI.world.tow, 1);
          g.moveTo(p.x - 22, p.y - 30);
          g.lineTo(p.x - 22 + 44 * Math.min(1, o.remaining / this.towDelay), p.y - 30);
        }
      }
    }
  }

  syncVehicles() {
    const frame = ++this.frame;
    const vehicles = this.vehicleSystem.entities;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const vs = v.components.VehicleStateComponent;
      const vc = v.components.VehicleComponent;
      const pos = v.components.Position;
      let entry = this.sprites.get(v);
      if (!entry) {
        const sprite = this.pool.pop() ?? spriteLayers.fg2.create(0, 0, this.textures.get(vc, 0));
        sprite.revive();
        sprite.anchor.setTo(0.5, 0.5);
        entry = { sprite, mode: -1, frame }; // -1 forces a texture load below
        this.sprites.set(v, entry);
      }
      entry.frame = frame;
      const mode = vs.disabled ? 2 : vs.braking || (vs.speed < 0.5 && vs.segment.components.LaneComponent.kind === "approach") ? 1 : 0;
      if (mode !== entry.mode) {
        entry.mode = mode;
        entry.sprite.loadTexture(this.textures.get(vc, mode));
      }
      entry.sprite.x = pos.x;
      entry.sprite.y = pos.y;
      entry.sprite.rotation = vs.angle;
    }
    if (this.sprites.size !== vehicles.length) {
      for (const [v, entry] of this.sprites) {
        if (entry.frame === frame) continue;
        entry.sprite.kill();
        this.pool.push(entry.sprite);
        this.sprites.delete(v);
        if (this.debugView.selected === v) this.debugView.selected = null;
      }
    }
  }

  destroy() {
    this.pointerBinding.detach();
    this.worldUi.destroy();
    for (const f of this.floats) f.t.destroy();
    this.textures.destroy();
    game.world.removeAll(true);
  }
}
