import { initialiseSpriteLayers, spriteLayers } from "../../system/utils/spriteLayers.js";
import { DebugSystem } from "../../system/DebugSystem.js";
import { VehicleStates } from "../../components/traffic/VehicleStateComponent.js";
import { VehicleTextures } from "./vehicleTextures.js";
import { TrafficDebugView } from "./TrafficDebugView.js";
import { pointAt } from "../util/geometry.js";
import { SignalControlLayer } from "./SignalControlLayer.js";
import { TrafficEvents } from "../TrafficEvents.js";
import { UI, Theme, world } from "../ui/theme.js";
import { toCss } from "../ui/themes.js";

const ROADWORKS_YELLOW = 0xffc400; // fixed across themes: roadworks signage is recognisable by its stripes, not the theme
const ROADWORKS_DARK = 0x262626;
const ROADWORKS_CONE = 0xff6a1a;
const LANE_HALF = 10; // lanes are 20px apart, so a stop line spans exactly its own lane

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
    game.camera.bounds = null; // ViewCamera owns clamping, and centres a world smaller than the screen
    game.stage.backgroundColor = toCss(world().ground);
    this.syncCamera();

    this.lanes = em.registerSystem({}, ["LaneComponent"]);
    this.inputGates = em.registerSystem({}, ["InputGateComponent"]);
    this.outputGates = em.registerSystem({}, ["OutputGateComponent"]);
    this.groups = em.registerSystem({}, ["SignalGroupComponent"]);
    this.obstacleSystem = {}; // lists of added/removed entities are replaced on the system object, so read .entities
    this.obstacleSystem.entities = em.registerSystem(this.obstacleSystem, ["ObstacleComponent"]);
    this.vehicleSystem = session.vehicleSystem;
    // Approach lane -> the signal group of each movement it feeds. A stop line shows every group:
    // one stripe when they agree on a group, otherwise split left / straight / right across the lane.
    this.stopLines = [];
    const order = { left: 0, straight: 1, right: 2 };
    for (const e of this.lanes) {
      const c = e.components.LaneComponent;
      if (c.kind !== "connector") continue;
      const from = session.entity(c.fromId).getComponent("LaneComponent");
      let sl = this.stopLines.find((x) => x.lane === from);
      if (!sl) this.stopLines.push((sl = { lane: from, parts: [] }));
      sl.parts.push({ turn: c.turn ?? "straight", group: c.signalGroup.components.SignalGroupComponent });
    }
    for (const sl of this.stopLines) {
      sl.parts.sort((a, b) => order[a.turn] - order[b.turn]);
      const groups = new Set(sl.parts.map((p) => p.group));
      if (groups.size === 1) sl.parts = [{ turn: "all", group: sl.parts[0].group }];
      // Equal slices of the lane, left edge (-HALF) to right edge (+HALF)
      sl.parts.forEach((p, i) => {
        p.from = -LANE_HALF + (2 * LANE_HALF * i) / sl.parts.length;
        p.to = -LANE_HALF + (2 * LANE_HALF * (i + 1)) / sl.parts.length;
      });
    }

    this.drawStatic(session);
    this.lightGfx = game.add.graphics(0, 0);
    spriteLayers.fg3.add(this.lightGfx);
    this.lastLightKey = "";
    this.obstacleGfx = game.add.graphics(0, 0);
    spriteLayers.fg3.add(this.obstacleGfx);

    this.textures = new VehicleTextures();
    this.themeDirty = false;
    this.themeBinding = Theme.onChange(() => (this.themeDirty = true)); // restyled at the start of the next frame
    this.sprites = new Map(); // vehicle entity -> sprite
    this.pool = [];
    this.frame = 0;

    // World-space UI: lives in the world, so it moves with the camera by itself
    this.worldUi = new SignalControlLayer({
      level: session.level,
      groups: new Map(this.groups.map((e) => [e.id, e.components.SignalGroupComponent])),
      streams: session.streams,
      diversions: session.diversions,
      layer: spriteLayers.fg5,
      onToggle: (groupId) => actions.toggleSignal(groupId),
      onDivert: (streamId) => actions.toggleDiversion(streamId),
      isPending: (groupId, streamId) => actions.isSignalPending(groupId) || actions.isDiversionPending(streamId),
    });

    this.towDelay = session.sim.interventions.tow?.delay ?? 3;
    this.crewDelay = session.sim.interventions.crew?.delay ?? 4;

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

  // The static world: ground pattern, buildings, roads, markings, gates. Painted
  // from the active theme's world tokens; rebuilt when the theme changes.
  drawStatic(session) {
    const level = session.level;
    const w = world();
    const g = game.add.graphics(0, 0);
    spriteLayers.bg0.add(g);
    this.staticObjs = [g];
    const map = level.map;

    // Ground pattern: paper dots (Day/Night) or a circuit grid (Cyberpunk). It
    // runs past the map edge so a map smaller than the screen sits on the table.
    const M = 640;
    if (w.pattern === "dots") {
      g.beginFill(w.patternColor, w.patternAlpha);
      for (let x = -M + 16; x < map.width + M; x += 32) for (let y = -M + 16; y < map.height + M; y += 32) g.drawCircle(x, y, 2.4);
      g.endFill();
    } else if (w.pattern === "grid") {
      g.lineStyle(1, w.patternColor, w.patternAlpha);
      for (let x = -M; x <= map.width + M; x += 40) {
        g.moveTo(x, -M);
        g.lineTo(x, map.height + M);
      }
      for (let y = -M; y <= map.height + M; y += 40) {
        g.moveTo(-M, y);
        g.lineTo(map.width + M, y);
      }
      g.lineStyle(0);
    }
    // The playable board: a faint edge so it reads as the map, not an empty screen
    g.lineStyle(2, w.buildingEdge, 0.6);
    g.drawRect(0, 0, map.width, map.height);
    g.lineStyle(0);

    // Buildings: tabletop blocks. The theme sets their colour, not the level.
    for (const b of level.buildings ?? []) {
      if (w.buildingShadowAlpha > 0) {
        g.beginFill(w.buildingShadow, w.buildingShadowAlpha);
        g.drawRect(b.x + 2, b.y + 6, b.w, b.h);
        g.endFill();
      }
      g.lineStyle(1.5, w.buildingEdge, w.buildingEdgeAlpha);
      g.beginFill(w.building, 1);
      g.drawRect(b.x, b.y, b.w, b.h);
      g.endFill();
      g.lineStyle(0);
      g.beginFill(w.buildingTop, 1);
      g.drawRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      g.endFill();
    }
    // Roads: edge first (a wider stroke underneath), then the surface, then junction boxes
    for (const r of level.roads ?? []) {
      g.lineStyle(r.width + w.roadEdgeWidth * 2, w.roadEdge, w.roadEdgeAlpha);
      g.moveTo(r.points[0][0], r.points[0][1]);
      for (let i = 1; i < r.points.length; i++) g.lineTo(r.points[i][0], r.points[i][1]);
    }
    for (const r of level.roads ?? []) {
      g.lineStyle(r.width, w.road, 1);
      g.moveTo(r.points[0][0], r.points[0][1]);
      for (let i = 1; i < r.points.length; i++) g.lineTo(r.points[i][0], r.points[i][1]);
    }
    g.lineStyle(0);
    for (const j of level.junctions) {
      g.beginFill(w.junction, 1);
      g.drawRect(j.bounds.x, j.bounds.y, j.bounds.w, j.bounds.h);
      g.endFill();
    }
    // Centre dashes between opposing lanes, stopping short of junctions
    for (const r of level.roads ?? []) this.dashes(g, r.points, level.junctions);
    // Divider between the two inbound lanes of each approach: short, tight dashes,
    // distinct from the longer centre-line dashes
    g.lineStyle(1.5, w.laneDivider, 0.7);
    const q = { x: 0, y: 0, angle: 0 };
    for (const e of this.lanes) {
      const lane = e.components.LaneComponent;
      if (lane.kind !== "approach" || lane.index !== 0) continue;
      for (let d = 0; d < lane.length; d += 12) {
        const end = Math.min(d + 5, lane.length);
        pointAt(lane.path, d, _p);
        pointAt(lane.path, end, q);
        g.moveTo(_p.x - Math.sin(_p.angle) * 10, _p.y + Math.cos(_p.angle) * 10);
        g.lineTo(q.x - Math.sin(q.angle) * 10, q.y + Math.cos(q.angle) * 10);
      }
    }
    // Stop lines at the end of approach lanes (recoloured by syncLights)
    g.lineStyle(3, w.stopLine, 1);
    for (const { lane } of this.stopLines) this.line(g, lane, lane.stopLineS, LANE_HALF);
    // Gates: a disc where traffic enters, a bar where it leaves
    for (const e of this.inputGates) {
      for (const laneEntity of e.components.InputGateComponent.lanes) {
        const lane = laneEntity.components.LaneComponent;
        pointAt(lane.path, 8, _p);
        g.lineStyle(w.lightGlow > 0 ? 3 : 0, w.inputGate, 0.35);
        g.beginFill(w.inputGate, 1);
        g.drawCircle(_p.x, _p.y, 12);
        g.endFill();
      }
    }
    g.lineStyle(5, w.outputGate, 1);
    for (const e of this.outputGates) {
      const lane = e.components.OutputGateComponent.lane.components.LaneComponent;
      this.line(g, lane, lane.length - 3, LANE_HALF);
    }
    g.lineStyle(0);
    for (const r of level.roads ?? []) if (r.name) this.roadName(r);
    this.staticGfx = g;
  }

  // Street name set beside the road, along its direction, like a map label.
  // Placed on the upper/left side, a little in from the road's start, text kept upright.
  roadName(r) {
    const [x0, y0] = r.points[0];
    const [x1, y1] = r.points[r.points.length - 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return;
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    let angle = Math.atan2(dy, dx);
    if (Math.cos(angle) < -1e-6 || (Math.abs(Math.cos(angle)) < 1e-6 && angle > 0)) angle += Math.PI; // upright; vertical reads bottom-to-top
    let nx = -dy;
    let ny = dx;
    if (ny > 1e-6 || (Math.abs(ny) < 1e-6 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    const along = Math.min(150, len * 0.25);
    const off = r.width / 2 + 16;
    const w = world();
    const t = game.add.text(x0 + dx * along + nx * off, y0 + dy * along + ny * off, r.name.toUpperCase(), { font: "700 11px 'Space Grotesk', system-ui", fill: w.labelText });
    t.anchor.setTo(0.5, 0.5);
    t.alpha = 0.6;
    t.rotation = angle;
    spriteLayers.bg0.add(t);
    this.staticObjs.push(t);
  }

  // Theme changed: swap the ground, repaint the static layer, rebuild car textures
  restyle() {
    this.themeDirty = false;
    game.stage.backgroundColor = toCss(world().ground);
    for (const o of this.staticObjs) o.destroy();
    this.drawStatic(this.session);
    this.lastLightKey = ""; // stop-line colours
    this.textures.destroy();
    this.textures = new VehicleTextures();
    for (const entry of this.sprites.values()) entry.mode = -1; // reload every car's texture
  }

  dashes(g, pts, junctions) {
    const w = world();
    g.lineStyle(2, w.marking, w.markingAlpha);
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

  update() {
    if (this.themeDirty) this.restyle();
    this.syncCamera();
    this.worldUi.update();
    this.syncLights();
    this.syncVehicles();
    this.syncObstacles();
    this.debugView.update();
  }

  // A line across a lane at path distance s, `half` px either side of the centre.
  line(g, lane, s, half) {
    this.span(g, lane, s, -half, half);
  }

  // The part of that line between lateral offsets from..to (negative = left of travel).
  span(g, lane, s, from, to) {
    pointAt(lane.path, s, _p);
    const nx = -Math.sin(_p.angle);
    const ny = Math.cos(_p.angle);
    g.moveTo(_p.x + nx * from, _p.y + ny * from);
    g.lineTo(_p.x + nx * to, _p.y + ny * to);
  }

  // Stop-line stripes take the signal group's colour so each stream reads at a glance
  syncLights() {
    let key = "";
    for (const e of this.groups) key += e.components.SignalGroupComponent.state;
    if (key === this.lastLightKey) return;
    this.lastLightKey = key;
    const g = this.lightGfx;
    g.clear();
    const w = world();
    for (const { lane, parts } of this.stopLines) {
      for (const { group, from, to } of parts) {
        const color = w.light[group.state];
        if (w.lightGlow > 0) {
          // Emissive: a wide soft stripe under the line reads as light on the road
          g.lineStyle(14, color, w.lightGlow * 0.35);
          this.span(g, lane, lane.stopLineS, from, to);
          g.lineStyle(9, color, w.lightGlow * 0.5);
          this.span(g, lane, lane.stopLineS, from, to);
        }
        g.lineStyle(5, color, 1);
        this.span(g, lane, lane.stopLineS, from, to);
      }
    }
  }

  // Roadworks barrier: alternating yellow / black bars across the lane, a cone at each end.
  barrier(g, lane, s) {
    const n = 4;
    const w = (2 * LANE_HALF) / n;
    for (let i = 0; i < n; i++) {
      g.lineStyle(7, i % 2 ? ROADWORKS_DARK : ROADWORKS_YELLOW, 1);
      this.span(g, lane, s, -LANE_HALF + i * w, -LANE_HALF + (i + 1) * w);
    }
    g.lineStyle(0);
    g.beginFill(ROADWORKS_CONE, 1);
    for (const side of [-LANE_HALF, LANE_HALF]) {
      pointAt(lane.path, s, _p);
      g.drawCircle(_p.x - Math.sin(_p.angle) * side, _p.y + Math.cos(_p.angle) * side, 3.5);
    }
    g.endFill();
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
      if (o.kind === "roadworks") {
        // Roadworks (a burst pipe): a still striped barrier with a cone at each end. Nothing pulses and there is no ring, so it never reads as a crash
        for (const b of o.blocks) {
          const lane = b.lane.components.LaneComponent;
          this.barrier(g, lane, b.rear);
          if (o.towed) {
            // Road crew on its way: a yellow bar over the barrier that shrinks as the works clear
            g.lineStyle(4, world().tow, 1);
            this.span(g, lane, b.rear - 8, -LANE_HALF, -LANE_HALF + 2 * LANE_HALF * Math.min(1, o.remaining / this.crewDelay));
          }
        }
        continue;
      }
      g.lineStyle(6, world().hazard, pulse);
      for (const b of o.blocks) this.line(g, b.lane.components.LaneComponent, b.rear, 11);
      g.lineStyle(2, o.towed ? world().tow : world().hazard, pulse);
      for (const v of o.vehicles) {
        const p = v.components.Position;
        g.drawCircle(p.x, p.y, 44);
        if (o.towed) {
          // Tow truck on its way: a yellow bar that shrinks as the wreck clears
          g.lineStyle(4, world().tow, 1);
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
        if (!sprite.fx) sprite.fx = sprite.addChild(game.make.sprite(0, 0)); // headlight beam / neon trail, set per theme
        entry = { sprite, mode: -1, frame }; // -1 forces a texture load below
        this.sprites.set(v, entry);
      }
      entry.frame = frame;
      const mode = vs.disabled ? 2 : vs.braking || (vs.speed < 0.5 && vs.segment.components.LaneComponent.kind === "approach") ? 1 : 0;
      if (mode !== entry.mode) {
        entry.mode = mode;
        entry.sprite.loadTexture(this.textures.get(vc, mode));
        const fx = this.textures.fx(vc, mode);
        entry.sprite.fx.visible = !!fx;
        if (fx) {
          entry.sprite.fx.loadTexture(fx.bmd);
          entry.sprite.fx.anchor.setTo(fx.anchorX, 0.5);
          entry.sprite.fx.x = fx.x;
        }
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
    this.themeBinding();
    this.worldUi.destroy();
    this.textures.destroy();
    game.world.removeAll(true);
  }
}
