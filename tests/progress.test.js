import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { rateRun, nextTargets } from "../scripts/traffic/progress/rating.js";
import { Progression } from "../scripts/traffic/progress/Progression.js";
import { TrafficGame } from "../scripts/traffic/TrafficGame.js";
import { validateLevel } from "../scripts/traffic/level/validateLevel.js";
import { computeSignalControls } from "../scripts/traffic/view/signalControlLayout.js";
import { HudReadModel } from "../scripts/traffic/view/HudReadModel.js";
import { networkBalance } from "../scripts/traffic/util/networkBalance.js";
import { META } from "../tools/levelMeta.mjs";
import { memoryProvider, gameConfig, firstJunction, level01, clone, quietSession } from "./helpers/fixtures.js";
import { play, makeBot, withTow } from "../tools/botPlayers.mjs";

const ratings = { bronze: { time: 100 }, silver: { time: 200, score: 500 }, gold: { time: 300, score: 900, maxIncidents: 1 } };
const run = (o) => ({ status: "gridlock", time: 0, score: 0, earned: 0, avgMultiplier: 1, incidents: 0, ...o });

test("a medal needs every requirement listed for it", () => {
  assert.equal(rateRun(run({ time: 50 }), ratings), null);
  assert.equal(rateRun(run({ time: 120 }), ratings), "bronze");
  assert.equal(rateRun(run({ time: 250, score: 400 }), ratings), "bronze", "silver also needs the score");
  assert.equal(rateRun(run({ time: 250, score: 600 }), ratings), "silver");
  assert.equal(rateRun(run({ time: 300, score: 950, incidents: 2 }), ratings), "silver", "gold allows at most 1 crash");
  assert.equal(rateRun(run({ time: 300, score: 950, incidents: 1, status: "complete" }), ratings), "gold");
  assert.equal(rateRun(run({ time: 10, status: "complete" }), ratings), "bronze", "finishing the shift is never worse than bronze");
});

test("the result says what is missing for the next medal", () => {
  const t = nextTargets(run({ time: 250, score: 400 }), ratings, "bronze");
  assert.equal(t.medal, "silver");
  assert.deepEqual(t.missing.map((m) => m.key), ["score"]);
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
  r = p.record(metas[0], run({ time: 250, score: 600 }), metas);
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
  assert.ok(m.multiplier.value >= m.multiplier.min && m.multiplier.max > m.multiplier.min && m.congestion.value === 0 && m.tow.cost > 0);
});

const firstMap = shipped[0];
const botPhases = META[firstMap.id].botPhases;

test("first level pacing: the first map is under constant pressure, doing nothing fails fastest, bots (weaker than a human) last a few minutes", () => {
  const seeds = [1, 2, 3];
  const avg = (make) => seeds.map((seed) => play(firstMap, make(), { seed }).time).reduce((a, b) => a + b, 0) / seeds.length;
  const idle = avg(() => makeBot("idle", botPhases));
  const careful = avg(() => makeBot("greedy", botPhases));
  const charger = avg(() => makeBot("charger", botPhases));
  assert.ok(idle < 180, `idle ends before 3 min (${idle.toFixed(0)}s)`);
  assert.ok(careful > 120 && charger > 120, `sensible bots outlast idle play (${careful.toFixed(0)}s, ${charger.toFixed(0)}s)`);
  assert.ok(careful > idle);
});

test("the first map is physically large, with a single exit, and every level is tuned by gate data", () => {
  assert.ok(firstMap.map.width >= 2000 && firstMap.map.height >= 1400, "not a single crossroads on a small canvas");
  assert.ok(firstMap.junctions.length >= 3);
  assert.equal(firstMap.inputGates.length, 4);
  assert.equal(firstMap.outputGates.length, 1);
  assert.ok(firstMap.outputGates.every((g) => !g.outflowPerMinute), "the first exit is instant: cars vanish at the gate, no discharge cap");
  assert.ok(networkBalance(firstMap).pressure > 0.8, "the first map is pressured from the start: waiting does not win");
});

test("the first map escalates: demand climbs steeply, the gridlock window is short, and roadworks close links mid-shift", () => {
  const curve = firstMap.demandCurves.shift;
  assert.ok(curve.at(-1).rate >= 2 * curve[0].rate, "demand at least doubles over the shift");
  assert.ok(firstMap.gridlock.fullSeconds <= 6);
  assert.ok(firstMap.obstacles.length >= 3 && firstMap.obstacles.every((o) => o.kind === "roadworks" && o.at > 0));
});

test("level difficulty rises with the entry/exit ratio on the same network", () => {
  const byId = Object.fromEntries(shipped.map((l) => [l.id, l]));
  const [a, b, c] = ["city_balanced", "city_rush", "city_crunch"].map((id) => byId[id]);
  assert.deepEqual([a, b, c].map((l) => [l.inputGates.length, l.outputGates.length]), [[3, 3], [4, 3], [5, 3]]);
  assert.deepEqual(a.roads, c.roads, "identical road network");
  assert.deepEqual(a.junctions, c.junctions, "identical junctions");
  const p = [a, b, c].map((l) => networkBalance(l).pressure);
  assert.ok(p[0] < p[1] && p[1] < p[2], `pressure rises ${p.map((x) => x.toFixed(2))}`);
  assert.ok(p[0] < 0.8 && p[2] > 0.9);
});

test("network balance reports pressure from demand, exits and their capacity", () => {
  const nb = networkBalance(firstMap);
  assert.equal(nb.inputs, 4);
  assert.equal(nb.outputs, 1);
  assert.ok(nb.capacity > 0 && nb.demand > 0 && nb.exits.length === 1);
  const capped = structuredClone(firstMap);
  for (const g of capped.outputGates) g.outflowPerMinute = 6;
  assert.ok(networkBalance(capped).pressure > nb.pressure * 2, "tighter exits mean more pressure");
  const more = structuredClone(firstMap);
  more.inputGates[0].demand.scale = 3;
  assert.ok(networkBalance(more).demand > nb.demand);
});

test("the tow truck is a trade-off: an affordable tow shortens a crash, but cash is finite", () => {
  const phases = [["sg_n_straight","sg_n_turn"], ["sg_w_straight","sg_w_turn"]];
  const reckless = play(firstJunction, withTow(makeBot("reckless", phases)), { seed: 1, maxSeconds: 400 });
  assert.ok(reckless.towsUsed <= 1 + Math.floor(reckless.earned / gameConfig.simulation.interventions.tow.cost), "cannot tow more than the income pays for");
  assert.ok(reckless.status === "gridlock" || reckless.time >= 400);
});
