import { test } from "node:test";
import assert from "node:assert/strict";
import { LightState } from "../scripts/components/traffic/SignalGroupComponent.js";
import { VehicleStates } from "../scripts/components/traffic/VehicleStateComponent.js";
import { demandAt } from "../scripts/traffic/util/demand.js";
import { TrafficSession } from "../scripts/traffic/session/TrafficSession.js";
import { level01, gameConfig, clone, quietSession, car, runUntil, vs, lane, group, setGroups, GROUPS } from "./helpers/fixtures.js";

const { nsS, nsT, ewS, ewT } = GROUPS;
const secs = (s, n) => s.step(Math.round(n * s.sim.tickRate));
const obstacles = (s) => s.entityManager.world.filter((e) => e.hasComponent("ObstacleComponent")).map((e) => e.getComponent("ObstacleComponent"));

// East arm lanes are longer than north/south, so an east car must start ~70
// ticks earlier to reach the box at the same moment as a north car. This pair
// is a crossing conflict: both released, both in the zone together.
function crossingPair(s) {
  const e = car(s, "e", "straight");
  s.step(70);
  const n = car(s, "n", "straight");
  return [e, n];
}

// ---- Signals ---------------------------------------------------------------

test("signal groups start as the level says", () => {
  const s = quietSession();
  assert.equal(group(s, nsS).state, LightState.GREEN);
  for (const id of [nsT, ewS, ewT]) assert.equal(group(s, id).state, LightState.RED);
});

test("green movement permits vehicles: they cross and reach their output", () => {
  const s = quietSession();
  const v = car(s, "n", "straight");
  const visited = [];
  runUntil(s, () => {
    const seg = vs(v)?.segment.id;
    if (seg && visited.at(-1) !== seg) visited.push(seg);
    return s.stats.completed === 1;
  }, 30);
  assert.deepEqual(visited, ["lane_n_in_0", "mv_n_straight", "lane_s_out"]);
  assert.equal(s.vehicles().length, 0, "removed at the output gate");
});

test("red movement stops vehicles before the line, gradually, and holds them", () => {
  const s = quietSession();
  const v = car(s, "w", "straight"); // EW straight is red
  const l = lane(s, "lane_w_in_0");
  let sawSlowing = false;
  assert.ok(runUntil(s, () => {
    if (vs(v).state === VehicleStates.SLOWING) sawSlowing = true;
    return vs(v).speed === 0;
  }, 30));
  assert.ok(sawSlowing, "decelerated rather than snapping to zero");
  assert.ok(vs(v).s <= l.stopLineS && vs(v).s > l.stopLineS - 20, "stopped just behind the line");
  secs(s, 5);
  assert.equal(vs(v).speed, 0);
  assert.equal(s.stats.completed, 0);
});

test("signal groups are independent: one releases while the others hold", () => {
  const s = quietSession();
  setGroups(s, nsT);
  const straight = car(s, "n", "straight"); // NS straight is now red
  const turning = car(s, "n", "right"); // NS turn is green
  secs(s, 15);
  assert.equal(s.stats.completed, 1, "only the turning car got through");
  assert.ok(vs(turning).arrived, "turning car completed");
  assert.equal(vs(straight).speed, 0, "straight car still waiting at its red");
  setGroups(s, nsT, nsS);
  assert.ok(runUntil(s, () => s.stats.completed === 2, 20), "reopening straight releases it");
});

test("green is instant, red passes through yellow first", () => {
  const s = quietSession();
  s.setSignal(ewS, true);
  s.step(1);
  assert.equal(group(s, ewS).state, LightState.GREEN);
  s.setSignal(nsS, false);
  s.step(1);
  assert.equal(group(s, nsS).state, LightState.YELLOW);
  secs(s, 2.1);
  assert.equal(group(s, nsS).state, LightState.RED);
  s.toggleSignal(nsS);
  s.step(1);
  assert.equal(group(s, nsS).state, LightState.GREEN);
});

test("a vehicle that cannot stop at yellow carries on through", () => {
  const s = quietSession();
  const v = car(s, "n", "straight");
  assert.ok(runUntil(s, () => vs(v).segment.id === "lane_n_in_0" && lane(s, "lane_n_in_0").length - vs(v).s < 40, 10));
  s.setSignal(nsS, false);
  secs(s, 6);
  assert.equal(s.stats.completed, 1, "too close to brake: went through the yellow");
});

// ---- Demand ----------------------------------------------------------------

test("demand curve interpolates, clamps before the first and after the last point", () => {
  const curve = [{ time: 10, rate: 0.2 }, { time: 30, rate: 0.6 }, { time: 60, rate: 1.2 }];
  assert.equal(demandAt(curve, 0), 0.2);
  assert.equal(demandAt(curve, 10), 0.2);
  assert.ok(Math.abs(demandAt(curve, 20) - 0.4) < 1e-9);
  assert.ok(Math.abs(demandAt(curve, 45) - 0.9) < 1e-9);
  assert.equal(demandAt(curve, 500), 1.2);
});

test("gates follow the level's demand curve", () => {
  const s = TrafficSession.create(clone(level01), gameConfig);
  const gate = s.entity("input_north").getComponent("InputGateComponent");
  s.step(1);
  assert.ok(Math.abs(gate.rate - 0.1) < 1e-3, "starts at the first curve point");
  setGroups(s, nsS, nsT, ewS, ewT);
  secs(s, 120);
  assert.ok(Math.abs(gate.rate - 0.4) < 1e-6, `rate at 120 s is ${gate.rate}`);
  assert.equal(s.stats.demandRate, gate.rate * 4, "HUD demand is the sum over gates");
});

test("arrivals track the curve: more demand later, same total as the integral", () => {
  const level = clone(level01);
  level.demandCurves["rush-hour"] = [{ time: 0, rate: 0.1 }, { time: 200, rate: 0.9 }];
  level.inputGates.forEach((g) => (g.queueCapacity = 10000));
  const s = TrafficSession.create(level, gameConfig);
  setGroups(s, nsS, nsT, ewS, ewT);
  const arrivals = () => s.entityManager.world.reduce((n, e) => n + (e.getComponent("InputGateComponent")?.arrived ?? 0), 0);
  secs(s, 100);
  const first = arrivals();
  secs(s, 100);
  const second = arrivals() - first;
  assert.ok(second > first * 1.5, `second half (${second}) should be much busier than the first (${first})`);
  const expected = 4 * 0.5 * (0.1 + 0.9) * 200; // 4 gates, area under the ramp
  assert.ok(Math.abs(arrivals() - expected) < expected * 0.2, `got ${arrivals()}, expected about ${expected}`);
});

test("rising demand raises pressure: queues and input backlog grow with the demand scale", () => {
  const pressure = (scale) => {
    const s = TrafficSession.create(clone(level01), gameConfig, { demandScale: scale });
    const cycle = (t) => (t % 30 < 12 ? [nsS, nsT] : t % 30 >= 15 && t % 30 < 27 ? [ewS, ewT] : []);
    for (let i = 0; i < 30 * 60; i++) {
      if (i % 15 === 0) setGroups(s, ...cycle(i / 30));
      s.tick();
    }
    return s.stats.inputQueued + s.stats.queueNow;
  };
  assert.ok(pressure(2.5) > pressure(1) + 2, "heavier demand leaves more vehicles waiting");
});

// ---- Capacity and queues ---------------------------------------------------

test("input queues accumulate when the network does not take the traffic", () => {
  const s = TrafficSession.create(clone(level01), gameConfig, { demandScale: 5 });
  setGroups(s); // all red: nothing can leave the approach lanes
  const gate = s.entity("input_north").getComponent("InputGateComponent");
  let peak = 0;
  while (s.time < 90 && !s.gameOver) {
    s.tick();
    peak = Math.max(peak, gate.queue.length);
  }
  assert.ok(gate.injected > 3, "approach lanes took vehicles first");
  assert.ok(peak > 3, `then the input queue grew (peak ${peak})`);
  assert.equal(s.stats.completed, 0);
  assert.equal(s.stats.inputQueued > 0, true);
});

test("output gates remove vehicles and count throughput per gate", () => {
  const s = quietSession();
  car(s, "n", "straight");
  setGroups(s, nsS);
  runUntil(s, () => s.stats.completed === 1, 30);
  assert.equal(s.entity("output_south").getComponent("OutputGateComponent").throughput, 1);
  assert.equal(s.entity("output_north").getComponent("OutputGateComponent").throughput, 0);
  assert.ok(s.stats.score > 0 && s.stats.score <= gameConfig.simulation.scoring.perVehicle * gameConfig.simulation.multiplier.max, "base points x multiplier per vehicle delivered");
});

test("an output gate with an outflow limit becomes a bottleneck that queues traffic upstream", () => {
  const level = clone(level01);
  level.outputGates.find((g) => g.id === "output_south").outflowPerMinute = 6;
  const s = quietSession(level);
  for (let i = 0; i < 6; i++) {
    car(s, "n", "straight");
    secs(s, 1);
  }
  secs(s, 12);
  assert.ok(s.stats.completed < 6, "gate rate-limited the flow");
  assert.ok(lane(s, "lane_s_out").vehicles.length >= 2, "queue stands in the exit lane");
});

test("queues propagate upstream: blocked lane -> lane fills -> input queue fills -> gridlock", () => {
  const level = clone(level01);
  level.obstacles = [{ id: "closure", kind: "roadworks", at: 0, duration: 600, blockedLanes: ["lane_n_in_0", "lane_n_in_1"] }];
  for (const g of level.inputGates) if (g.id !== "input_north") g.demand.scale = 0; // isolate the north arm
  const s = TrafficSession.create(level, gameConfig, { demandScale: 2 });
  setGroups(s, nsS, nsT);
  const gate = s.entity("input_north").getComponent("InputGateComponent");
  let laneFullAt = null;
  let inputFullAt = null;
  for (let i = 0; i < 30 * 200 && !s.gameOver; i++) {
    s.tick();
    const longest = Math.max(lane(s, "lane_n_in_0").vehicles.length, lane(s, "lane_n_in_1").vehicles.length);
    if (laneFullAt === null && longest >= 5) laneFullAt = s.time;
    if (inputFullAt === null && gate.queue.length >= gate.queueCapacity) inputFullAt = s.time;
  }
  assert.ok(laneFullAt !== null && inputFullAt !== null, "both stages reached");
  assert.ok(laneFullAt < inputFullAt, "the lane filled before the input queue did");
  assert.equal(s.sim.status, "gridlock");
  assert.equal(s.sim.gridlockGate, s.entity("input_north"), "failure is attributed to the gate that filled");
  assert.ok(s.sim.gridlockTime > inputFullAt, "gridlock needed the queue to stay full, not just touch capacity");
});

test("a full input queue only ends the level after staying full", () => {
  const s = quietSession();
  const gate = s.entity("input_north").getComponent("InputGateComponent");
  const fill = () => { while (gate.queue.length < gate.queueCapacity) gate.queue.push({ type: s.sim.vehicleTypes.car, route: s.entity("route_n_straight"), arrivedAt: 0 }); };
  setGroups(s, nsS);
  fill();
  s.step(1);
  assert.equal(s.sim.status, "running", "touching capacity is not failure");
  gate.queue.length = 0;
  secs(s, 3);
  assert.equal(gate.fullTime, 0, "timer resets once it drains");
  setGroups(s); // all red so it cannot drain
  fill();
  for (let i = 0; i < 30 * 40 && s.sim.status === "running"; i++) { fill(); s.tick(); }
  assert.equal(s.sim.status, "gridlock");
  const t = s.time;
  s.tick();
  assert.equal(s.time, t, "a finished level no longer advances");
  assert.equal(s.advance(1), 0);
});

// ---- Conflicts -------------------------------------------------------------

test("conflict zones are derived from geometry, not authored", () => {
  const s = quietSession();
  const zones = s.entity("junction_main").getComponent("JunctionComponent").zones;
  const groupsOf = (z) => [lane(s, z.a.movement).signalGroup.id, lane(s, z.b.movement).signalGroup.id].sort().join("|");
  const pairs = new Set(zones.map(groupsOf));
  assert.ok(pairs.has([nsS, ewS].sort().join("|")), "crossing straights conflict");
  assert.ok(pairs.has([nsS, ewT].sort().join("|")), "turn merges into the straight's exit");
  assert.ok(pairs.has([nsT, ewS].sort().join("|")));
  assert.ok(![...pairs].some((p) => p === [nsS, nsT].sort().join("|") || p === [ewS, ewT].sort().join("|") || p === [nsT, ewT].sort().join("|")), "compatible groups share no zone");
  assert.ok(zones.some((z) => z.kind === "cross") && zones.some((z) => z.kind === "merge"));
  assert.ok(!zones.some((z) => z.a.movement === "mv_n_straight" && z.b.movement === "mv_s_straight"), "opposing straights do not meet");
});

test("compatible movements coexist: no incidents when only compatible groups are green", () => {
  for (const greens of [[nsS, nsT], [ewS, ewT], [nsT, ewT]]) {
    const s = TrafficSession.create(clone(level01), gameConfig, { demandScale: 2 });
    setGroups(s, ...greens);
    secs(s, 90);
    assert.equal(s.stats.incidents, 0, `incidents with ${greens}`);
    assert.ok(s.stats.completed > 10, `traffic flowed with ${greens}`);
  }
});

test("conflicting movements produce an incident: the simulation does not prevent it", () => {
  const s = quietSession();
  setGroups(s, nsS, ewS);
  const [e, n] = crossingPair(s);
  assert.ok(runUntil(s, () => s.stats.incidents > 0, 20), "incident occurred");
  assert.equal(s.stats.incidents, 1);
  for (const v of [e, n]) {
    assert.equal(vs(v).state, VehicleStates.CRASHED);
    assert.equal(vs(v).speed, 0);
    assert.ok(vs(v).segment.id.startsWith("mv_"), "wrecked inside the junction");
  }
});

test("merge conflicts also cause incidents", () => {
  const s = quietSession();
  setGroups(s, nsS, ewT); // N straight and W right both end in lane_s_out
  car(s, "w", "right");
  s.step(66); // the west arm is longer: this timing brings both to the merge together
  car(s, "n", "straight");
  assert.ok(runUntil(s, () => s.stats.incidents > 0, 30), "merge collision");
});

test("a conflict needs the two vehicles to be in the zone together: timing decides", () => {
  const s = quietSession();
  setGroups(s, nsS, ewS);
  car(s, "e", "straight");
  secs(s, 4); // north car arrives long after the east car has cleared
  car(s, "n", "straight");
  secs(s, 20);
  assert.equal(s.stats.incidents, 0);
  assert.equal(s.stats.completed, 2);
});

test("patience never changes signal or conflict behaviour", () => {
  const impatient = quietSession();
  for (const t of Object.values(impatient.sim.vehicleTypes)) t.patience = 0;
  const waiting = car(impatient, "w", "straight");
  secs(impatient, 20);
  assert.equal(vs(waiting).speed, 0, "an impatient driver still waits at red");

  const patient = quietSession();
  for (const t of Object.values(patient.sim.vehicleTypes)) t.patience = 1e9;
  setGroups(patient, nsS, ewS);
  crossingPair(patient);
  assert.ok(runUntil(patient, () => patient.stats.incidents > 0, 20), "a patient driver still crashes into crossing traffic");
});

test("patience only governs pushing into a junction with no room beyond", () => {
  const run = (patience) => {
    const level = clone(level01);
    level.obstacles = [{ id: "closure", kind: "roadworks", at: 0, duration: 600, blockedLanes: ["lane_s_out"] }];
    const s = quietSession(level);
    for (const t of Object.values(s.sim.vehicleTypes)) t.patience = patience;
    for (let i = 0; i < 5; i++) { car(s, "n", "straight"); secs(s, 1.2); }
    secs(s, 40);
    return lane(s, "mv_n_straight").vehicles.length + lane(s, "lane_s_out").vehicles.length;
  };
  // Closure sits at the far end of lane_s_out; the lane itself can hold ~7 cars, so use many cars
  assert.ok(run(1) >= run(1e9), "impatient drivers push further in");
});

// ---- Incidents and obstacles -----------------------------------------------

test("a collision creates a temporary obstacle with a countdown", () => {
  const s = quietSession();
  setGroups(s, nsS, ewS);
  crossingPair(s);
  runUntil(s, () => s.stats.incidents > 0, 20);
  s.step(1);
  const [o] = obstacles(s);
  assert.equal(o.kind, "collision");
  assert.equal(o.duration, gameConfig.simulation.incidents.duration);
  assert.ok(o.remaining < o.duration && o.remaining > o.duration - 1);
  assert.equal(o.vehicles.length, 2);
  assert.ok(o.zone.startsWith("zone_"), "records which zone it happened in");
  assert.equal(s.stats.activeObstacles, 1);
  assert.equal(s.stats.score, 0, "a crash costs no points; the obstruction is the penalty");
});

test("the obstacle blocks the wrecked movements and the movements through their zones", () => {
  const s = quietSession();
  setGroups(s, nsS, ewS);
  crossingPair(s);
  runUntil(s, () => s.stats.incidents > 0, 20);
  s.step(1);
  const blocked = new Set(obstacles(s)[0].blocks.map((b) => b.lane.id));
  for (const id of ["mv_n_straight", "mv_e_straight", "mv_w_straight", "mv_s_straight"]) assert.ok(blocked.has(id), `${id} blocked`);
  assert.ok(!blocked.has("mv_n_right"), "unrelated movements stay open");
  assert.ok(lane(s, "mv_w_straight").blockers.length > 0);
});

test("an obstacle reduces network capacity and restores it when it clears", () => {
  const s = quietSession();
  assert.equal(s.stats.networkCapacity, 1);
  setGroups(s, nsS, ewS);
  crossingPair(s);
  runUntil(s, () => s.stats.incidents > 0, 20);
  s.step(2);
  assert.ok(s.stats.networkCapacity < 1, "capacity dropped");
  assert.ok(s.stats.blockedLanes >= 4);
  runUntil(s, () => s.stats.activeObstacles === 0, 30);
  s.step(2);
  assert.equal(s.stats.networkCapacity, 1);
});

test("traffic queues behind an incident, the obstacle expires, and traffic resumes", () => {
  const s = quietSession();
  setGroups(s, nsS, ewS);
  crossingPair(s);
  runUntil(s, () => s.stats.incidents > 0, 20);
  setGroups(s, nsS); // the player reacts: only north/south straight stays open
  const waiting = [car(s, "n", "straight")];
  secs(s, 1.5);
  waiting.push(car(s, "n", "straight"));
  secs(s, 8);
  assert.equal(s.stats.completed, 0, "nobody gets through while the junction is blocked");
  assert.ok(waiting.every((v) => vs(v).speed === 0 && vs(v).segment.id === "lane_n_in_0"), "held at the stop line");
  const l = lane(s, "lane_n_in_0");
  assert.equal(l.vehicles.length, 2, "queue behind the incident");
  assert.ok(runUntil(s, () => s.stats.activeObstacles === 0, 30), "obstacle expires on its own");
  assert.equal(s.vehicles().filter((v) => vs(v).disabled).length, 0, "wrecks cleared");
  assert.ok(runUntil(s, () => s.stats.completed === 2, 30), "queued vehicles flow again");
});

test("level-scheduled obstacles use the same machinery: roadworks block a lane, then end", () => {
  const level = clone(level01);
  level.obstacles = [{ id: "roadworks_1", kind: "roadworks", at: 5, duration: 10, blockedLanes: ["lane_e_in_0"] }];
  const s = quietSession(level);
  setGroups(s, ewS);
  assert.equal(obstacles(s).length, 0, "not yet");
  secs(s, 5.5);
  assert.equal(obstacles(s)[0].kind, "roadworks");
  assert.equal(lane(s, "lane_e_in_0").blockers.length, 1);
  const v = car(s, "e", "straight");
  assert.ok(runUntil(s, () => vs(v).speed < 0.5, 12), "stopped by the closed lane");
  assert.ok(vs(v).s > lane(s, "lane_e_in_0").length - 50, "at the end of the lane, behind the block");
  assert.equal(lane(s, "lane_e_in_0").vehicles.length, 1);
  assert.ok(runUntil(s, () => s.stats.completed === 1, 30), "completes after the roadworks end");
  assert.equal(obstacles(s).length, 0);
  assert.equal(lane(s, "lane_e_in_0").blockers.length, 0);
});

test("roadworks can sit mid-road: traffic queues behind them, away from the junction", () => {
  const level = clone(level01);
  level.obstacles = [{ id: "roadworks_mid", kind: "roadworks", at: 5, duration: 10, position: 0.5, blockedLanes: ["lane_e_in_0"] }];
  const s = quietSession(level);
  setGroups(s, ewS);
  secs(s, 5.5);
  const len = lane(s, "lane_e_in_0").length;
  assert.ok(Math.abs(lane(s, "lane_e_in_0").blockers[0].rear - (len / 2 - 6)) < 0.01, "block sits midway along the lane");
  const v = car(s, "e", "straight");
  assert.ok(runUntil(s, () => vs(v).speed < 0.5, 12), "stopped by the roadworks");
  assert.ok(vs(v).s < len / 2, "behind the block, well short of the junction");
  assert.ok(runUntil(s, () => s.stats.completed === 1, 30), "completes after the roadworks end");
});

test("incidents can be switched off for a level", () => {
  const level = clone(level01);
  level.incidents = { enabled: false };
  const s = quietSession(level);
  setGroups(s, nsS, ewS);
  crossingPair(s);
  secs(s, 20);
  assert.equal(s.stats.incidents, 0);
  assert.equal(s.stats.completed, 2, "vehicles drive through each other");
});

// ---- The full loop ---------------------------------------------------------

const play = (strategy, seconds = 600) => {
  const s = TrafficSession.create(clone(level01), gameConfig);
  for (let i = 0; i < 30 * seconds && !s.gameOver; i++) {
    if (i % 15 === 0) strategy(s, i / 30);
    s.tick();
  }
  return s;
};
const twoPhase = (green, gap) => (s, t) => {
  const p = t % (2 * (green + gap));
  setGroups(s, ...(p < green ? [nsS, nsT] : p >= green + gap && p < 2 * green + gap ? [ewS, ewT] : []));
};

test("bad signal configurations collapse the network; a sensible strategy lasts far longer", () => {
  const allGreen = play((s) => setGroups(s, nsS, nsT, ewS, ewT));
  const allRed = play((s) => setGroups(s));
  const careless = play((s, t) => setGroups(s, ...(Math.floor(t / 12) % 2 ? [ewS, ewT] : [nsS, nsT]))); // no clearance gap
  const sensible = play(twoPhase(12, 3));
  assert.equal(allGreen.sim.status, "gridlock");
  assert.ok(allGreen.stats.incidents >= 5, "opening everything causes repeated incidents");
  assert.equal(allRed.sim.status, "gridlock");
  assert.equal(allRed.stats.completed, 0);
  assert.equal(careless.sim.status, "gridlock");
  assert.ok(careless.stats.incidents > 0, "switching without a gap clips the previous phase");
  assert.equal(sensible.stats.incidents, 0);
  for (const bad of [allGreen, allRed, careless]) assert.ok(sensible.time > bad.time * 1.4, `sensible ${sensible.time.toFixed(0)}s vs bad ${bad.time.toFixed(0)}s`);
  assert.ok(sensible.stats.completed > allGreen.stats.completed * 4, `${sensible.stats.completed} vs ${allGreen.stats.completed}`);
});

test("early game is easy: light traffic flows with no queue build-up", () => {
  const s = TrafficSession.create(clone(level01), gameConfig);
  for (let i = 0; i < 30 * 30; i++) {
    if (i % 15 === 0) twoPhase(10, 3)(s, i / 30);
    s.tick();
  }
  assert.ok(s.stats.inputQueued <= 3, `input backlog ${s.stats.inputQueued}`);
  assert.equal(s.stats.incidents, 0);
});

// ---- Determinism -----------------------------------------------------------

test("same level, seed and signal decisions give the same result", () => {
  const run = (seed) => {
    const s = TrafficSession.create(clone(level01), gameConfig, { seed });
    for (let i = 0; i < 30 * 120; i++) {
      if (i % 15 === 0) setGroups(s, ...(i % 900 < 450 ? [nsS, nsT, ewT] : [ewS]));
      s.tick();
    }
    const st = s.stats;
    return [st.spawned, st.completed, st.incidents, Math.round(st.avgWaitTime * 1000), s.vehicles().map((v) => `${v.id}:${Math.round(vs(v).s)}`).join(",")];
  };
  assert.deepEqual(run(5), run(5));
  assert.notDeepEqual(run(5), run(6));
});

test("gates draw from independent seeded streams", () => {
  const north = (level) => {
    const s = TrafficSession.create(level, gameConfig);
    setGroups(s, nsS, nsT, ewS, ewT);
    secs(s, 20);
    return s.entity("input_north").getComponent("InputGateComponent").arrived;
  };
  const trimmed = clone(level01);
  trimmed.inputGates = trimmed.inputGates.filter((g) => g.id !== "input_south");
  assert.equal(north(clone(level01)), north(trimmed), "removing another gate does not change this gate's traffic");
});

// ---- Mechanics -------------------------------------------------------------

test("following distance is kept and vehicles never overlap in a lane", () => {
  const s = TrafficSession.create(clone(level01), gameConfig, { demandScale: 2.5 });
  for (let i = 0; i < 30 * 90; i++) {
    if (i % 15 === 0) twoPhase(12, 3)(s, i / 30);
    s.tick();
    if (i % 5) continue;
    for (const e of s.entityManager.world) {
      const l = e.getComponent("LaneComponent");
      if (!l || l.kind === "connector") continue;
      for (let k = 1; k < l.vehicles.length; k++) {
        const gap = vs(l.vehicles[k - 1]).s - l.vehicles[k - 1].getComponent("VehicleComponent").length - vs(l.vehicles[k]).s;
        assert.ok(gap > -1, `overlap in ${e.id} at tick ${i}: gap ${gap}`);
      }
    }
  }
});

test("advance() ignores invalid frame times and accumulates real ones", () => {
  const s = quietSession();
  assert.equal(s.advance(undefined), 0);
  assert.equal(s.advance(NaN), 0);
  assert.equal(s.advance(1 / 60), 0, "half a tick is not enough");
  assert.equal(s.advance(1 / 60), 1, "second half completes a tick");
  s.setSpeed(4);
  assert.equal(s.advance(1 / 30), 4);
  s.setPaused(true);
  assert.equal(s.advance(1), 0);
});
