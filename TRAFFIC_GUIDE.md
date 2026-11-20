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
| Phaser view, world-space UI, debug overlay | `scripts/traffic/presentation/` |
| Camera, minimap maths, HUD read model, control layout (pure, no Phaser/DOM) | `scripts/traffic/view/` |
| Player HUD, input routing, debug panel (DOM) | `scripts/traffic/ui/` |
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

## UI architecture

The UI is a consumer of the simulation. Nothing below writes to the ECS; the only way the UI changes the game is a command through `GameActions` (`session.toggleSignal`, `setPaused`, restart...).

```
Simulation (ECS, stats)
   ├─ HudReadModel          view/       one snapshot per refresh: score, capacity, gates, incidents
   │     └─ GameHud widgets ui/hud/     ScoreDisplay, GridlockDisplay, QueueStatus, IncidentStatus,
   │                                    StatusDisplay, GameControls, StatusBanner, Minimap
   ├─ TrafficPresentation   presentation/  Phaser world drawing
   │     └─ SignalControlLayer           world-space signal controls (+ signalControlSkin.js)
   └─ DebugPanel + debug overlay         detailed dev info (D toggles debug mode)
ViewCamera (view/) <- ViewportInput (ui/) <- pointer/keys;  Minimap and edge scroll also drive it
```

- **Coordinates.** World = level space (roads, vehicles, controls). Screen = viewport pixels (HUD, pointer). `ViewCamera` is the only place that converts (`worldToScreen`, `screenToWorld`); no zoom yet, so it is a translation. It knows world bounds and viewport size, nothing about traffic or Phaser. `TrafficPresentation.syncCamera` copies its x/y onto the engine camera and its viewport size back from the engine each frame.
- **Viewport.** `#game-viewport` holds the Phaser canvas (`RESIZE` scale mode) and `#game-hud`. The HUD is anchored by CSS to this element; the debug panel shrinks it rather than overlapping it. Never hardcode a map size: bounds come from `level.map`.
- **Input priority** (`ViewportInput`): HUD panels capture their own events (they sit above the canvas; only events whose target is the canvas reach the router). A press on a world control belongs to that control and never pans (activates on release over the same control). A press on empty world drags the camera. Edge scrolling only runs when the pointer is over the canvas inside the viewport and no gesture is active; arrow keys also pan. Camera input runs every frame, including while paused.
- **Signal controls.** `computeSignalControls(level)` derives one control per (signal group, approach lane) beside the stop line, from topology only. `SignalControlLayer` reads `SignalGroupComponent.state` for appearance, hit-tests in world coordinates (`pick`), and calls `onToggle(groupId)`. While paused, a toggle stays queued until the next tick; a ring marks it (`GameActions.isSignalPending`). To restyle, change `signalControlSkin.js` or `theme.js`; interaction code does not change.
- **HUD values.** Display authoritative stats, never recompute. `networkCapacity` is the share of lanes not blocked by incidents. Failure proximity is `peakQueueFill` (fullest input queue) and `gridlockProgress` (full-queue timer / `gridlock.fullSeconds`); both are computed in `TrafficStatsSystem`. Add new HUD numbers to stats first, then to `HudReadModel`.
- **DOM cost.** Widgets write through `Cell` (`ui/dom.js`), which skips unchanged values. The HUD refreshes at 10 Hz; the minimap redraws only when `camera.version` or the snapshot changes.
- **Styling.** All sizes, colours and margins live in `ui/theme.js` (exported to CSS custom properties by `applyTheme`; `game-hud.css` consumes them).
- **Minimap.** Draws level topology (roads, junctions) plus gate pressure, incidents and the view rectangle. It does not render the world. Click or drag calls `camera.glideTo` / `centerOn`.
- **Debug mode.** `DebugMode` is the shared switch (panel + overlay). Pause, restart, speed and `D` keys live in `GameHud`; the panel keeps `.` (step) and `1-9` (signal groups). The overlay bitmap is viewport-sized and screen-fixed, so `TrafficDebugView` translates by the camera.

## Concepts

- **Signal group**: independently controllable stream of movements. Commands: `{type:"signal.set", group, green}` / `{type:"signal.toggle", group}` via `session.setSignal` / `toggleSignal`. Green is instant, red goes through yellow. No interlock by design.
- **Movement**: junction connector from an approach lane to an exit lane, assigned to a signal group. Stored as a `LaneComponent` with `kind: "connector"`.
- **Conflict zone**: derived from movement path geometry at load (crossing, or merging into the same exit lane). Never authored. A vehicle occupies a zone side while its body overlaps that interval. Both sides occupied by active vehicles = incident.
- **Obstacle** (`ObstacleComponent`): timer + `blocks: [{lane, rear}]`. Each block is a stationary virtual vehicle on a lane or movement; followers queue behind it via the normal leader logic. Collisions are one `kind`; roadworks etc. are level-scheduled (`obstacles` in the level JSON) and use the same code. New obstacle types should reuse this, not add parallel blocking logic.
- **Input gate**: finite queue, per-gate seeded stream, feeds the lanes listed in `lanes`; each route enters on its own first lane. **Output gate**: removes arrivals; optional `outflowPerMinute` makes a bottleneck.

## Common tasks

- **New level**: copy a shipped level (`network-01.json` single junction; `network-02.json` 3x2 grid on a 3400x1700 map, generated by `tools/generate-grid-network.mjs`) or adapt a generator, add it to `data/levels/manifest.json`, run `npm test` (the validator reports exact paths). Check zones with the debug overlay (`D`, layer `conflicts`).
- **New level field**: add validation in `validateLevel.js`, consume it in `compileLevel`/`instantiateLevel`/`TrafficSession`, add a test in `tests/level.test.js`. Keep it JSON, editor-friendly and Phaser-free.
- **New component**: class in `components/traffic/`, export in its `index.js`, add the entity type to `scripts/data/TrafficDefaults.js`.
- **New HUD element**: add a widget in `ui/hud/`, construct it in `GameHud.bind`, feed it from `HudReadModel` (which reads stats/components). Take styling from `theme.js`.
- **New debug layer**: add it to `DEBUG_LAYERS` in `TrafficDebugView.js`.
- **New world-space UI**: lives in the Phaser world layer (so it moves with the camera), placed in world coordinates, hit-tested through the `pick/setHover/activate` interface that `ViewportInput` calls. Do not position it from screen coordinates.
- **Tuning**: demand curves in the level JSON; incident duration, gridlock timer and scoring in `data/game-config.json` (levels can override). Re-run the strategy test in `tests/simulation.test.js` after tuning: bad strategies must still collapse well before a sensible one.

## Pitfalls

- `entityManager.registerSystem(obj, comps)` returns a **snapshot array**. The live list is `obj.entities`, replaced whenever entities are added/removed. For anything that changes at runtime (vehicles, obstacles), keep a helper object and read `helper.entities` (see `TrafficStatsSystem`). Static level entities are safe to cache.
- Creating or removing entities inside a loop over a system list: collect first, mutate after (see `JunctionConflictSystem`, `ObstacleSystem`).
- East/west arms are longer than north/south in the shipped level, so tests that need two cars to meet use a spawn offset (see `crossingPair` in `tests/simulation.test.js`).
- The EventBus warns when an event has no listener; `TrafficStatsSystem` registers no-op listeners for presentation-only events.
- Stopped vehicles approach their stop point asymptotically; assert `speed < 0.5`, not `=== 0`, unless you waited long.

## Testing

UI logic that matters is kept pure so it is tested headless: `tests/camera.test.js` (camera, edge scroll, minimap transform), `tests/hud.test.js` (signal control layout, read model). The Phaser/DOM layer (`ViewportInput`, widgets, `SignalControlLayer`) has no automated test; check it in a browser.

`npm test` (node's test runner, no Phaser). Helpers in `tests/helpers/fixtures.js`: `quietSession()` (no demand), `car(session, "n", "straight")`, `setGroups(session, ...)`, `runUntil`. Prefer simulation-level tests over UI tests. `node tools/bench.mjs [demandScale] [seconds]` gives a headless performance probe.

## Not implemented yet (known gaps)

Left turns (schema supports `turn: "left"`; opposing lefts collide geometrically in a small box), obstacle types beyond collision/roadworks, visual polish of the HUD, controls and minimap (prototype styling), camera zoom, touch input, a browser-level smoke test of the Phaser presentation (the DOM/Phaser wiring is not covered by `npm test`; only the pure `view/` modules are).

`network_02` is the first multi-junction level: a lane between two junctions is both the exit of one and the approach of the next, and carries both its straight and right-turn movements, so a right-turner waiting on a red turn group can hold up traffic behind it.
