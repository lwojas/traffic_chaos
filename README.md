# ECS 2D Game Engine

A 2D top-down game engine written in plain ES modules, built around an **Entity Component System (ECS)** architecture. [Phaser 2](https://photonstorm.github.io/phaser-ce/) (CE, bundled in `scripts/`) provides the low-level pieces: sprites, Arcade physics, input, camera and rendering. Everything above that (entities, components, systems, level loading, AI, weapons, lighting, shadows) is this repo.

The included demo is a space-ship sandbox: a player ship, pirate/trader NPCs with perception, faction and AI scoring, weapons and ammo, pickups, explosions, and dynamic lights with shadow casting.

- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Core concepts](#core-concepts)
- [How a level is orchestrated](#how-a-level-is-orchestrated)
- Full walkthrough: **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)**

## Quick start

Requirements: Node.js (only for the dev server). The game itself runs in any modern browser.

```bash
git clone <repo-url>
cd ecs
npm install
npm start        # runs lite-server and opens the game in your browser
```

ES modules require the page to be served over HTTP, so opening `index.html` directly from disk (`file://`) will not work. Any static server does the job (`npx http-server`, `python3 -m http.server`).

**Default controls**: arrow keys fly the ship, `Space` / `F` fire interaction and weapon events (see `scripts/system/InputSystem.js`).

## Project layout

```
index.html                 Loads Phaser, init.js and boot.js
assets/                    Sprites, lights, backgrounds (PNG)
src/                       Source art (.xcf), not used at runtime
scripts/
  init.js                  Creates the global `game` (Phaser.Game) and `BasicGame` namespace
  boot.js                  Phaser "Boot" state: preloads assets, starts physics, registers levels
  level-whiteroom.js       Reference level: wires services, entities and systems together
  data/                    Declarative game data (JSON-like JS objects)
    SharedData.js            componentDefaults: entity "types" (prefabs)
    DefaultLevel.js          A level: list of entities to spawn
  entities/Entity.js       Entity: an id plus a bag of components
  components/              Data-only classes (one per file)
    tags/                    Marker/flag components with little or no data
  system/                  Logic. One class per system, extends System
    System.js                Base class (listeners, entity lists)
    init/                    Managers that build sprites/physics when an entity is created
    utils/                   Pure helpers used by systems
  services/
    ServiceLocator.js        Global registry (EntityManager, EventBus, ...)
    EntityManager.js         Owns the world, builds each system's entity list
    PrefabFactory.js         Turns level data + defaults into entities
    ComponentClasses.js      Name -> class map; the component registry
    EventBus.js / Events.js  Pub/sub between systems
    EntityStore.js           Static stores (inventories, kill list)
```

## Core concepts

| Concept | In this repo |
|---|---|
| **Entity** | `Entity` instance: an `id` and `components` map. No behaviour. |
| **Component** | A class holding data, constructed as `new XComponent(entity, data)`. Registered by name in `ComponentClasses.js`. |
| **System** | A class extending `System` that declares required component names and processes matching entities every frame in `update()`. |
| **Prefab / type** | An entry in `componentDefaults` (`SharedData.js`), e.g. `pirate`, `player_ship`. A level entity picks a `type` and overrides what it needs. |
| **Level** | A plain object `{ entities: [...] }` plus a Phaser state class that creates the systems. |
| **Services** | `ServiceLocator.resolve("game", "EntityManager")` / `"EventSystem"` give any system access to shared singletons. |

### Data flow

```
Level data (DefaultLevel.js)  ┐
Type defaults (SharedData.js) ┴─> PrefabFactory ─> Entity (+ components)
                                                      │
                                         EntityManager.addEntity
                                                      │
                                    InitManager: sprite, physics, exhaust
                                                      │
        System registers with ["ComponentA","ComponentB"] ─> receives matching entities
                                                      │
                          Level.update() calls each system's update() every frame
```

## How a level is orchestrated

`scripts/level-whiteroom.js` is the reference. In order, `create()` does:

1. `initialiseSpriteLayers()`: creates the named Phaser groups used for draw order.
2. `new EventBus("game")`: registers the event system. **Must come before the EntityManager.**
3. `new EntityManager()`: registers itself in the ServiceLocator.
4. `new PrefabFactory(entityManager, componentDefaults, levelData).loadLevel()`: spawns every entity.
5. Constructs systems. Each calls `entityManager.registerSystem(this, [...requiredComponents])` in its constructor.
6. Wires system-to-system listeners (`inputSystem.addSystemListener(weaponSystem)`).
7. `registerEvents()`: subscribes global event handlers.

`update()` then calls each system's `update()` in the order you choose, so **system order is your execution order**.

To make your own level, copy `level-whiteroom.js`, change the level data and the list of systems, register it in `boot.js` with `game.state.add("MyLevel", MyLevel)` and start it with `game.state.start("MyLevel")`.

See **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** for step-by-step instructions on adding components, systems, entity types, events, and levels.

## Tooling

- `npm start`: dev server (lite-server, live reload).
- ESLint config in `.eslintrc.json` (globals `game`, `Phaser`, `BasicGame`, `PIXI`).
- No test suite or build step yet. Code is served as native ES modules.

## Known limitations

- Level and prefab data live in JS files, not JSON, so they can use comments and imports but are not loaded at runtime.
- The `EntityManager` rebuilds every system's entity list whenever a component is added or removed, so avoid adding/removing components in hot loops.
- `EntityManager.removeEntity` removes an entity from the world and every system list, but the demo doesn't call it (`KillSystem` kills sprites but leaves the entity in the world). Call `initManager.killEntity(entity)` first if you also want its sprite destroyed.

## Traffic game (default scene)

`npm start` opens the traffic network pressure-management game (`?game=whiteroom` loads the old ship sandbox). Switch signal groups (click or keys 1-4) to keep traffic flowing while demand rises. Conflicting movements released together cause incidents, incidents create temporary obstacles, obstacles cause queues, and a full input queue means gridlock. Press `D` for the debug overlay. `npm test` runs the headless simulation tests.

- Level data: `data/levels/*.json` (schema v2, validated by `scripts/traffic/level/validateLevel.js`). Regenerate the compact level with `node tools/generate-network.mjs`.
- Conflict zones are derived from movement path geometry when a level loads; they are never authored by hand.
- Simulation update order (`scripts/traffic/session/TrafficSession.js`): demand, spawn, signals, vehicles, conflicts/incidents, obstacles, junction occupancy, outputs, stats, gridlock. Presentation runs after and only reads the world.
