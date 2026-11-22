import { test } from "node:test";
import assert from "node:assert/strict";
import { quietSession, spawnVehicle, runUntil, car, setGroups, GROUPS, firstJunction, level01, gameConfig, clone } from "./helpers/fixtures.js";
import { riskBand, laneCapacity } from "../scripts/traffic/util/pressureMath.js";
import { targetMultiplier } from "../scripts/traffic/util/multiplierMath.js";
import { TrafficEvents } from "../scripts/traffic/TrafficEvents.js";

// The economy: exits pay base x multiplier, congestion sets the multiplier, gridlock is the only failure.
const eco = gameConfig.simulation.economy;
const scoring = gameConfig.simulation.scoring;
const mult = gameConfig.simulation.multiplier;
const secs = (s, n) => s.step(Math.round(n * s.sim.tickRate));
const noIncome = (level) => ({ ...clone(level), economy: { cashPerVehicle: 0, startCash: 0 } });
const fixedMultiplier = (level, x) => ({ ...clone(level), multiplier: { min: x, max: x } });
const fj = (level = firstJunction) => quietSession(level);
const streamN = (s) => s.streams.streams.find((x) => x.id === "sg_n_straight@lane_n_in_0");

// Holds the north approach on red and queues `n` cars at its line, returns once they are stopped.
function charge(s, n, { gap = 1.6 } = {}) {
  s.setSignal("sg_n_straight", false);
  secs(s, 3);
  for (let i = 0; i < n; i++) {
    spawnVehicle(s, "input_north", "route_n_straight");
    secs(s, gap);
  }
  assert.ok(runUntil(s, () => streamN(s).queue === n, 40), `${n} cars queued`);
}

// ---- The multiplier -----------------------------------------------------------

test("congestion points the multiplier along a straight line from max (calm) to min (jammed)", () => {
  assert.equal(targetMultiplier(0, mult), mult.max);
  assert.equal(targetMultiplier(mult.calm, mult), mult.max);
  assert.equal(targetMultiplier(mult.jam, mult), mult.min);
  assert.equal(targetMultiplier(1, mult), mult.min);
  const mid = targetMultiplier((mult.calm + mult.jam) / 2, mult);
  assert.ok(Math.abs(mid - (mult.min + mult.max) / 2) < 1e-9);
});

test("congestion is the pressure of the most backed-up stream", () => {
  const s = fj();
  s.step(2);
  assert.equal(s.stats.congestion, 0);
  assert.equal(s.stats.congestionStream, null);
  charge(s, 5);
  const worst = Math.max(...s.streams.streams.map((x) => x.pressure));
  assert.ok(worst > 0.3);
  assert.equal(s.stats.congestion, Math.min(1, worst));
  assert.equal(s.stats.congestionStream, streamN(s).id, "names the road that is backing up");
});

test("the multiplier starts at the floor, and a network that never backs up earns no climb", () => {
  const s = fj();
  secs(s, 120);
  assert.equal(s.stats.multiplier, mult.min);
  assert.equal(s.stats.completed, 0);
});

test("the multiplier only rises when congestion falls, and in small steps", () => {
  const s = fj();
  charge(s, 6);
  const held = s.stats.multiplier;
  secs(s, 20);
  assert.ok(s.stats.multiplier <= held + 1e-9, "standing congestion earns nothing");
  s.setSignal("sg_n_straight", true);
  let last = s.stats.multiplier;
  let biggest = 0;
  let rose = false;
  assert.ok(runUntil(s, () => {
    biggest = Math.max(biggest, s.stats.multiplier - last);
    rose = rose || s.stats.multiplier > last + 1e-9;
    last = s.stats.multiplier;
    return s.stats.congestion === 0;
  }, 60));
  secs(s, 10);
  assert.ok(rose, "clearing the queue raises it");
  assert.ok(biggest < 0.01, `no jumps (biggest tick step ${biggest})`);
  assert.ok(s.stats.multiplier < mult.min + 1, "one queue cleared is a small gain, nowhere near x3");
});

test("building a queue lowers an earned multiplier at once", () => {
  const s = fj({ ...clone(firstJunction), multiplier: { calm: 0.05, jam: 0.3 } });
  s.stats.multiplier = 4;
  charge(s, 5);
  secs(s, 10);
  assert.ok(s.stats.multiplier < 2.5, `${s.stats.multiplier}`);
  assert.ok(s.stats.multiplier >= mult.min - 1e-9);
  assert.equal(s.sim.status, "running");
});

test("rises are slower than falls, so building and clearing a queue repeatedly does not farm it", () => {
  assert.ok(mult.riseGain > mult.fallGain, "clearing is rewarded...");
  const s = fj();
  s.stats.multiplier = 3;
  for (let i = 0; i < 3; i++) {
    charge(s, 4);
    s.setSignal("sg_n_straight", true);
    assert.ok(runUntil(s, () => s.stats.congestion === 0, 60));
    secs(s, 8);
  }
  assert.ok(s.stats.multiplier < 3.5, `${s.stats.multiplier}`);
});

test("a multiplier at its floor is not a failure: only gridlock ends the level", () => {
  const s = fj({ ...clone(firstJunction), multiplier: { calm: 0.05, jam: 0.1 } }); // any queue is a jam
  charge(s, 4);
  secs(s, 30);
  assert.ok(s.stats.multiplier < mult.min + 0.2, `at the floor (${s.stats.multiplier})`);
  assert.equal(s.sim.status, "running");
  assert.ok(s.stats.multiplier >= mult.min - 1e-9);
});

// ---- Exits are the reward -----------------------------------------------------

test("a vehicle reaching an exit pays base points and cash times the current multiplier", () => {
  const s = fj(fixedMultiplier(firstJunction, 4));
  const rewards = [];
  s.events.on(TrafficEvents.VEHICLE_COMPLETED, (v, gate, reward) => rewards.push(reward));
  s.setSignal("sg_n_straight", true);
  spawnVehicle(s, "input_north", "route_n_straight");
  assert.ok(runUntil(s, () => s.stats.completed === 1, 30));
  assert.equal(rewards.length, 1);
  assert.equal(rewards[0].multiplier, 4);
  assert.equal(rewards[0].points, scoring.perVehicle * 4);
  assert.equal(rewards[0].cash, eco.cashPerVehicle * 4);
  assert.equal(s.stats.score, scoring.perVehicle * 4);
  assert.equal(s.stats.cash, eco.startCash + eco.cashPerVehicle * 4);
  assert.equal(s.stats.earned, eco.cashPerVehicle * 4);
});

test("the same exit is worth more at a higher multiplier", () => {
  const pay = (x) => {
    const s = fj(fixedMultiplier(firstJunction, x));
    s.setSignal("sg_n_straight", true);
    spawnVehicle(s, "input_north", "route_n_straight");
    assert.ok(runUntil(s, () => s.stats.completed === 1, 30));
    return s.stats.score;
  };
  assert.equal(pay(5), pay(1) * 5);
});

test("nothing is earned without an exit: no passive income, no payment for queues", () => {
  const s = fj();
  secs(s, 30);
  assert.equal(s.stats.cash, eco.startCash);
  assert.equal(s.stats.score, 0);
  charge(s, 5);
  secs(s, 20);
  assert.equal(s.stats.completed, 0);
  assert.equal(s.stats.cash, eco.startCash, "holding traffic pays nothing");
  assert.equal(s.stats.score, 0);
});

test("a held queue is worth no more when it is released than the same cars arriving freely", () => {
  const pay = (hold) => {
    const s = fj(fixedMultiplier(firstJunction, 3));
    if (hold) {
      charge(s, 5);
      secs(s, 25);
      s.setSignal("sg_n_straight", true);
    } else s.setSignal("sg_n_straight", true);
    for (let i = 0; !hold && i < 5; i++) {
      spawnVehicle(s, "input_north", "route_n_straight");
      secs(s, 1.6);
    }
    assert.ok(runUntil(s, () => s.stats.completed === 5, 60));
    return s.stats.score;
  };
  assert.equal(pay(true), pay(false), "the reward is per exit at the multiplier; there is no release bonus");
});

// ---- Streams (pressure) -------------------------------------------------------

test("risk is derived from lane capacity, not fixed car counts", () => {
  const bands = gameConfig.simulation.pressure.riskBands;
  assert.equal(riskBand(0.1, bands), 0);
  assert.equal(riskBand(0.95, bands), 3);
  const s = fj();
  const cap = (id) => s.streams.streams.find((x) => x.id === id).capacity;
  const caps = [cap("sg_n_straight@lane_n_in_0"), cap("sg_w_straight@lane_w_in_0")];
  assert.ok(caps[0] >= 6 && caps[1] > caps[0] * 1.5, `the short north arm holds less than the long west arm (${caps})`);
  assert.ok(laneCapacity(400, [{ typeId: "car", weight: 1 }], gameConfig.vehicleTypes) > 5);
});

test("one stream per signal group and approach lane, keyed like the world controls", () => {
  assert.deepEqual(fj().streams.streams.map((x) => x.id).sort(), ["sg_n_straight@lane_n_in_0", "sg_n_turn@lane_n_in_1", "sg_w_straight@lane_w_in_0", "sg_w_turn@lane_w_in_1"]);
  assert.equal(quietSession(level01).streams.streams.length, 8);
});

test("a stream blocked by an incident offers no recovery", () => {
  const level = noIncome(firstJunction);
  level.obstacles = [{ id: "closure", kind: "roadworks", at: 0, duration: 600, blockedLanes: ["lane_s_out"] }];
  const s = quietSession(level);
  s.setSignal("sg_n_straight", false);
  secs(s, 3);
  for (let i = 0; i < 4; i++) {
    spawnVehicle(s, "input_north", "route_n_straight");
    secs(s, 1.6);
  }
  secs(s, 10);
  s.setSignal("sg_n_straight", true);
  secs(s, 25);
  assert.equal(s.stats.completed, 0, "nothing gets through the closure");
});

// ---- Cash and the tow truck -------------------------------------------------

function crash() {
  const s = quietSession(noIncome(level01));
  setGroups(s, GROUPS.nsS, GROUPS.ewS);
  car(s, "e", "straight");
  s.step(70);
  car(s, "n", "straight");
  assert.ok(runUntil(s, () => s.stats.incidents > 0, 20));
  s.step(2);
  return s;
}
const incident = (s) => s.interventions.obstacleHelper.entities[0];

test("the tow truck costs funds, clears the crash early and then has to recover", () => {
  const s = crash();
  const o = incident(s);
  const cost = gameConfig.simulation.interventions.tow.cost;
  s.stats.cash = cost + 10;
  assert.equal(s.interventions.refusal("tow", o.id), null);
  s.intervene("tow", o.id);
  s.step(1);
  assert.equal(s.stats.cash, 10, "funds spent, and nothing refunded");
  assert.equal(s.stats.towsUsed, 1);
  assert.ok(o.getComponent("ObstacleComponent").towed);
  assert.ok(runUntil(s, () => s.interventions.obstacleHelper.entities.length === 0, gameConfig.simulation.interventions.tow.delay + 2), "cleared within the tow delay, far sooner than the full timer");
  assert.equal(s.stats.cash, 10);
  const d = s.interventions.describe("tow");
  assert.ok(d.cost > cost, "the next tow costs more");
  assert.ok(d.cooldownLeft > 0 && !d.ready);
});

test("the tow truck is refused without funds, twice on one crash, or without a crash", () => {
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

test("the simulation is deterministic: same seed, same commands, same result", () => {
  const run = () => {
    const s = crash();
    s.stats.cash = 500;
    s.intervene("tow", incident(s).id);
    s.step(200);
    return JSON.stringify([s.stats.cash, s.stats.completed, s.stats.incidents, s.stats.multiplier, s.sim.tick]);
  };
  assert.equal(run(), run());
});

test("starting funds and goal come from config/level, and surviving the shift completes the level", () => {
  const s = fj();
  assert.equal(s.stats.cash, gameConfig.simulation.economy.startCash, "starts with the configured funds");
  const level = clone(firstJunction);
  level.goal = { surviveSeconds: 5 };
  const short = quietSession(level);
  secs(short, 6);
  assert.equal(short.sim.status, "complete");
  assert.ok(short.gameOver);
  assert.equal(short.summary().status, "complete");
});
