import { test } from "node:test";
import assert from "node:assert/strict";
import { TrafficSession } from "../scripts/traffic/session/TrafficSession.js";
import { quietSession, spawnVehicle, runUntil, vs, level02, firstJunction, gameConfig, clone } from "./helpers/fixtures.js";

// network_02: W1 straight runs j_0_0 -> j_0_1 -> j_0_2. Closing its straight at j_0_1 forces a detour.
const CLOSE = "sg_j_0_1_ew_straight@link_j_0_0_j_0_1";
const routeSteps = (s, id) => s.entity(id).getComponent("RouteComponent").steps;
const closedConnectors = (s, id) => s.diversions.targets.get(id);
const allRed = (s) => {
  for (const g of s.level.signalGroups) s.setSignal(g.id, false);
};

test("closing a movement sends uncommitted cars round it and reopening sends them back", () => {
  const s = quietSession(level02);
  allRed(s);
  const v = spawnVehicle(s, "input_w1", "route_w1_straight");
  s.tick();
  const original = routeSteps(s, "route_w1_straight");
  s.toggleDiversion(CLOSE);
  s.tick();
  const detour = vs(v).steps;
  assert.notEqual(detour, original, "rewritten");
  assert.equal(detour[0], original[0], "the part already driven is kept");
  for (const c of closedConnectors(s, CLOSE)) assert.ok(!detour.includes(c), "never drives the closed movement");
  assert.ok(detour[detour.length - 1].getComponent("LaneComponent").outputGate, "still ends at an exit");

  s.toggleDiversion(CLOSE);
  s.tick();
  assert.equal(vs(v).steps, original, "back on its own route once the closure is lifted");
});

test("a car already committed to the closed movement drives through it", () => {
  const s = quietSession(level02);
  allRed(s);
  s.setSignal("sg_j_0_0_ew_straight", true);
  s.setSignal("sg_j_0_1_ew_straight", true);
  s.setSignal("sg_j_0_2_ew_straight", true);
  const v = spawnVehicle(s, "input_w1", "route_w1_straight");
  const mv = s.entity("mv_j_0_1_w_straight");
  assert.ok(runUntil(s, () => vs(v).segment === mv, 40), "reaches the movement");
  s.toggleDiversion(CLOSE);
  s.tick();
  assert.equal(vs(v).steps, routeSteps(s, "route_w1_straight"), "keeps its path");
  assert.ok(runUntil(s, () => s.stats.completed === 1, 40), "and exits normally");
});

test("new traffic never enters a closed movement", () => {
  const s = TrafficSession.create(clone(level02), gameConfig, { seed: 7 });
  s.toggleDiversion(CLOSE);
  const closed = closedConnectors(s, CLOSE);
  let used = 0;
  for (let i = 0; i < 120 * s.sim.tickRate && !s.gameOver; i++) {
    s.tick();
    for (const c of closed) used += c.getComponent("LaneComponent").vehicles.length;
  }
  assert.equal(used, 0);
  assert.ok(s.stats.completed > 0, "traffic still flows");
});

test("two diversions, reusable after a cooldown", () => {
  const s = quietSession(level02);
  const ids = ["sg_j_0_1_ew_straight@link_j_0_0_j_0_1", "sg_j_1_1_ns_straight@link_j_0_1_j_1_1", "sg_j_0_2_ns_straight@lane_j_0_2_n_in_0"];
  s.toggleDiversion(ids[0]);
  s.toggleDiversion(ids[1]);
  s.tick();
  assert.deepEqual(s.diversions.describe().active, ids.slice(0, 2));
  assert.equal(s.diversions.refusal(ids[2]), "all 2 diversions in use");
  s.toggleDiversion(ids[2]);
  s.tick();
  assert.equal(s.diversions.isClosed(ids[2]), false, "third is refused");

  s.toggleDiversion(ids[0]); // lift one: its slot cools down
  s.tick();
  assert.match(s.diversions.refusal(ids[2]), /^diversion ready in \d+s$/);
  s.step(s.sim.diversions.cooldown * s.sim.tickRate);
  assert.equal(s.diversions.refusal(ids[2]), null);
  s.toggleDiversion(ids[2]);
  s.tick();
  assert.ok(s.diversions.isClosed(ids[2]));
});

test("a closure that leaves an entry no way out is refused", () => {
  const s = quietSession(firstJunction);
  s.toggleDiversion("sg_n_straight@lane_n_in_0");
  s.tick();
  assert.equal(s.diversions.refusal("sg_n_turn@lane_n_in_1"), "no other way round", "north would have no movement left");
});

test("a level can turn diversions off", () => {
  const level = clone(level02);
  level.diversions = { slots: 0 };
  const s = TrafficSession.create(level, gameConfig, { demandScale: 0 });
  assert.equal(s.diversions.refusal(CLOSE), "no diversions on this map");
});

test("diversions are deterministic", () => {
  const run = () => {
    const s = TrafficSession.create(clone(level02), gameConfig, { seed: 3 });
    for (let i = 0; i < 150 * s.sim.tickRate && !s.gameOver; i++) {
      if (i === 20 * s.sim.tickRate) s.toggleDiversion(CLOSE);
      if (i === 90 * s.sim.tickRate) s.toggleDiversion(CLOSE);
      s.tick();
    }
    return s.summary();
  };
  assert.deepEqual(run(), run());
});

// Roadworks mid-way along the link j_0_0 -> j_0_1, from t=1s for 20s
function roadworksSession() {
  const level = clone(level02);
  level.obstacles = [{ id: "works", kind: "roadworks", position: 0.5, at: 1, duration: 20, blockedLanes: ["link_j_0_0_j_0_1"] }];
  return TrafficSession.create(level, gameConfig, { demandScale: 0 });
}
const feeders = (s) => s.diversions.connectors.filter((c) => c.getComponent("LaneComponent").toId === "link_j_0_0_j_0_1");

test("divert round an incident closes every movement into the blocked road", () => {
  const s = roadworksSession();
  assert.equal(s.diversions.refusal("incident:works"), "no such incident", "not there yet");
  runUntil(s, () => s.diversions.findObstacle("works")?.getComponent("ObstacleComponent").active, 5);
  s.divertAround("works");
  s.tick();
  assert.ok(s.diversions.isDiverted("works"));
  assert.ok(feeders(s).length >= 2);
  for (const c of feeders(s)) assert.ok(s.diversions.closed.has(c));
  assert.ok(s.diversions.isClosed("sg_j_0_0_ew_straight@lane_j_0_0_w_in_0"), "its world controls read as closed");
  assert.equal(s.diversions.describe().inUse, 1, "one slot for the whole road");
});

test("an incident diversion lifts itself when the incident clears, with no cooldown", () => {
  const s = roadworksSession();
  runUntil(s, () => s.diversions.findObstacle("works")?.getComponent("ObstacleComponent").active, 5);
  s.divertAround("works");
  s.tick();
  assert.ok(runUntil(s, () => !s.diversions.isDiverted("works"), 30), "lifted after the roadworks end");
  assert.equal(s.diversions.closed.size, 0);
  assert.equal(s.diversions.describe().free, 2, "slot back at once");
});

test("holding a control that an incident diversion closed reopens the road", () => {
  const s = roadworksSession();
  runUntil(s, () => s.diversions.findObstacle("works")?.getComponent("ObstacleComponent").active, 5);
  s.divertAround("works");
  s.tick();
  s.toggleDiversion("sg_j_0_0_ew_straight@lane_j_0_0_w_in_0");
  s.tick();
  assert.equal(s.diversions.isDiverted("works"), false);
  assert.equal(s.diversions.closed.size, 0);
  assert.equal(s.summary().diversionsUsed, 1);
});

test("an incident that blocks a whole junction is diverted only where there is a way round", () => {
  const level = clone(level02);
  const blocked = level.junctions.find((j) => j.id === "j_0_0").movements.map((m) => m.id);
  level.obstacles = [{ id: "box", kind: "roadworks", at: 1, duration: 20, blockedLanes: blocked }];
  const s = TrafficSession.create(level, gameConfig, { demandScale: 0 });
  runUntil(s, () => s.diversions.findObstacle("box")?.getComponent("ObstacleComponent").active, 5);
  const plan = s.diversions.incidentPlan("incident:box");
  assert.equal(plan.all.length, blocked.length);
  assert.ok(plan.open.length < plan.all.length, "some movements stay open: closing them would trap an entry");
  assert.equal(s.diversions.strandsWith(plan.open), false);
  if (plan.open.length > 0) {
    s.divertAround("box");
    s.tick();
    assert.deepEqual([...s.diversions.closed], plan.open);
  } else assert.equal(s.diversions.refusal("incident:box"), "no other way round");
});
