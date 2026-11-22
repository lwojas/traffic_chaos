import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateLevel } from "../scripts/traffic/level/validateLevel.js";
import { compileLevel } from "../scripts/traffic/level/compileLevel.js";
import { computeSignalControls } from "../scripts/traffic/view/signalControlLayout.js";
import { quietSession, spawnVehicle, runUntil, vs } from "./helpers/fixtures.js";

// The shipped first map has left turns (generate-grid-network.mjs `lefts: true`).
const level = JSON.parse(readFileSync(new URL("../data/levels/first-junction.json", import.meta.url), "utf8"));

test("the first map is valid and every junction has a left movement per arm with its own signal group", () => {
  assert.equal(validateLevel(level).valid, true);
  for (const j of level.junctions) {
    const lefts = j.movements.filter((m) => m.turn === "left");
    assert.equal(lefts.length, 4, `${j.id} has a left from every arm`);
    assert.equal(new Set(lefts.map((m) => m.signalGroup)).size, 4, "one group per arm, so opposing lefts are never tied together");
    for (const m of lefts) assert.ok(level.signalGroups.some((g) => g.id === m.signalGroup));
  }
});

test("a left turn only goes when its own group is green", () => {
  const s = quietSession(level);
  for (const g of level.signalGroups) s.setSignal(g.id, false);
  const v = spawnVehicle(s, "input_e2", "route_e2_left0");
  assert.ok(v);
  s.tick(); // an uninterrupted red must hold it
  assert.equal(runUntil(s, () => s.stats.completed === 1, 25), false, "held at red");
  s.setSignal("sg_j_1_1_e_left", true);
  assert.ok(runUntil(s, () => s.stats.completed === 1, 40), "released by its left group, reaches the exit");
  assert.ok(vs(v).arrived);
});

test("opposing left turns cross in the box, so they are real conflicts the player must separate", () => {
  const { zones } = compileLevel(level);
  const has = (a, b) => zones.some((z) => (z.a.movement === a && z.b.movement === b) || (z.a.movement === b && z.b.movement === a));
  assert.ok(has("mv_j_0_0_n_left", "mv_j_0_0_s_left"), "n-left x s-left");
  assert.ok(has("mv_j_0_0_n_left", "mv_j_0_0_s_straight"), "n-left x oncoming straight");
});

test("signal controls on an arm stack left, then right, then straight, nearest the junction first", () => {
  // Southern arm of j_1_0 (S1 gate): northbound approach, so "nearer the junction" means smaller y
  const controls = computeSignalControls(level).filter((c) => c.junctionId === "j_1_0" && c.direction === "Northbound");
  const by = (turn) => controls.find((c) => c.turns.length === 1 && c.turns[0] === turn);
  const [left, right, straight] = ["left", "right", "straight"].map(by);
  assert.ok(left && right && straight, "three controls on the arm");
  assert.ok(left.y < right.y && right.y < straight.y, `order top to bottom: left ${left.y}, right ${right.y}, straight ${straight.y}`);
});
