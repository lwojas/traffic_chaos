import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceLocator } from "../scripts/services/ServiceLocator.js";
import { TrafficGame } from "../scripts/traffic/TrafficGame.js";
import { RemoteDataProvider } from "../scripts/services/data/RemoteDataProvider.js";
import { LocalJsonProvider } from "../scripts/services/data/LocalJsonProvider.js";
import { LevelValidationError } from "../scripts/traffic/level/validateLevel.js";
import { memoryProvider, firstJunction, level01, clone, gameConfig, setGroups, GROUPS } from "./helpers/fixtures.js";

// A second level for tests that switch levels: same data under another id
const level02 = { ...clone(level01), id: "network_02", name: "Second Network" };

const makeGame = (provider = memoryProvider([level01, level02]), hooks = {}) => new TrafficGame({ provider, hooks });

test("registry enumerates levels and launches by id", async () => {
  const game = makeGame();
  await game.boot();
  assert.deepEqual(game.registry.list().map((l) => l.id), ["network_01", "network_02"]);
  const s = await game.launchLevel("network_02");
  assert.equal(s.level.id, "network_02");
  assert.equal(game.status, "playing");
});

test("unknown level id gives a useful error", async () => {
  const game = makeGame();
  await game.boot();
  await assert.rejects(game.launchLevel("nope"), /Unknown level "nope"/);
  assert.equal(game.status, "error");
});

test("invalid level data fails at the boundary with a readable error", async () => {
  const bad = clone(level01);
  bad.junctions[0].movements[0].to = "ghost_lane";
  const game = makeGame(memoryProvider([bad]));
  await game.boot();
  await assert.rejects(game.launchLevel("network_01"), (e) => e instanceof LevelValidationError && /ghost_lane/.test(e.message));
  assert.equal(game.session, null);
});

test("level can be loaded and unloaded", async () => {
  const events = [];
  const game = makeGame(memoryProvider([level01, level02]), {
    attachPresentation: () => ({ update() {}, destroy: () => events.push("destroyed") }),
    onLevelLaunched: () => events.push("launched"),
    onLevelUnloaded: () => events.push("unloaded"),
  });
  await game.boot();
  const s = await game.launchLevel("network_01");
  s.step(30);
  game.unload();
  assert.deepEqual(events, ["launched", "destroyed", "unloaded"]);
  assert.equal(game.session, null);
  assert.throws(() => ServiceLocator.resolve("game", "EntityManager"), /Failed to find service/);
});

test("launching another level unloads the previous one", async () => {
  const game = makeGame();
  await game.boot();
  const a = await game.launchLevel("network_01");
  const b = await game.launchLevel("network_02");
  assert.ok(a.disposed);
  assert.ok(!b.disposed);
  assert.notEqual(a.entityManager, b.entityManager);
});

test("restarting a level resets simulation state and replays identically", async () => {
  const game = makeGame();
  await game.boot();
  const first = await game.launchLevel("network_01");
  first.step(30 * 45);
  setGroups(first, GROUPS.ewS);
  first.step(30 * 5);
  const dirty = { spawned: first.stats.spawned, time: first.time };
  assert.ok(dirty.spawned > 0);

  const second = await game.restartLevel();
  assert.notEqual(first, second);
  assert.equal(second.time, 0);
  assert.equal(second.stats.spawned, 0);
  assert.equal(second.vehicles().length, 0);
  assert.equal(second.entity("sg_ns_straight").getComponent("SignalGroupComponent").state, 2, "signals back to their initial state");
  assert.equal(second.sim.status, "running");

  second.step(30 * 45);
  const third = await game.restartLevel();
  third.step(30 * 45);
  assert.equal(third.stats.spawned, second.stats.spawned, "same seed, same traffic");
});

test("loadNextLevel advances and wraps", async () => {
  const game = makeGame();
  await game.boot();
  await game.launchLevel("network_01");
  assert.equal((await game.loadNextLevel()).level.id, "network_02");
  assert.equal((await game.loadNextLevel()).level.id, "network_01");
});

test("reloadLevelData picks up changed level data", async () => {
  const provider = memoryProvider([clone(level01)]);
  const game = makeGame(provider);
  await game.boot();
  const s1 = await game.launchLevel("network_01");
  assert.equal(s1.level.name, "Pressure Test");
  provider.levels.network_01.name = "Edited";
  const s2 = await game.reloadLevelData();
  assert.equal(s2.level.name, "Edited");
});

test("level ids map to entities, runtime ids are separate", async () => {
  const game = makeGame();
  await game.boot();
  const s = await game.launchLevel("network_01");
  const lane = s.entity("lane_n_in_0");
  assert.equal(lane.id, "lane_n_in_0", "persistent level id");
  assert.equal(typeof lane.tempId, "number", "runtime id");
  assert.ok(s.entityManager.world.includes(lane));
});

test("remote provider uses the same contract (injected fetch)", async () => {
  const calls = [];
  const data = {
    "https://data.example/api/config": gameConfig,
    "https://data.example/api/levels": { levels: [{ id: "network_01", name: "Pressure Test" }] },
    "https://data.example/api/levels/network_01": level01,
  };
  const fetchFn = async (url) => {
    calls.push(url);
    return data[url] ? { ok: true, json: async () => structuredClone(data[url]) } : { ok: false, status: 404, statusText: "Not Found" };
  };
  const game = makeGame(new RemoteDataProvider({ baseUrl: "https://data.example/api/", fetchFn }));
  await game.boot();
  const s = await game.launchLevel("network_01");
  s.step(30);
  assert.equal(calls.length, 3);
  await assert.rejects(new RemoteDataProvider({ baseUrl: "https://data.example/api", fetchFn }).getLevel("zzz"), /404/);
});

test("local provider resolves files via the manifest", async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    const body = url.endsWith("manifest.json") ? { levels: [{ id: "network_01", file: "network-01.json" }] } : level01;
    return { ok: true, json: async () => body };
  };
  const p = new LocalJsonProvider({ baseUrl: "data/", fetchFn });
  assert.equal((await p.getLevel("network_01")).id, "network_01");
  assert.deepEqual(urls, ["data/levels/manifest.json", "data/levels/network-01.json"]);
  await assert.rejects(p.getLevel("zzz"), /Unknown level "zzz"/);
});

test("launching with no id (first launch) uses the configured start level, even before boot", async () => {
  const withStart = () => makeGame(memoryProvider([firstJunction, level01]));
  const game = withStart();
  const s = await game.launchLevel();
  assert.equal(s.level.id, gameConfig.startLevel);
  const fresh = withStart();
  const r = await fresh.restartLevel(); // restart before any launch must not pass a null id
  assert.equal(r.level.id, gameConfig.startLevel);
});
