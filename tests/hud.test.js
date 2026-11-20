import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSignalControls, DEFAULT_PLACEMENT } from "../scripts/traffic/view/signalControlLayout.js";
import { HudReadModel } from "../scripts/traffic/view/HudReadModel.js";
import { level01, level02, quietSession, spawnVehicle, car, runUntil, gameConfig, clone, setGroups, GROUPS } from "./helpers/fixtures.js";
import { TrafficSession } from "../scripts/traffic/session/TrafficSession.js";

const distToRoad = (road, x, y) => {
  const [[ax, ay], [bx, by]] = road.points;
  const dx = bx - ax, dy = by - ay;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
};

for (const [name, level] of [["network_01", level01], ["network_02", level02]]) {
  test(`${name}: one signal control per signal group and approach lane, none overlapping`, () => {
    const controls = computeSignalControls(level);
    const pairs = new Set();
    for (const j of level.junctions) for (const m of j.movements) pairs.add(`${m.signalGroup}@${m.from}`);
    assert.deepEqual(new Set(controls.map((c) => c.id)), pairs);
    assert.equal(new Set(controls.map((c) => c.id)).size, controls.length, "ids are unique");
    const { size } = DEFAULT_PLACEMENT;
    for (let i = 0; i < controls.length; i++) {
      for (let k = i + 1; k < controls.length; k++) {
        const a = controls[i], b = controls[k];
        assert.ok(Math.abs(a.x - b.x) >= size - 0.5 || Math.abs(a.y - b.y) >= size - 0.5, `${a.id} overlaps ${b.id}`);
      }
    }
  });

  test(`${name}: controls sit beside the road, inside the map, and never on the carriageway`, () => {
    const roads = new Map(level.roads.map((r) => [r.id, r]));
    for (const c of computeSignalControls(level)) {
      assert.ok(c.x > 0 && c.y > 0 && c.x < level.map.width && c.y < level.map.height, `${c.id} inside the map`);
      const lane = level.lanes.find((l) => l.id === c.laneId);
      const road = roads.get(lane.road);
      assert.ok(distToRoad(road, c.x, c.y) >= road.width / 2 + DEFAULT_PLACEMENT.size / 2, `${c.id} is clear of the road`);
      for (const b of level.buildings ?? []) {
        const inside = c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h;
        assert.ok(!inside, `${c.id} is not buried in building ${b.id}`);
      }
    }
  });
}

test("controls are placed in world coordinates: independent of any camera", () => {
  assert.deepEqual(computeSignalControls(level02), computeSignalControls(level02));
});

test("network_02 is a real scrolling level: much larger than the viewport, several junctions and gates", () => {
  assert.ok(level02.map.width >= 2 * 1280 && level02.map.height >= 2 * 720);
  assert.ok(level02.junctions.length >= 4);
  assert.ok(level02.inputGates.length >= 6 && level02.outputGates.length >= 6);
  assert.deepEqual(TrafficSession.create(clone(level02), gameConfig).sim.status, "running");
});

test("network_02: a car crosses several junctions to its far output gate", () => {
  const s = quietSession(level02);
  for (const j of level02.junctions) for (const axis of ["ns", "ew"]) {
    s.setSignal(`sg_${j.id}_${axis}_straight`, axis === "ns");
    s.setSignal(`sg_${j.id}_${axis}_turn`, false);
  }
  const v = spawnVehicle(s, "input_n1", "route_n1_straight");
  assert.ok(v);
  assert.ok(runUntil(s, () => s.stats.completed === 1, 120), "reached the output after crossing two junctions");
});

test("read model mirrors the simulation instead of recomputing it", () => {
  const s = quietSession(level01);
  const hud = new HudReadModel(s);
  let m = hud.read();
  assert.equal(m.gates.length, level01.inputGates.length);
  assert.equal(m.score, s.stats.score);
  assert.equal(m.capacity, s.stats.networkCapacity);
  assert.equal(m.incidentsActive, 0);
  assert.equal(m.status, "running");
  assert.equal(m.gridlock, null);

  // Keep one gate's queue full: pressure and the gridlock timer come from the stats system
  const gate = s.entity("input_north").getComponent("InputGateComponent");
  const topUp = () => {
    while (gate.queue.length < gate.queueCapacity) gate.queue.push({ type: s.sim.vehicleTypes.car, route: s.entity("route_n_straight"), arrivedAt: 0 });
  };
  setGroups(s); // all red: the lane fills, then the queue backs up
  const run = (until) => {
    for (let i = 0; i < 300 * s.sim.tickRate && !until(); i++) {
      topUp();
      s.tick();
    }
  };
  run(() => s.stats.gridlockProgress > 0);
  m = hud.read();
  assert.equal(m.gridlockRisk, 1);
  assert.ok(m.gridlockProgress > 0 && m.gridlockProgress < 1);
  assert.equal(m.gates.find((g) => g.id === "input_north").full, true);
  assert.equal(m.gridlockSeconds, s.sim.gridlock.fullSeconds);
  run(() => s.sim.status === "gridlock");
  m = hud.read();
  assert.equal(m.status, "gridlock");
  assert.equal(m.gridlock.gate, "INPUT NORTH");
});

test("incidents are exposed with a world position", () => {
  const s = quietSession(level01);
  setGroups(s, GROUPS.nsS, GROUPS.ewS);
  const hud = new HudReadModel(s);
  car(s, "e", "straight");
  s.step(70); // the east arm is longer: this brings both cars into the box together
  car(s, "n", "straight");
  assert.ok(runUntil(s, () => s.stats.activeObstacles > 0, 30), "crossing cars collide");
  const m = hud.read();
  assert.equal(m.incidentsActive, m.incidents.length);
  assert.ok(m.incidents.length > 0);
  for (const i of m.incidents) assert.ok(Number.isFinite(i.x) && Number.isFinite(i.y) && i.x >= 0 && i.x <= level01.map.width);
  assert.ok(m.incidentsTotal >= 1);
});
