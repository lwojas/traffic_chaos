# Traffic game: guide for contributors and agents

Read this before changing anything under `scripts/traffic/`, `scripts/system/traffic/`, `scripts/components/traffic/` or `data/`. For the generic engine (entities, components, systems) see `IMPLEMENTATION_GUIDE.md`.

## Design rules (do not break these)

1. **The player causes failure.** Vehicles are simple agents. Do not add conflict avoidance, junction reservations, rerouting, or anything that makes bad signal choices safe. If you add driver behaviour, ask: does this stop the player's mistake from having consequences? If so, it does not belong.
2. **Failure is capacity collapse**, not money. A full input queue for `gridlock.fullSeconds` ends the level. Cash is a tool for recovering, never a way to lose.
6. **Exits pay, congestion sets the multiplier, and there is one reward system.** A vehicle reaching an exit gate is the only thing that earns: `scoring.perVehicle` points and `economy.cashPerVehicle` cash, each times the current multiplier (`OutputGateSystem`). The multiplier (`MultiplierSystem`) follows congestion and nothing else. Never pay over time, per queue, for holding or releasing traffic, or for gridlock, and do not add a second multiplier, combo, or hidden meter. Holding a queue is a normal tactical choice with its own natural cost (congestion, incident risk), never a mechanic with its own bonus.
7. **A low multiplier is not failure.** It floors at `multiplier.min`; only gridlock ends a level. Keep the multiplier (performance), congestion (pressure on the network) and gridlock (failure) as separate values.
8. **Interventions edit state, not cars.** The tow truck shortens an obstacle timer. Do not give vehicles new behaviour to support an intervention.
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
| Streams, congestion, multiplier, rewards, tow, ratings, unlocks | `system/traffic/StreamSystem.js` (congestion), `MultiplierSystem.js`, `OutputGateSystem.js` (rewards), `InterventionSystem.js`, `ShiftSystem.js`, `util/multiplierMath.js`, `util/pressureMath.js`, `progress/` |
| Level-design diagnostic (not used by the simulation) | `util/networkBalance.js` |
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
9. `OutputGateSystem`: arrived vehicles leave and are paid points + cash at the current multiplier (emits `VEHICLE_COMPLETED` with the reward)
10. `StreamSystem`: per (signal group, approach lane): queue, pressure, risk band; publishes `stats.congestion` (worst stream's pressure)
11. `TrafficStatsSystem`: queues, capacity, load
12. `MultiplierSystem`: congestion -> target multiplier -> current multiplier (eased)
13. `GridlockSystem`: full-queue timer, sets `sim.status = "gridlock"` (the session then stops ticking)
14. `ShiftSystem`: `goal.surviveSeconds` reached -> `sim.status = "complete"`

Add a new system by constructing it in that list at the point where its inputs exist. Changing the order changes gameplay; add a test.

## UI architecture

The UI is a consumer of the simulation. Nothing below writes to the ECS; the only way the UI changes the game is a command through `GameActions` (`session.toggleSignal`, `setPaused`, restart...).

```
Simulation (ECS, stats)
   ├─ HudReadModel          view/       one snapshot per refresh: multiplier, congestion, score, cash, capacity, gates, incidents
   │     └─ GameHud widgets ui/hud/     MultiplierDisplay (top-left, + score), CongestionDisplay (top-centre: congestion gauge + input queues), ExitPopups (reward text, top-centre, grows to 200%), CashDisplay (top-right, counts up), TowPanel (incidents),
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

## Gameplay loop: exits, multiplier, tow, medals

**Manage traffic -> keep congestion low -> hold the multiplier -> vehicles reach exits -> points + cash -> prevent gridlock.**

- **Stream** = one (signal group, approach lane). Its id is `groupId@laneId`, the same id as its world control. `session.streams.streams` exposes `queue`, `pressure`, `risk` (0 SAFE .. 3 CRITICAL), `blocked`. Streams only measure.
- **Pressure** = (cars waiting + this lane's share of the input queue) / (lane capacity + that share's capacity). Lane capacity comes from lane length and the vehicle mix (`laneCapacity`). Bands are `pressure.riskBands`.
- **Congestion** (`stats.congestion`, 0..1) = the highest stream pressure right now, `stats.congestionStream` names it. It is the same number and colour band the world controls show, so "that road is backing up" and "that is costing me" are the same observation. It is the only input to the multiplier; do not add other penalties next to it. (A network-wide average was tried and rejected: on big maps most lanes are idle, so it never moved.)
- **Multiplier** (`stats.multiplier`, `multiplier.{min,max,calm,jam,riseGain,fallGain,fallSeconds}`): starts at `min` (x1) and is earned slowly. It only RISES when congestion falls (`riseGain` per unit cleared, measured on a 3 s-smoothed congestion so gains arrive in small steps); it falls when congestion rises (`fallGain`) and is clamped to the ceiling congestion allows (`util/multiplierMath.js`: `max` at or below `calm`, `min` at or above `jam`, linear between). A calm network that never backed up earns nothing. Tuned so good bot play reaches about x2 at 10 min and x3 needs 10+ min or expert play; re-check with `node tools/playtest.mjs` after changing gains.
- **Reward**: an exit pays `scoring.perVehicle x multiplier` points and `economy.cashPerVehicle x multiplier` cash, at the multiplier of that tick. `OutputGateSystem` is the only writer of `score`, `cash` (credit) and `earned`. There is no income over time and no incident score penalty (the obstruction is the penalty). The HUD's `ExitPopups` shows `+points x mult  $cash` top-centre from the event (the world layer draws no reward text).
- **Tow**: command `session.intervene("tow", obstacleId)` -> `InterventionSystem`. Cost `cost + costStep x uses`, then `cooldown`; the obstacle clears `delay` seconds later. Never refunded. Add an intervention by adding a handler in `InterventionSystem.handlers` and a config entry under `interventions`.
- **Ratings/unlocks**: `progress/rating.js` (`rateRun`, pure) and `progress/Progression.js`. Level JSON holds `goal`, `ratings` (bronze/silver/gold requirements: `time`, `score`, `maxIncidents`) and `progression` (`order`, `blurb`, `unlock: {after, medal}`).
- **Config merge**: `game-config.json` `simulation.{scoring,economy,multiplier,pressure,interventions}` are defaults; a level may override any key. Do not restate them in generated levels unless a level really differs.

## Level authoring: entry and exit capacity

Difficulty is a data lever, never keyed on a level id. A level states, per gate:

- inputs: `queueCapacity` (how much can wait off the map before gridlock), `demand.curve` and `demand.scale` (how hard it pushes), route weights.
- outputs: `outflowPerMinute` (discharge capacity: a downstream bottleneck). Omitted means unlimited.
- one-way arms are fine: an arm only needs the lanes a route uses.

More entries than exits is pressure, but not a formula: road capacity, signals and demand curves still decide the outcome. `util/networkBalance.js` (`networkBalance(level)`) reports peak demand against exit discharge (pressure < 0.5 forgiving, 0.5-0.8 balanced, 0.8-1.1 pressured, > 1.1 severe) and the worst exit. It is a design aid used by `tools/playtest.mjs` and tests, never by the simulation. `city_balanced`/`city_rush`/`city_crunch` are one network with 3, 4 and 5 entries and 3 exits.

## Concepts

- **Signal group**: independently controllable stream of movements. Commands: `{type:"signal.set", group, green}` / `{type:"signal.toggle", group}` via `session.setSignal` / `toggleSignal`. Green is instant, red goes through yellow. No interlock by design.
- **Movement**: junction connector from an approach lane to an exit lane, assigned to a signal group. Stored as a `LaneComponent` with `kind: "connector"`.
- **Conflict zone**: derived from movement path geometry at load (crossing, or merging into the same exit lane). Never authored. A vehicle occupies a zone side while its body overlaps that interval. Both sides occupied by active vehicles = incident.
- **Obstacle** (`ObstacleComponent`): timer + `blocks: [{lane, rear}]`. Each block is a stationary virtual vehicle on a lane or movement; followers queue behind it via the normal leader logic. Collisions are one `kind`; roadworks etc. are level-scheduled (`obstacles` in the level JSON) and use the same code. New obstacle types should reuse this, not add parallel blocking logic.
- **Input gate**: finite queue, per-gate seeded stream, feeds the lanes listed in `lanes`; each route enters on its own first lane. **Output gate**: removes arrivals; optional `outflowPerMinute` makes a bottleneck.

## Common tasks

- **Shipped maps (in order)**: `first_junction` Mill Town (2x2 junctions, 2 in / 3 out, one bottleneck exit; `generate-grid-network.mjs start`), `city_balanced` / `city_rush` / `city_crunch` (3x2 grid, 3 / 4 / 5 entries, 3 exits; `... balanced|rush|crunch`), `network_03` Connected Junctions (`... connected`), `network_02` City Grid, `network_01` Turning Traffic (compact four-way; `generate-network.mjs`). Progression, goals, ratings, demand curves and per-gate capacities live in `tools/levelMeta.mjs` (`inputs`, `outputs`, `botPhases`); regenerate after editing it.
- **New level**: copy a shipped level or adapt a generator, add it to `data/levels/manifest.json`, run `npm test` (the validator reports exact paths). Check zones with the debug overlay (`D`, layer `conflicts`).
- **New level field**: add validation in `validateLevel.js`, consume it in `compileLevel`/`instantiateLevel`/`TrafficSession`, add a test in `tests/level.test.js`. Keep it JSON, editor-friendly and Phaser-free.
- **New component**: class in `components/traffic/`, export in its `index.js`, add the entity type to `scripts/data/TrafficDefaults.js`.
- **New HUD element**: add a widget in `ui/hud/`, construct it in `GameHud.bind`, feed it from `HudReadModel` (which reads stats/components). Take styling from `theme.js`.
- **New debug layer**: add it to `DEBUG_LAYERS` in `TrafficDebugView.js`.
- **New world-space UI**: lives in the Phaser world layer (so it moves with the camera), placed in world coordinates, hit-tested through the `pick/setHover/activate` interface that `ViewportInput` calls. Do not position it from screen coordinates.
- **Pacing/balance**: `node tools/playtest.mjs [levelFile] [seeds]` plays a level with bots (idle, reckless, fixed-cycle, greedy, charger, +tow) and prints the network balance, how each run ended, score, cash, exits, incidents and the multiplier (avg/peak). `PHASES='[["sg_a"],["sg_b"]]'` sets which groups a bot opens together. Target for the first level: idle ends under about 7 min, sensible play lasts 9-12 min. Bots are not humans: confirm by hand.
- **Tuning**: entry/exit data and demand curves in the level JSON; rewards, multiplier range and congestion thresholds, incident duration and gridlock timer in `data/game-config.json` (levels can override). Re-run the strategy test in `tests/simulation.test.js` after tuning: bad strategies must still collapse well before a sensible one.

## Pitfalls

- `entityManager.registerSystem(obj, comps)` returns a **snapshot array**. The live list is `obj.entities`, replaced whenever entities are added/removed. For anything that changes at runtime (vehicles, obstacles), keep a helper object and read `helper.entities` (see `TrafficStatsSystem`). Static level entities are safe to cache.
- Creating or removing entities inside a loop over a system list: collect first, mutate after (see `JunctionConflictSystem`, `ObstacleSystem`).
- East/west arms are longer than north/south in the shipped level, so tests that need two cars to meet use a spawn offset (see `crossingPair` in `tests/simulation.test.js`).
- The EventBus warns when an event has no listener; `TrafficStatsSystem` registers no-op listeners for presentation-only events.
- Stopped vehicles approach their stop point asymptotically; assert `speed < 0.5`, not `=== 0`, unless you waited long.

## Testing

Engine tests use frozen copies of the original levels in `tests/fixtures/` (retuning a shipped level does not move them). `tests/economy.test.js` covers the multiplier, exit rewards, streams and the tow truck; `tests/progress.test.js` covers ratings, unlocks, `TrafficGame.finishRun` and the shipped-level and pacing checks.

UI logic that matters is kept pure so it is tested headless: `tests/camera.test.js` (camera, edge scroll, minimap transform), `tests/hud.test.js` (signal control layout, read model). The Phaser/DOM layer (`ViewportInput`, widgets, `SignalControlLayer`) has no automated test; check it in a browser.

`npm test` (node's test runner, no Phaser). Helpers in `tests/helpers/fixtures.js`: `quietSession()` (no demand), `car(session, "n", "straight")`, `setGroups(session, ...)`, `runUntil`. Prefer simulation-level tests over UI tests. `node tools/bench.mjs [demandScale] [seconds]` gives a headless performance probe.

## Not implemented yet (known gaps)

Levels are only bot-tuned (not hand-playtested): the fixed-time bots survive more easily than a human managing every signal, and `city_rush` / `city_crunch` end alike because the same exit (S1) is their binding constraint. A collision-focused map and more asymmetric topologies, road crew / emergency / capacity-boost interventions, and the new HUD, world controls and minimap markers have had no browser verification. Left turns (schema supports `turn: "left"`; opposing lefts collide geometrically in a small box), obstacle types beyond collision/roadworks, visual polish of the HUD, controls and minimap (prototype styling), camera zoom, touch input, a browser-level smoke test of the Phaser presentation (the DOM/Phaser wiring is not covered by `npm test`; only the pure `view/` modules are).

`network_02` is the first multi-junction level: a lane between two junctions is both the exit of one and the approach of the next, and carries both its straight and right-turn movements, so a right-turner waiting on a red turn group can hold up traffic behind it.
