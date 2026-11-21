import { test } from "node:test";
import assert from "node:assert/strict";
import { quietSession, spawnVehicle, runUntil, car, setGroups, GROUPS, firstJunction, level01, gameConfig, clone } from "./helpers/fixtures.js";
import { riskBand, laneCapacity } from "../scripts/traffic/util/pressureMath.js";
import { contribution, releaseGain, incomeMultiplier } from "../scripts/traffic/util/satisfactionMath.js";

const sat = gameConfig.simulation.satisfaction;
const mult = gameConfig.simulation.multiplier;
const secs = (s, n) => s.step(Math.round(n * s.sim.tickRate));
const noIncome = (level) => ({ ...clone(level), economy: { incomePerSecond: 0, startCash: 0 } });
const fj = (level = firstJunction) => quietSession(level);
const streamN = (s) => s.streams.streams.find((x) => x.id === "sg_n_straight@lane_n_in_0");

// Holds the north approach on red, queues `n` cars at its line, returns once they are stopped.
function charge(s, n, { gap = 1.6 } = {}) {
  s.setSignal("sg_n_straight", false);
  secs(s, 3);
  for (let i = 0; i < n; i++) {
    spawnVehicle(s, "input_north", "route_n_straight");
    secs(s, gap);
  }
  assert.ok(runUntil(s, () => streamN(s).queue === n, 40), `${n} cars queued`);
}
// Releases the held queue and returns the biggest recent gain seen while it clears.
function release(s, n) {
  const done = s.stats.completed + n;
  s.setSignal("sg_n_straight", true);
  let peak = 0;
  assert.ok(runUntil(s, () => (peak = Math.max(peak, s.stats.satRecent)) >= 0 && s.stats.completed >= done, 40), "everything gets through");
  return peak;
}

// ---- The maths ----------------------------------------------------------------

test("waiting contributes nothing inside the grace period, then more the longer it goes", () => {
  assert.equal(contribution(0, sat), 0);
  assert.equal(contribution(sat.grace, sat), 0);
  const a = contribution(8, sat), b = contribution(16, sat), c = contribution(30, sat);
  assert.ok(0 < a && a < b && b < c, `${a} < ${b} < ${c}`);
  assert.equal(contribution(500, sat), 1, "capped, so one ancient car cannot dominate");
});

test("a longer wait is worth disproportionately more when it ends", () => {
  assert.equal(releaseGain(1, sat), 0, "no reward for a car that barely stopped");
  const g2 = releaseGain(2, sat), g8 = releaseGain(8, sat), g20 = releaseGain(20, sat);
  assert.ok(g2 < g8 && g8 < g20);
  assert.ok(g20 > g8 * 2.5, "faster than linear in the wait");
  assert.equal(releaseGain(1000, sat), releaseGain(sat.fullWait * 1.5, sat), "capped");
});

test("the income multiplier is a straight line over the satisfaction range", () => {
  assert.equal(incomeMultiplier(0, mult), mult.min);
  assert.equal(incomeMultiplier(1, mult), mult.max);
  assert.ok(Math.abs(incomeMultiplier(0.9, mult) - 1.825) < 1e-9);
});

// ---- The simulation -----------------------------------------------------------

test("waiting cars lower satisfaction gradually; a quiet network sits at rest", () => {
  const quiet = fj();
  secs(quiet, 40);
  assert.ok(Math.abs(quiet.stats.satisfaction - sat.rest) < 0.01, "nothing waiting: stays at the resting level");

  const s = fj();
  charge(s, 6);
  const early = s.stats.satisfaction;
  secs(s, 12);
  const mid = s.stats.satisfaction;
  secs(s, 25);
  const late = s.stats.satisfaction;
  assert.ok(early > mid && mid > late, `falls as the wait grows: ${early} > ${mid} > ${late}`);
  assert.ok(s.stats.satWaiting >= 5, "the waiting cars are what the HUD reports");
  assert.ok(s.stats.satDrain > 0);
});

test("a short stop barely matters", () => {
  const s = fj();
  s.setSignal("sg_n_straight", false);
  secs(s, 3);
  spawnVehicle(s, "input_north", "route_n_straight");
  secs(s, 6); // stopped for only a few seconds
  s.setSignal("sg_n_straight", true);
  assert.ok(s.stats.satisfaction > sat.rest - 0.03, `${s.stats.satisfaction}`);
});

test("the drain saturates: a queue twice as long is not twice as bad", () => {
  const drainFor = (n) => {
    const s = fj();
    charge(s, n, { gap: 1.2 });
    secs(s, 40);
    return s.stats.satDrain;
  };
  const six = drainFor(6), twelve = drainFor(12);
  assert.ok(twelve > six, "more waiting is worse");
  assert.ok(twelve < six * 1.8, `but not catastrophically so (${six} vs ${twelve})`);
});

test("releasing a long-held queue lifts satisfaction, over time, not all at once", () => {
  const s = fj();
  charge(s, 6);
  secs(s, 25);
  const low = s.stats.satisfaction;
  s.setSignal("sg_n_straight", true);
  assert.ok(runUntil(s, () => s.stats.satRecent > 0, 10), "the first car entering the junction is a release");
  assert.ok(s.stats.satPool > 0, "release gain is banked");
  assert.ok(s.stats.satisfaction - low < 0.05, "it does not jump");
  assert.ok(runUntil(s, () => s.stats.completed === 6, 40));
  secs(s, 4);
  assert.ok(s.stats.satisfaction > low + 0.1, `recovered ${low} -> ${s.stats.satisfaction}`);
  assert.ok(s.stats.satisfaction < 1);
});

test("the longer the wait, the bigger the release; a queue beats a single car", () => {
  const surge = (holdSeconds, n) => {
    const s = fj();
    charge(s, n);
    secs(s, holdSeconds);
    return release(s, n);
  };
  assert.ok(surge(20, 6) > surge(4, 6) * 2, "waiting longer pays more");
  assert.ok(surge(15, 6) > surge(15, 1) * 3, "a big release feels bigger than one car");
});

test("creeping forward in a queue is not farmable: only one payout per wait", () => {
  const s = fj();
  charge(s, 6);
  secs(s, 20);
  release(s, 6);
  secs(s, 20);
  const after = s.stats.satisfaction;
  assert.ok(after <= sat.rest + 0.45, `a single release cannot exceed what 6 cars are worth (${after})`);
  assert.ok(Math.abs(s.stats.satRecent) < 0.02, "and nothing keeps paying afterwards");
});

test("satisfaction fades back to rest after a surge", () => {
  const s = fj();
  s.satisfaction.value = 0.95;
  secs(s, 120);
  assert.ok(s.stats.satisfaction < sat.rest + 0.05);
});

test("satisfaction 0 is not a failure: the multiplier collapses and the player can recover", () => {
  const s = fj();
  s.satisfaction.value = 0;
  s.step(2);
  assert.equal(s.sim.status, "running");
  assert.ok(Math.abs(s.stats.satMultiplier - mult.min) < 0.01);
  secs(s, 60);
  assert.ok(s.stats.satisfaction > 0.3, "it climbs back toward rest on its own once traffic moves");
  assert.equal(s.sim.status, "running");
});

test("a crash drags satisfaction down: the stuck cars keep waiting", () => {
  const s = quietSession(level01);
  setGroups(s, GROUPS.nsS, GROUPS.ewS);
  car(s, "e", "straight");
  s.step(70);
  car(s, "n", "straight");
  assert.ok(runUntil(s, () => s.stats.incidents > 0, 20));
  secs(s, 12);
  assert.ok(s.stats.satWaiting >= 2, `${s.stats.satWaiting}`);
});

// ---- Income -------------------------------------------------------------------

test("funds accrue continuously at base income x the satisfaction multiplier", () => {
  const s = fj();
  const base = gameConfig.simulation.economy.incomePerSecond;
  const start = s.stats.cash;
  s.satisfaction.value = 0.9;
  s.step(1);
  assert.ok(Math.abs(s.stats.incomeRate - base * incomeMultiplier(0.9, mult)) < 0.2, `${s.stats.incomeRate}`);
  secs(s, 10);
  assert.ok(s.stats.cash - start > base * 10 * 0.9, "paid out continuously, with no vehicle needed");
  assert.equal(s.stats.completed, 0);
});

test("better satisfaction earns faster than worse", () => {
  const earn = (v) => {
    const s = fj();
    s.stats.cash = 0;
    s.satisfaction.value = v;
    s.satisfaction.cfg.rest = v; // hold the level so the comparison is clean
    secs(s, 20);
    return s.stats.cash;
  };
  assert.ok(earn(0.9) > earn(0.5) * 1.3);
  assert.ok(earn(0.5) > earn(0.1) * 1.5);
});

test("a vehicle reaching an exit pays nothing by itself", () => {
  const s = fj(noIncome(firstJunction));
  s.setSignal("sg_n_straight", true);
  spawnVehicle(s, "input_north", "route_n_straight");
  assert.ok(runUntil(s, () => s.stats.completed === 1, 30));
  assert.equal(s.stats.cash, 0);
  assert.equal(s.stats.earned, 0);
});

// ---- Streams (pressure, still measured) ------------------------------------------

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

test("a stream reports how long its queue has waited and what releasing it is worth", () => {
  const s = fj();
  charge(s, 5);
  const early = streamN(s).gain;
  secs(s, 20);
  const st = streamN(s);
  assert.ok(st.waitAvg > 15 && st.waitMax >= st.waitAvg);
  assert.ok(st.gain > early * 2, `${st.gain} vs ${early}`);
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
    return JSON.stringify([s.stats.cash, s.stats.completed, s.stats.incidents, s.stats.satisfaction, s.sim.tick]);
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
