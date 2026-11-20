import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { rateRun, nextTargets } from "../scripts/traffic/progress/rating.js";
import { Progression } from "../scripts/traffic/progress/Progression.js";
import { TrafficGame } from "../scripts/traffic/TrafficGame.js";
import { validateLevel } from "../scripts/traffic/level/validateLevel.js";
import { computeSignalControls } from "../scripts/traffic/view/signalControlLayout.js";
import { HudReadModel } from "../scripts/traffic/view/HudReadModel.js";
import { memoryProvider, gameConfig, firstJunction, level01, clone, quietSession } from "./helpers/fixtures.js";
import { play, makeBot, withTow } from "../tools/botPlayers.mjs";

const ratings = { bronze: { time: 100 }, silver: { time: 200, earned: 500, flow: 2 }, gold: { time: 300, earned: 900, flow: 3, maxIncidents: 1 } };
const run = (o) => ({ status: "gridlock", time: 0, earned: 0, peakFlow: 1, incidents: 0, ...o });

test("a medal needs every requirement listed for it", () => {
  assert.equal(rateRun(run({ time: 50 }), ratings), null);
  assert.equal(rateRun(run({ time: 120 }), ratings), "bronze");
  assert.equal(rateRun(run({ time: 250, earned: 400, peakFlow: 5 }), ratings), "bronze", "silver also needs the cash");
  assert.equal(rateRun(run({ time: 250, earned: 600, peakFlow: 2 }), ratings), "silver");
  assert.equal(rateRun(run({ time: 300, earned: 950, peakFlow: 3, incidents: 2 }), ratings), "silver", "gold allows at most 1 crash");
  assert.equal(rateRun(run({ time: 300, earned: 950, peakFlow: 3, incidents: 1, status: "complete" }), ratings), "gold");
  assert.equal(rateRun(run({ time: 10, status: "complete" }), ratings), "bronze", "finishing the shift is never worse than bronze");
});

test("the result says what is missing for the next medal", () => {
  const t = nextTargets(run({ time: 250, earned: 400, peakFlow: 1 }), ratings, "bronze");
  assert.equal(t.medal, "silver");
  assert.deepEqual(t.missing.map((m) => m.key), ["earned", "flow"]);
  assert.equal(nextTargets(run({}), ratings, "gold").medal, null);
});

const metas = [
  { id: "a", name: "A", ratings, progression: {} },
  { id: "b", name: "B", ratings, progression: { unlock: { after: "a", medal: "silver" } } },
  { id: "c", name: "C", ratings, progression: { unlock: { after: "b" } } },
];
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test("maps unlock from medals, medals only improve, and progress persists", () => {
  const storage = memoryStorage();
  const p = new Progression(storage);
  assert.deepEqual([...p.unlockedIds(metas)], ["a"]);
  let r = p.record(metas[0], run({ time: 120 }), metas);
  assert.equal(r.medal, "bronze");
  assert.deepEqual(r.unlocked, [], "bronze is not enough for B");
  r = p.record(metas[0], run({ time: 250, earned: 600, peakFlow: 2 }), metas);
  assert.deepEqual(r.unlocked.map((m) => m.id), ["b"]);
  r = p.record(metas[0], run({ time: 120 }), metas);
  assert.equal(p.medal("a"), "silver", "a worse run never lowers a medal");
  assert.equal(r.improved, false);
  assert.equal(new Progression(storage).medal("a"), "silver", "reloaded from storage");
  assert.equal(new Progression(null).isUnlocked(metas[1]), false, "works without storage");
  assert.equal(new Progression({ getItem: () => "{not json", setItem() {} }).medal("a"), null, "corrupt storage is ignored");
});

test("TrafficGame rates a finished run, records it and reports the result once", async () => {
  const second = { ...clone(level01), progression: { unlock: { after: "first_junction", medal: "silver" } } };
  const provider = memoryProvider([firstJunction, second]);
  const progression = new Progression(memoryStorage());
  let reported = 0;
  const game = new TrafficGame({ provider, progression, hooks: { onLevelFinished: () => reported++ } });
  const l = clone(firstJunction);
  l.goal = { surviveSeconds: 4 };
  l.ratings = { bronze: { time: 1 } };
  provider.levels.first_junction = l;
  await game.launchLevel("first_junction");
  for (let i = 0; i < 40; i++) game.update(0.25);
  assert.equal(game.session.sim.status, "complete");
  assert.equal(reported, 1);
  assert.equal(game.lastResult.medal, "bronze");
  assert.equal(progression.medal("first_junction"), "bronze");
  const next = await game.loadNextLevel();
  assert.equal(next.level.id, "first_junction", "next map stays locked, so the same one restarts");
});

// ---- Shipped levels ----------------------------------------------------------

const dir = new URL("../data/levels/", import.meta.url);
const shipped = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8")).levels.map((e) => JSON.parse(readFileSync(new URL(e.file, dir), "utf8")));

test("every shipped level validates, has a goal and ratings, and the unlock chain is sound", () => {
  assert.equal(readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json").length, shipped.length, "every level file is in the manifest");
  const ids = new Set();
  for (const l of shipped) {
    const v = validateLevel(l, { vehicleTypes: gameConfig.vehicleTypes });
    assert.ok(v.valid, `${l.id}: ${JSON.stringify(v.errors)}`);
    assert.ok(l.goal?.surviveSeconds > 0 && l.ratings?.bronze && l.ratings?.gold, `${l.id} has a goal and ratings`);
    const u = l.progression.unlock;
    assert.ok(!u || ids.has(u.after), `${l.id} unlocks after an earlier level`);
    ids.add(l.id);
  }
  assert.equal(shipped[0].progression.unlock, undefined, "the first map is open");
  assert.equal(gameConfig.startLevel, shipped[0].id);
});

test("the teaching level: 2 inputs, one junction, a straight and a right-turn lane per input", () => {
  assert.equal(firstJunction.inputGates.length, 2);
  assert.equal(firstJunction.junctions.length, 1);
  const turns = firstJunction.junctions[0].movements.map((m) => m.turn).sort();
  assert.deepEqual(turns, ["right", "right", "straight", "straight"]);
  assert.equal(computeSignalControls(firstJunction).length, 4, "one control per movement");
  const s = quietSession(firstJunction);
  assert.equal(s.sim.status, "running");
  const m = new HudReadModel(s).read();
  assert.equal(m.streams.length, 4);
  assert.ok(m.flow.steps === gameConfig.simulation.flow.steps.length && m.tow.cost > 0);
});

test("first level pacing: doing nothing fails early, sensible play lasts the target 8-12 minutes", () => {
  const level = firstJunction;
  const phases = [["sg_n_straight","sg_n_turn"], ["sg_w_straight","sg_w_turn"]];
  const seeds = [1, 2, 3];
  const avg = (make) => seeds.map((seed) => play(level, make(), { seed }).time).reduce((a, b) => a + b, 0) / seeds.length;
  const idle = avg(() => makeBot("idle", phases));
  const careful = avg(() => makeBot("greedy", phases));
  const charger = avg(() => makeBot("charger", phases));
  assert.ok(idle < 360, `idle ends before 6 min (${idle.toFixed(0)}s)`);
  assert.ok(careful > 480 && charger > 480, `sensible bots last past 8 min (${careful.toFixed(0)}s, ${charger.toFixed(0)}s)`);
  assert.ok(careful > idle + 180);
});

test("holding and releasing earns more than keeping everything green (the risk/reward is real)", () => {
  const phases = [["sg_n_straight","sg_n_turn"], ["sg_w_straight","sg_w_turn"]];
  const sum = (make) => [1, 2, 3].reduce((a, seed) => a + play(firstJunction, make(), { seed, maxSeconds: 420 }).earned, 0);
  assert.ok(sum(() => makeBot("charger", phases)) > sum(() => makeBot("greedy", phases)) * 1.15);
});

test("the tow truck is a trade-off: an affordable tow shortens a crash, but cash is finite", () => {
  const phases = [["sg_n_straight","sg_n_turn"], ["sg_w_straight","sg_w_turn"]];
  const reckless = play(firstJunction, withTow(makeBot("reckless", phases)), { seed: 1, maxSeconds: 400 });
  assert.ok(reckless.towsUsed <= 1 + Math.floor(reckless.earned / gameConfig.simulation.interventions.tow.cost), "cannot tow more than the income pays for");
  assert.ok(reckless.status === "gridlock" || reckless.time >= 400);
});
