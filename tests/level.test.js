import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLevel, assertValidLevel, LevelValidationError } from "../scripts/traffic/level/validateLevel.js";
import { compileLevel, conflictsOf } from "../scripts/traffic/level/compileLevel.js";
import { level01, clone, gameConfig } from "./helpers/fixtures.js";

const opts = { vehicleTypes: gameConfig.vehicleTypes };

test("the shipped level validates and is plain JSON", () => {
  assert.deepEqual(validateLevel(level01, opts).errors, []);
  assert.deepEqual(JSON.parse(JSON.stringify(level01)), level01, "survives a JSON round trip");
});

test("the shipped level meets the prototype brief", () => {
  assert.ok(level01.inputGates.length >= 2 && level01.outputGates.length >= 2);
  assert.ok(level01.inputGates.every((g) => g.queueCapacity > 0));
  assert.ok(level01.signalGroups.length >= 4);
  const arms = new Set(level01.lanes.filter((l) => l.kind === "approach").map((l) => l.id.split("_")[1]));
  for (const arm of arms) assert.equal(level01.lanes.filter((l) => l.kind === "approach" && l.id.startsWith(`lane_${arm}_`)).length, 2, `two lanes on the ${arm} approach`);
  assert.ok(level01.junctions[0].movements.some((m) => m.turn === "straight") && level01.junctions[0].movements.some((m) => m.turn !== "straight"));
  const curve = level01.demandCurves["rush-hour"];
  assert.ok(curve[curve.length - 1].rate > curve[0].rate * 3, "demand escalates");
});

const broken = (mutate, expectPath, expectText) => {
  const l = clone(level01);
  mutate(l);
  const r = validateLevel(l, opts);
  assert.equal(r.valid, false);
  const hit = r.errors.find((e) => e.path.startsWith(expectPath) && (!expectText || e.message.includes(expectText)));
  assert.ok(hit, `expected error at ${expectPath} (${expectText}); got ${JSON.stringify(r.errors)}`);
};

test("rejects missing required fields and old schema versions", () => {
  broken((l) => delete l.id, "id");
  broken((l) => delete l.lanes, "lanes");
  broken((l) => delete l.inputGates, "inputGates");
  broken((l) => (l.schemaVersion = 1), "schemaVersion");
});

test("rejects duplicate ids across categories", () => {
  broken((l) => (l.signalGroups[0].id = "lane_n_in_0"), "signalGroups[0].id", "duplicate");
  broken((l) => (l.outputGates[0].id = l.inputGates[0].id), "outputGates[0].id", "duplicate");
});

test("rejects dangling references", () => {
  broken((l) => (l.junctions[0].movements[0].from = "nope"), "junctions[0].movements[0].from", "unknown lane");
  broken((l) => (l.junctions[0].movements[0].signalGroup = "nope"), "junctions[0].movements[0].signalGroup", "unknown signalGroup");
  broken((l) => (l.signalGroups[0].junction = "nope"), "signalGroups[0].junction", "unknown junction");
  broken((l) => (l.inputGates[0].routes[0].route = "nope"), "inputGates[0].routes[0].route", "unknown route");
  broken((l) => (l.inputGates[0].demand.curve = "nope"), "inputGates[0].demand.curve", "unknown demand curve");
  broken((l) => (l.obstacles = [{ id: "o", kind: "k", at: 0, duration: 5, blockedLanes: ["nope"] }]), "obstacles[0].blockedLanes[0]", "unknown lane");
  broken((l) => (l.traffic.vehicleMix.tank = 1), "traffic.vehicleMix.tank", "unknown vehicle type");
});

test("rejects bad gate and demand data", () => {
  broken((l) => (l.inputGates[0].queueCapacity = 0), "inputGates[0].queueCapacity");
  broken((l) => (l.inputGates[0].lanes = []), "inputGates[0].lanes");
  broken((l) => (l.inputGates[0].routes[0].route = "route_s_straight"), "inputGates[0].routes[0].route", "does not feed");
  broken((l) => (l.outputGates = l.outputGates.filter((g) => g.id !== "output_south")), "inputGates", "no output gate");
  broken((l) => (l.demandCurves["rush-hour"][1].time = 0), "demandCurves.rush-hour[1].time", "increasing");
  broken((l) => (l.demandCurves["rush-hour"][0].rate = -1), "demandCurves.rush-hour[0].rate");
  broken((l) => (l.gridlock.fullSeconds = -1), "gridlock.fullSeconds");
});

test("rejects routes that are not continuous", () => {
  broken((l) => (l.routes[0].steps = ["lane_n_in_0", "lane_s_out"]), "routes[0]", "movement");
  broken((l) => (l.routes[0].steps = ["lane_n_in_0", "mv_s_straight", "lane_n_out"]), "routes[0]", "starts at");
  broken((l) => (l.routes[0].steps = ["lane_n_in_0", "mv_n_straight"]), "routes[0]", "must end on a lane");
});

test("assertValidLevel throws a readable error", () => {
  const l = clone(level01);
  l.lanes[0].points = [[0, 0]];
  assert.throws(() => assertValidLevel(l), (e) => e instanceof LevelValidationError && /lanes\[0\]\.points/.test(e.message));
});

test("compile builds connectors and derives conflict zones from geometry", () => {
  const { lanes, connectors, zones } = compileLevel(level01);
  assert.equal(lanes.size, 12);
  assert.equal(connectors.size, 8);
  assert.equal(zones.length, 8);
  const ns = conflictsOf(zones, "mv_n_straight");
  assert.ok(ns.has("mv_e_straight") && ns.has("mv_w_straight"), "crossing straights conflict");
  assert.ok(ns.has("mv_w_right"), "a right turn merging into the same exit conflicts");
  assert.ok(!ns.has("mv_s_straight"), "opposing straights do not conflict");
  assert.ok(!ns.has("mv_n_right"), "movements from the same arm do not conflict");
  assert.ok(!ns.has("mv_s_right") && !ns.has("mv_e_right"), "unrelated corners do not conflict");
  for (const z of zones) {
    const a = connectors.get(z.a.movement);
    const b = connectors.get(z.b.movement);
    assert.ok(z.a.s0 >= 0 && z.a.s1 <= a.length + 1 && z.b.s0 >= 0 && z.b.s1 <= b.length + 1, "intervals lie on their paths");
    assert.equal(z.kind, a.to === b.to ? "merge" : "cross");
  }
});

test("conflicts follow the geometry: moving a path changes them", () => {
  const l = clone(level01);
  // Route north-straight around the west side, away from every crossing path
  l.junctions[0].movements.find((m) => m.id === "mv_n_straight").path = [[630, 320], [560, 300], [560, 420], [630, 400]];
  const { zones } = compileLevel(l);
  assert.ok(!conflictsOf(zones, "mv_n_straight").has("mv_e_straight"));
});
