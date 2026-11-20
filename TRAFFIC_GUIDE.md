# Traffic game: guide for contributors and agents

Read this before changing anything under `scripts/traffic/`, `scripts/system/traffic/`, `scripts/components/traffic/` or `data/`. For the generic engine (entities, components, systems) see `IMPLEMENTATION_GUIDE.md`.

## Design rules (do not break these)

1. **The player causes failure.** Vehicles are simple agents. Do not add conflict avoidance, junction reservations, rerouting, or anything that makes bad signal choices safe. If you add driver behaviour, ask: does this stop the player's mistake from having consequences? If so, it does not belong.
2. **Failure is capacity collapse**, not money. A full input queue for `gridlock.fullSeconds` ends the level. Score is secondary.
3. **Determinism.** Same level + seed + signal commands = same result. Use `nextRandom(state)` from `traffic/util/rng.js` with a seeded state; never `Math.random()` or wall-clock time in simulation code.
4. **Three layers, no leaking.** Level topology (JSON, compile) -> runtime simulation (ECS, `TrafficSession`, no Phaser) -> presentation (Phaser, HUD, debug view; reads the world, never writes it). Tests run the simulation without Phaser.
5. **Level ids are not runtime ids.** JSON ids become `Entity.id`; runtime identity is the Entity object / `tempId`.

## Architecture map

| Layer | Where |
|---|---|
| Level schema + validation | `scripts/traffic/level/validateLevel.js` (schema v2) |
| Geometry -> lanes, connectors, conflict zones | `scripts/traffic/level/compileLevel.js`, `util/geometry.js` |
| JSON -> ECS entities | `scripts/traffic/level/instantiateLevel.js` |
| Session, fixed-step runner, system order | `scripts/traffic/session/TrafficSession.js` |
| Lifecycle (load/restart/unload) | `scripts/traffic/TrafficGame.js` |
| Components (data only) | `scripts/components/traffic/`, registered in `index.js` |
| Systems | `scripts/system/traffic/` |
| Phaser view, debug overlay, HUD | `scripts/traffic/presentation/`, `scripts/traffic/ui/` |
| Data providers (local/remote/memory) | `scripts/services/data/` |

## Update order (one fixed tick)

Defined in `TrafficSession`'s constructor. Each step only reads what earlier steps produced:

1. `TrafficDemandSystem`: demand curve -> arrivals into input queues (or overflow)
2. `VehicleSpawnSystem`: queue heads enter their lane if there is room
3. `TrafficSignalSystem`: player commands -> signal group states
4. `VehicleSystem`: car following, stop-line decisions, movement along paths
5. `JunctionConflictSystem`: two active vehicles in both sides of a conflict zone -> incident + obstacle
6. `ObstacleSystem`: activate, count down, clear obstacles (blocks act as stopped leaders)
7. `JunctionSystem`: box occupancy
8. `OutputGateSystem`: arrived vehicles leave, throughput++
9. `TrafficStatsSystem`: queues, capacity, load, score
10. `GridlockSystem`: full-queue timer, sets `sim.status = "gridlock"` (the session then stops ticking)

Add a new system by constructing it in that list at the point where its inputs exist. Changing the order changes gameplay; add a test.

## Concepts

- **Signal group**: independently controllable stream of movements. Commands: `{type:"signal.set", group, green}` / `{type:"signal.toggle", group}` via `session.setSignal` / `toggleSignal`. Green is instant, red goes through yellow. No interlock by design.
- **Movement**: junction connector from an approach lane to an exit lane, assigned to a signal group. Stored as a `LaneComponent` with `kind: "connector"`.
- **Conflict zone**: derived from movement path geometry at load (crossing, or merging into the same exit lane). Never authored. A vehicle occupies a zone side while its body overlaps that interval. Both sides occupied by active vehicles = incident.
- **Obstacle** (`ObstacleComponent`): timer + `blocks: [{lane, rear}]`. Each block is a stationary virtual vehicle on a lane or movement; followers queue behind it via the normal leader logic. Collisions are one `kind`; roadworks etc. are level-scheduled (`obstacles` in the level JSON) and use the same code. New obstacle types should reuse this, not add parallel blocking logic.
- **Input gate**: finite queue, per-gate seeded stream, feeds the lanes listed in `lanes`; each route enters on its own first lane. **Output gate**: removes arrivals; optional `outflowPerMinute` makes a bottleneck.

## Common tasks

- **New level**: copy `data/levels/network-01.json` (or adapt `tools/generate-network.mjs`), add it to `data/levels/manifest.json`, run `npm test` (the validator reports exact paths). Check zones with the debug overlay (`D`, layer `conflicts`).
- **New level field**: add validation in `validateLevel.js`, consume it in `compileLevel`/`instantiateLevel`/`TrafficSession`, add a test in `tests/level.test.js`. Keep it JSON, editor-friendly and Phaser-free.
- **New component**: class in `components/traffic/`, export in its `index.js`, add the entity type to `scripts/data/TrafficDefaults.js`.
- **New HUD/debug element**: read from stats or components only. Add debug layers to `DEBUG_LAYERS` in `TrafficDebugView.js`.
- **Tuning**: demand curves in the level JSON; incident duration, gridlock timer and scoring in `data/game-config.json` (levels can override). Re-run the strategy test in `tests/simulation.test.js` after tuning: bad strategies must still collapse well before a sensible one.

## Pitfalls

- `entityManager.registerSystem(obj, comps)` returns a **snapshot array**. The live list is `obj.entities`, replaced whenever entities are added/removed. For anything that changes at runtime (vehicles, obstacles), keep a helper object and read `helper.entities` (see `TrafficStatsSystem`). Static level entities are safe to cache.
- Creating or removing entities inside a loop over a system list: collect first, mutate after (see `JunctionConflictSystem`, `ObstacleSystem`).
- East/west arms are longer than north/south in the shipped level, so tests that need two cars to meet use a spawn offset (see `crossingPair` in `tests/simulation.test.js`).
- The EventBus warns when an event has no listener; `TrafficStatsSystem` registers no-op listeners for presentation-only events.
- Stopped vehicles approach their stop point asymptotically; assert `speed < 0.5`, not `=== 0`, unless you waited long.

## Testing

`npm test` (node's test runner, no Phaser). Helpers in `tests/helpers/fixtures.js`: `quietSession()` (no demand), `car(session, "n", "straight")`, `setGroups(session, ...)`, `runUntil`. Prefer simulation-level tests over UI tests. `node tools/bench.mjs [demandScale] [seconds]` gives a headless performance probe.

## Not implemented yet (known gaps)

Left turns (schema supports `turn: "left"`; opposing lefts collide geometrically in a small box), multi-junction levels (routes and zones already support them, untested), obstacle types beyond collision/roadworks, player-facing HUD polish, a browser-level smoke test of the Phaser presentation.
