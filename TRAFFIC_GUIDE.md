# Traffic game: guide for contributors and agents

Read this before changing anything under `scripts/traffic/`, `scripts/system/traffic/`, `scripts/components/traffic/` or `data/`. For the generic engine (entities, components, systems) see `IMPLEMENTATION_GUIDE.md`.

## Design rules (do not break these)

1. **The player causes failure.** Vehicles are simple agents. Do not add conflict avoidance, junction reservations, rerouting, or anything that makes bad signal choices safe. If you add driver behaviour, ask: does this stop the player's mistake from having consequences? If so, it does not belong.
2. **Failure is capacity collapse**, not money. A full input queue for `gridlock.fullSeconds` ends the level. Cash is a tool for recovering, never a way to lose.
6. **Reward is traffic that got through.** Cash is paid per vehicle on reaching an output gate (`FlowSystem`). Never pay for queue length, never pay for gridlock. Holding traffic is a gamble: the payout grows with the held queue, and so does the risk.
7. **Interventions edit state, not cars.** The tow truck shortens an obstacle timer. Do not give vehicles new behaviour to support an intervention.
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
| Flow, cash, tow, ratings, unlocks | `system/traffic/FlowSystem.js`, `InterventionSystem.js`, `ShiftSystem.js`, `util/flowMath.js`, `progress/` |
| Phaser view, world-space UI, debug overlay | `scripts/traffic/presentation/` |
| Camera, minimap maths, HUD read model, control layout (pure, no Phaser/DOM) | `scripts/traffic/view/` |
| Player HUD, input routing, debug panel (DOM) | `scripts/traffic/ui/` |
| Data providers (local/remote/memory) | `scripts/services/data/` |

## Update order (one fixed tick)

Defined in `TrafficSession`'s constructor. Each step only reads what earlier steps produced:

1. `TrafficDemandSystem`: demand curve -> arrivals into input queues (or overflow)
2. `VehicleSpawnSystem`: queue heads enter their lane if there is room
3. `TrafficSignalSystem`: player commands -> signal group states
4. `InterventionSystem`: `intervention.*` commands (tow truck): spend cash, edit obstacle timers
5. `VehicleSystem`: car following, stop-line decisions, movement along paths
6. `JunctionConflictSystem`: two active vehicles in both sides of a conflict zone -> incident + obstacle
7. `ObstacleSystem`: activate, count down, clear obstacles (blocks act as stopped leaders)
8. `JunctionSystem`: box occupancy
9. `OutputGateSystem`: arrived vehicles leave, throughput++ (emits `VEHICLE_COMPLETED`)
10. `FlowSystem`: streams, releases, per-car cash, Flow chain
11. `TrafficStatsSystem`: queues, capacity, load, score
12. `GridlockSystem`: full-queue timer, sets `sim.status = "gridlock"` (the session then stops ticking)
13. `ShiftSystem`: `goal.surviveSeconds` reached -> `sim.status = "complete"`

Add a new system by constructing it in that list at the point where its inputs exist. Changing the order changes gameplay; add a test.

## UI architecture

The UI is a consumer of the simulation. Nothing below writes to the ECS; the only way the UI changes the game is a command through `GameActions` (`session.toggleSignal`, `setPaused`, restart...).

```
Simulation (ECS, stats)
   ├─ HudReadModel          view/       one snapshot per refresh: score, capacity, gates, incidents
   │     └─ GameHud widgets ui/hud/     LoadDisplay, CashDisplay (cash tiles + Flow), QueueStatus, TowPanel (incidents),
   │                                    GameControls + SettingsMenu (theme, developer mode), HintCard, StatusBanner, Minimap
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
- **Themes.** `ui/themes.js` is the single source: `day`, `night`, `cyberpunk`, each with `css` (semantic `--theme-*` tokens), `world` (Phaser ground/roads/lights/vehicles), `signal` and `minimap` tokens. Components consume tokens and never name a theme: CSS uses `var(--theme-*)`, Phaser code reads `world()`/`signalTokens()`/`riskHex()` from `ui/theme.js`. `Theme` (a `ThemeManager`) switches, persists and notifies; `TrafficPresentation` repaints the static world and car textures, `Minimap` restyles, on change. Themes are presentation only and never touch simulation, scoring or levels. Add a theme by adding an object to `THEMES` with the same keys (`tests/theme.test.js` enforces it). Layout constants (sizes, widths) stay in `theme.js` `UI`; `game-hud.css` holds structure only.
- **Minimap.** Draws level topology (roads, junctions) plus gate pressure, incidents and the view rectangle. It does not render the world. Click or drag calls `camera.glideTo` / `centerOn`.
- **Debug mode.** There is no debug button in the player HUD; it is Settings > Developer mode or `D`. `DebugMode` is the shared switch (panel + overlay). Pause, restart, speed and `D` keys live in `GameHud`; the panel keeps `.` (step) and `1-9` (signal groups). The overlay bitmap is viewport-sized and screen-fixed, so `TrafficDebugView` translates by the camera.

## Gameplay loop: Flow, cash, tow, medals

**Manage -> Accumulate -> Risk -> Release -> Reward.**

- **Stream** = one (signal group, approach lane). Its id is `groupId@laneId`, the same id as its world control. `session.flow.streams` exposes `queue`, `pressure`, `risk` (0 SAFE .. 3 CRITICAL), `multiplier`, `potential`, `blocked`.
- **Pressure** = (cars waiting + this lane's share of the input queue) / (lane capacity + that share's capacity). Lane capacity comes from lane length and the vehicle mix (`laneCapacity`), so risk and bonus scale with real topology. Bands are `flow.riskBands`.
- **Release**: group turns green with at least `flow.minQueue` cars stopped for it. Each car pays `economy.perVehicle x burst x chain` when it reaches an output gate. Cars lost to a crash pay nothing. `burst = 1 + burstMax x (size/capacity)^1.3`.
- **Chain** (`flow.steps`, e.g. x1 x2 x3 x5 x8): a clean release of at least `chainFill` of the lane advances it. An incident or a full input queue resets it; a poor release or `chainSeconds` of idling drops one step. The chain only multiplies released queues, so a stream that is never held earns the plain rate.
- **Tow**: command `session.intervene("tow", obstacleId)` -> `InterventionSystem`. Cost `cost + costStep x uses`, then `cooldown`; the obstacle clears `delay` seconds later. Add an intervention by adding a handler in `InterventionSystem.handlers` and a config entry under `interventions`.
- **Ratings/unlocks**: `progress/rating.js` (`rateRun`, pure) and `progress/Progression.js` (medals + unlock rules over an injected storage). Level JSON holds `goal`, `ratings` (bronze/silver/gold requirements: `time`, `earned`, `flow`, `maxIncidents`) and `progression` (`order`, `blurb`, `unlock: {after, medal}`). `TrafficGame.finishRun` rates a finished run once and calls `hooks.onLevelFinished`.
- **Config merge**: `game-config.json` `simulation.{economy,flow,interventions}` are defaults; a level may override any key (`economy`, `flow`, `interventions.tow.cost`...).

## Concepts

- **Signal group**: independently controllable stream of movements. Commands: `{type:"signal.set", group, green}` / `{type:"signal.toggle", group}` via `session.setSignal` / `toggleSignal`. Green is instant, red goes through yellow. No interlock by design.
- **Movement**: junction connector from an approach lane to an exit lane, assigned to a signal group. Stored as a `LaneComponent` with `kind: "connector"`.
- **Conflict zone**: derived from movement path geometry at load (crossing, or merging into the same exit lane). Never authored. A vehicle occupies a zone side while its body overlaps that interval. Both sides occupied by active vehicles = incident.
- **Obstacle** (`ObstacleComponent`): timer + `blocks: [{lane, rear}]`. Each block is a stationary virtual vehicle on a lane or movement; followers queue behind it via the normal leader logic. Collisions are one `kind`; roadworks etc. are level-scheduled (`obstacles` in the level JSON) and use the same code. New obstacle types should reuse this, not add parallel blocking logic.
- **Input gate**: finite queue, per-gate seeded stream, feeds the lanes listed in `lanes`; each route enters on its own first lane. **Output gate**: removes arrivals; optional `outflowPerMinute` makes a bottleneck.

## Common tasks

- **Shipped maps (in order)**: `first_junction` (teaching: 2 in, 2 out, straight only; `tools/generate-first-junction.mjs`), `network_01` Turning Traffic (4 arms), `network_03` Connected Junctions (`generate-grid-network.mjs connected`), `network_02` City Grid. Progression, goals, ratings and demand curves for the generated ones live in `tools/levelMeta.mjs`.
- **New level**: copy a shipped level or adapt a generator, add it to `data/levels/manifest.json`, run `npm test` (the validator reports exact paths). Check zones with the debug overlay (`D`, layer `conflicts`).
- **New level field**: add validation in `validateLevel.js`, consume it in `compileLevel`/`instantiateLevel`/`TrafficSession`, add a test in `tests/level.test.js`. Keep it JSON, editor-friendly and Phaser-free.
- **New component**: class in `components/traffic/`, export in its `index.js`, add the entity type to `scripts/data/TrafficDefaults.js`.
- **New HUD element**: add a widget in `ui/hud/`, construct it in `GameHud.bind`, feed it from `HudReadModel` (which reads stats/components). Take styling from `theme.js`.
- **New debug layer**: add it to `DEBUG_LAYERS` in `TrafficDebugView.js`.
- **New world-space UI**: lives in the Phaser world layer (so it moves with the camera), placed in world coordinates, hit-tested through the `pick/setHover/activate` interface that `ViewportInput` calls. Do not position it from screen coordinates.
- **Pacing/balance**: `node tools/playtest.mjs [levelFile] [seeds]` plays a level with bots (idle, reckless, fixed-cycle, greedy, charger, +tow) and prints how each run ended, cash, Flow. `PHASES='[["sg_a"],["sg_b"]]'` sets which groups a bot opens together. Target for the first level: idle/reckless end under about 6 min, sensible play ends 9-12 min. Bots are not humans: confirm by hand.
- **Tuning**: demand curves in the level JSON; incident duration, gridlock timer and scoring in `data/game-config.json` (levels can override). Re-run the strategy test in `tests/simulation.test.js` after tuning: bad strategies must still collapse well before a sensible one.

## Pitfalls

- `entityManager.registerSystem(obj, comps)` returns a **snapshot array**. The live list is `obj.entities`, replaced whenever entities are added/removed. For anything that changes at runtime (vehicles, obstacles), keep a helper object and read `helper.entities` (see `TrafficStatsSystem`). Static level entities are safe to cache.
- Creating or removing entities inside a loop over a system list: collect first, mutate after (see `JunctionConflictSystem`, `ObstacleSystem`).
- East/west arms are longer than north/south in the shipped level, so tests that need two cars to meet use a spawn offset (see `crossingPair` in `tests/simulation.test.js`).
- The EventBus warns when an event has no listener; `TrafficStatsSystem` registers no-op listeners for presentation-only events.
- Stopped vehicles approach their stop point asymptotically; assert `speed < 0.5`, not `=== 0`, unless you waited long.

## Testing

Engine tests use frozen copies of the original levels in `tests/fixtures/` (retuning a shipped level does not move them). `tests/flow.test.js` covers Flow, cash and the tow truck; `tests/progress.test.js` covers ratings, unlocks, `TrafficGame.finishRun` and the shipped-level and pacing checks.

UI logic that matters is kept pure so it is tested headless: `tests/camera.test.js` (camera, edge scroll, minimap transform), `tests/hud.test.js` (signal control layout, read model). The Phaser/DOM layer (`ViewportInput`, widgets, `SignalControlLayer`) has no automated test; check it in a browser.

`npm test` (node's test runner, no Phaser). Helpers in `tests/helpers/fixtures.js`: `quietSession()` (no demand), `car(session, "n", "straight")`, `setGroups(session, ...)`, `runUntil`. Prefer simulation-level tests over UI tests. `node tools/bench.mjs [demandScale] [seconds]` gives a headless performance probe.

## Not implemented yet (known gaps)

Maps 4-5 of the planned arc (a collision-focused "Incident Network" and a competing-sources "Multiple Inputs" map), levels 2-4 are only bot-tuned (not hand-playtested), road crew / emergency / capacity-boost interventions, and the new HUD, world controls and minimap markers have had no browser verification. Left turns (schema supports `turn: "left"`; opposing lefts collide geometrically in a small box), obstacle types beyond collision/roadworks, visual polish of the HUD, controls and minimap (prototype styling), camera zoom, touch input, a browser-level smoke test of the Phaser presentation (the DOM/Phaser wiring is not covered by `npm test`; only the pure `view/` modules are).

`network_02` is the first multi-junction level: a lane between two junctions is both the exit of one and the approach of the next, and carries both its straight and right-turn movements, so a right-turner waiting on a red turn group can hold up traffic behind it.
