import { test } from "node:test";
import assert from "node:assert/strict";
import { quietSession, spawnVehicle, runUntil, car, setGroups, GROUPS, firstJunction, level01, gameConfig, clone, group } from "./helpers/fixtures.js";
import { TrafficEvents } from "../scripts/traffic/TrafficEvents.js";
import { burstMultiplier, riskBand, laneCapacity } from "../scripts/traffic/util/flowMath.js";
import { LightState } from "../scripts/components/traffic/SignalGroupComponent.js";

const fj = () => quietSession(firstJunction);
const base = gameConfig.simulation.economy.perVehicle;
const flowCfg = gameConfig.simulation.flow;
const secs = (s, n) => s.step(Math.round(n * s.sim.tickRate));

// Holds the north approach on red, queues `n` cars at its line, returns once they are stopped.
function charge(s, n, { gap = 1.6 } = {}) {
  s.setSignal("sg_n_straight", false);
  secs(s, 3);
  for (let i = 0; i < n; i++) {
    spawnVehicle(s, "input_north", "route_n_straight");
    secs(s, gap);
  }
  assert.ok(runUntil(s, () => s.flow.streams.find((x) => x.id === "sg_n_straight@lane_n_in_0").queue === n, 40), `${n} cars queued`);
}
const streamN = (s) => s.flow.streams.find((x) => x.id === "sg_n_straight@lane_n_in_0");

test("burst and risk are derived from lane capacity, not fixed car counts", () => {
  assert.equal(burstMultiplier(2, 20, flowCfg), 1, "below minQueue: no burst");
  assert.ok(burstMultiplier(8, 20, flowCfg) < burstMultiplier(12, 20, flowCfg));
  assert.ok(burstMultiplier(12, 20, flowCfg) < burstMultiplier(18, 20, flowCfg));
  assert.ok(burstMultiplier(8, 10, flowCfg) > burstMultiplier(8, 20, flowCfg), "the same queue is worth more on a shorter lane that it nearly fills");
  assert.equal(riskBand(0.1, flowCfg.riskBands), 0);
  assert.equal(riskBand(0.95, flowCfg.riskBands), 3);
  const s = fj();
  const cap = (id) => s.flow.streams.find((x) => x.id === id).capacity;
  const caps = [cap("sg_n_straight@lane_n_in_0"), cap("sg_w_straight@lane_w_in_0")];
  assert.ok(caps[0] >= 6 && caps[1] > caps[0] * 1.5, `the short north arm holds less than the long west arm (${caps})`);
});

test("one stream per signal group and approach lane, keyed like the world controls", () => {
  const s = fj();
  assert.deepEqual(s.flow.streams.map((x) => x.id).sort(), ["sg_n_straight@lane_n_in_0", "sg_n_turn@lane_n_in_1", "sg_w_straight@lane_w_in_0", "sg_w_turn@lane_w_in_1"]);
  const big = quietSession(level01);
  assert.equal(big.flow.streams.length, 8);
});

test("a held queue pays more per car than the same cars trickling through", () => {
  const held = fj();
  charge(held, 6);
  assert.equal(streamN(held).queue, 6);
  assert.ok(streamN(held).multiplier > 1 && streamN(held).potential > 6 * base, "potential reward is visible while charging");
  const start = held.stats.earned;
  held.setSignal("sg_n_straight", true);
  assert.ok(runUntil(held, () => held.stats.completed === 6, 40), "all six get through");
  const heldCash = held.stats.earned - start;

  const trickle = fj();
  for (let i = 0; i < 6; i++) {
    spawnVehicle(trickle, "input_north", "route_n_straight");
    secs(trickle, 6);
  }
  assert.ok(runUntil(trickle, () => trickle.stats.completed === 6, 40));
  assert.equal(trickle.stats.earned, 6 * base, "unheld traffic pays the plain rate");
  assert.ok(heldCash > 6 * base * 1.2, `released queue pays more (${heldCash} vs ${6 * base})`);
  assert.equal(held.stats.releases, 1);
});

test("a clean release of a real charge advances the Flow chain; a tiny one does not", () => {
  const s = fj();
  charge(s, 6);
  s.setSignal("sg_n_straight", true);
  assert.ok(runUntil(s, () => s.stats.cleanReleases === 1, 40));
  assert.equal(s.flow.chain.index, 1);
  assert.equal(s.stats.flowMultiplier, flowCfg.steps[1]);

  const small = fj();
  charge(small, 3);
  small.setSignal("sg_n_straight", true);
  assert.ok(runUntil(small, () => small.stats.completed === 3, 40));
  assert.equal(small.flow.chain.index, 0, "3 cars is under the chain threshold for this lane");
});

test("the next release is worth more once the chain has grown", () => {
  const s = fj();
  charge(s, 6);
  const first = streamN(s).potential;
  s.setSignal("sg_n_straight", true);
  assert.ok(runUntil(s, () => s.stats.cleanReleases === 1, 40));
  s.setSignal("sg_n_straight", false);
  secs(s, 4);
  charge(s, 6);
  assert.ok(streamN(s).potential > first * 1.5, `chained: ${streamN(s).potential} vs ${first}`);
});

test("an incident breaks the chain; the chain also decays when left idle", () => {
  const s = fj();
  charge(s, 6);
  s.setSignal("sg_n_straight", true);
  assert.ok(runUntil(s, () => s.flow.chain.index === 1, 40));
  let broken = null;
  s.events.on(TrafficEvents.FLOW_BROKEN, (r) => (broken = r));
  s.events.emit(TrafficEvents.INCIDENT);
  assert.equal(s.flow.chain.index, 0);
  assert.equal(broken, "incident");

  const idle = fj();
  idle.flow.chain.index = 2;
  idle.flow.chain.timer = flowCfg.chainSeconds;
  secs(idle, flowCfg.chainSeconds + 1);
  assert.equal(idle.flow.chain.index, 1, "one step lost to the timer");
});

test("cars lost to a crash earn nothing and the release is poor", () => {
  const s = quietSession(level01);
  setGroups(s, GROUPS.nsS, GROUPS.ewS);
  car(s, "e", "straight");
  s.step(70);
  car(s, "n", "straight");
  assert.ok(runUntil(s, () => s.stats.incidents > 0, 20));
  assert.equal(s.stats.earned, 0, "wrecks pay nothing");
  assert.equal(s.flow.chain.index, 0);
});

test("a full input queue breaks the chain", () => {
  const s = fj();
  s.flow.chain.index = 3;
  s.flow.chain.timer = 99;
  const gate = s.entity("input_north").getComponent("InputGateComponent");
  gate.queueCapacity = 0; // the spawn system would drain a real queue within a tick; a zero-size buffer is "full" by definition
  s.step(2);
  assert.equal(s.flow.chain.index, 0);
});

test("a stream blocked by an incident reports risk and pays no potential", () => {
  const level = clone(firstJunction);
  level.obstacles = [{ id: "closure", kind: "roadworks", at: 0, duration: 600, blockedLanes: ["lane_s_out"] }];
  const s = quietSession(level);
  s.setSignal("sg_n_straight", false);
  secs(s, 3);
  for (let i = 0; i < 4; i++) {
    spawnVehicle(s, "input_north", "route_n_straight");
    secs(s, 1.6);
  }
  secs(s, 10);
  s.step(2);
  assert.equal(streamN(s).blocked, false, "approach lane is not itself closed");
  s.setSignal("sg_n_straight", true);
  secs(s, 25);
  assert.equal(s.stats.completed, 0, "nothing gets through the closure");
  assert.equal(s.stats.earned, 0, "and nothing is paid");
});

// ---- Cash and the tow truck -------------------------------------------------

function crash() {
  const s = quietSession(level01);
  setGroups(s, GROUPS.nsS, GROUPS.ewS);
  car(s, "e", "straight");
  s.step(70);
  car(s, "n", "straight");
  assert.ok(runUntil(s, () => s.stats.incidents > 0, 20));
  s.step(2);
  return s;
}
const incident = (s) => s.interventions.obstacleHelper.entities[0];

test("the tow truck costs cash, clears the crash early and then has to recover", () => {
  const s = crash();
  const o = incident(s);
  const cost = gameConfig.simulation.interventions.tow.cost;
  s.stats.cash = cost + 10;
  assert.equal(s.interventions.refusal("tow", o.id), null);
  s.intervene("tow", o.id);
  s.step(1);
  assert.equal(s.stats.cash, 10, "cash spent");
  assert.equal(s.stats.towsUsed, 1);
  assert.ok(o.getComponent("ObstacleComponent").towed);
  assert.ok(runUntil(s, () => s.interventions.obstacleHelper.entities.length === 0, gameConfig.simulation.interventions.tow.delay + 2), "cleared within the tow delay, far sooner than the full timer");
  const d = s.interventions.describe("tow");
  assert.ok(d.cost > cost, "the next tow costs more");
  assert.ok(d.cooldownLeft > 0 && !d.ready);
});

test("the tow truck is refused without cash, twice on one crash, or without a crash", () => {
  const s = crash();
  const o = incident(s);
  s.stats.cash = 0;
  assert.equal(s.interventions.refusal("tow", o.id), "not enough cash");
  s.intervene("tow", o.id);
  s.step(1);
  assert.equal(s.stats.towsUsed, 0, "refused commands do nothing");
  s.stats.cash = 1000;
  s.intervene("tow", o.id);
  s.step(1);
  assert.equal(s.interventions.refusal("tow", o.id), "tow already on the way");
  assert.equal(s.interventions.refusal("tow", "obstacle_999"), "no such incident");
  const before = s.stats.cash;
  s.intervene("tow", o.id);
  s.step(1);
  assert.equal(s.stats.cash, before, "no second charge");
});

test("towing is deterministic: same seed, same commands, same result", () => {
  const run = () => {
    const s = crash();
    s.stats.cash = 500;
    s.intervene("tow", incident(s).id);
    s.step(200);
    return JSON.stringify([s.stats.cash, s.stats.completed, s.stats.incidents, s.tick, s.sim.tick]);
  };
  assert.equal(run(), run());
});

test("starting cash and goal come from config/level, and surviving the shift completes the level", () => {
  const s = fj();
  assert.equal(s.stats.cash, gameConfig.simulation.economy.startCash);
  const level = clone(firstJunction);
  level.goal = { surviveSeconds: 5 };
  const short = quietSession(level);
  secs(short, 6);
  assert.equal(short.sim.status, "complete");
  assert.ok(short.gameOver);
  assert.equal(short.summary().status, "complete");
});
