# Implementation Guide

How to build a game on this engine. Read the [README](README.md) first for the layout and concepts. `scripts/level-whiteroom.js` is the worked example referred to throughout.

## 1. Startup sequence

1. `index.html` loads `scripts/phaser.js`, then `scripts/init.js` (classic script), then `scripts/boot.js` (ES module).
2. `init.js` creates the globals `BasicGame` (namespace) and `game` (`new Phaser.Game(1280, 720, Phaser.CANVAS)`). Change resolution here.
3. `boot.js` defines the `Boot` state:
   - `preload()`: load every asset by key (`this.load.image("pixelWhite", "assets/_pixel_white.png")`). **Sprite keys used in level data must be loaded here.**
   - `create()`: sets world bounds (2000x2000), starts Arcade physics, then `game.state.start("Whiteroom")`.
4. `window.onload` registers the states (`Boot`, `Whiteroom`) and starts `Boot`.

## 2. Creating a level

A level is a Phaser state class with `create()`, `update()`, `shutdown()`.

```js
// scripts/level-mylevel.js
import { ServiceLocator } from "./services/ServiceLocator.js";
import { EventBus } from "./services/EventBus.js";
import { EntityManager } from "./services/EntityManager.js";
import { PrefabFactory } from "./services/PrefabFactory.js";
import { registerEvents } from "./services/Events.js";
import { componentDefaults } from "./data/SharedData.js";
import { myLevel } from "./data/MyLevel.js";
import { initialiseSpriteLayers } from "./system/utils/spriteLayers.js";
import { InputSystem } from "./system/InputSystem.js";
import { MotionSystemShip } from "./system/MotionSystemShip.js";
import { CameraSystem } from "./system/CameraSystem.js";

export class MyLevel {
  create() {
    initialiseSpriteLayers();
    new EventBus("game");                       // 1. before EntityManager
    this.entityManager = new EntityManager();   // 2.
    this.entities = new PrefabFactory(          // 3. spawn entities
      this.entityManager, componentDefaults, myLevel
    ).loadLevel();

    this.movementSystem = new MotionSystemShip();           // 4. systems
    this.inputSystem = new InputSystem(this.movementSystem);
    this.cameraSystem = new CameraSystem(this.entities);

    registerEvents();                           // 5. global event handlers
  }

  update() {
    this.inputSystem.update();
    this.movementSystem.update();
  }

  shutdown() { ServiceLocator.shutDown(); }
}
```

Then register it in `boot.js`:

```js
import { MyLevel } from "./level-mylevel.js";
// ...
game.state.add("MyLevel", MyLevel);
// and in Boot.create(): game.state.start("MyLevel");
```

Rules that matter:

- **Order of construction**: `EventBus("game")` -> `EntityManager` -> entities -> systems. `EntityManager` and `Entity` resolve services at construction time and will throw otherwise.
- **Entities before systems**: `registerSystem` filters the entities that exist when it is called. Entities/components added later are picked up via the `G_REFRESH_ENTITY_LISTS` event (fired by `Entity.addComponent/removeComponent` through `EntityManager.updateEntityLists`).
- **Update order = call order** in `update()`. Put input before movement, movement before collision, and so on.
- Always call `ServiceLocator.shutDown()` in `shutdown()` so a restarted level does not see stale services.

## 3. Defining entities

### 3.1 Entity types (prefabs): `data/SharedData.js`

```js
export const componentDefaults = {
  crate: {
    SpriteComponent: { spriteKey: "defaultObject", layer: "fg3" },
    PhysicsDynamicComponent: {},
    HealthComponent: { health: 30 },
    CollideComponent: {},
  },
};
```

Each key is a `type`. Each value maps **component class name -> constructor data**.

### 3.2 Level data: `data/DefaultLevel.js`

```js
export const myLevel = {
  entities: [
    { type: "crate", uniqueId: "crate_1",
      components: { Position: { x: 400, y: 300 }, HealthComponent: { health: 80 } } },
  ],
};
```

Fields:

| Field | Meaning |
|---|---|
| `type` | Key in `componentDefaults`. Unknown types give an entity with only the level's own components. |
| `uniqueId` | Optional stable id. Used to restore inventory snapshots (`EntityStore.inventories`) across levels. Auto-generated as `entity_N` if absent. |
| `components` | Overrides, merged over the defaults **per component name** (shallow: the whole component data object is replaced, not deep-merged). |

Notes:

- Component data given as `""` is fine for tag components (`InputComponent: ""`).
- A component name missing from `ComponentClasses.js` is **silently skipped**. If a component "does nothing", check the registry first.
- Every entity that should appear on screen needs a `Position` and a `SpriteComponent`. `InitManager.initEntity` returns early without a `SpriteComponent`, so no sprite, no physics.
- `SpriteComponent` options: `spriteKey`, `layer` (one of `bg0..bg4`, `fg0..fg6`, `lighting`, `shadows`, `debug`; default `fg0`), `scale`, `fixed` (fixed to camera), `enabled`.
- Physics: `PhysicsDynamicComponent` adds an Arcade body that moves; `PhysicsStaticComponent` adds an immovable one. Both are created by `PhysicsManager`.

### 3.3 What the demo types do

| Type | Purpose |
|---|---|
| `player_ship` | Input, ship motion, camera follow, weapons, ammo, health, faction |
| `pirate`, `trader` | NPC ships: perception, emotion, intelligence, AI state, patrol, goal, faction |
| `trigger` | Position-based interactable. Fires `TriggerComponent.action` as an event |
| `weapon`, `projectile` | Weapon and bullet definitions |
| `background` | No defaults, a level supplies the sprite (backdrops, shadow casters, lights) |

## 4. Adding a component

1. Create `scripts/components/MyComponent.js`. Constructor signature is always `(entity, data)`:

   ```js
   export class FuelComponent {
     constructor(entity, data) {
       this.entity = entity;
       this.fuel = data.fuel ?? 100;
       this.burnRate = data.burnRate ?? 1;
     }
     unmount() {}   // optional: called by entity.removeComponent
   }
   ```

   Put flag-only components in `components/tags/`.
2. Register it in `services/ComponentClasses.js` (import + add to the map). The map key **must equal the class name**, because `Entity.addComponent` stores components under `component.constructor.name`.
3. Use it in `SharedData.js` or level data by that name.

Keep components as data only. Logic belongs in systems.

## 5. Adding a system

All systems extend `System` (`system/System.js`).

```js
// scripts/system/FuelSystem.js
import { System } from "./System.js";

export class FuelSystem extends System {
  constructor() {
    super();
    // Returns the matching entities and registers this system for refreshes
    this.entities = this.entityManager.registerSystem(this, [
      "FuelComponent",
      "MotionShipComponent",
    ]);
  }

  update() {
    this.entities.forEach((entity) => {
      const fuel = entity.getComponent("FuelComponent");
      fuel.fuel -= fuel.burnRate * (game.time.physicsElapsed);
    });
  }
}
```

Then in the level: `this.fuelSystem = new FuelSystem();` and `this.fuelSystem.update();` in the level's `update()`.

What `registerSystem` gives you on the system instance:

| Property | Contents |
|---|---|
| `this.entities` | Enabled entities that have **all** required components |
| `this.componentLists[name]` | Component instances aligned with `entities` |
| `this.actors` | Phaser sprites aligned with `entities` |
| `refreshList()` | Optional hook, called after the lists are rebuilt. Override to re-cache. |

Because the lists are rebuilt in place on the system, reassign nothing yourself and always read `this.entities` fresh inside `update()`.

### System-to-system messaging

`System` has a small listener mechanism for direct, synchronous hand-offs:

```js
this.inputSystem.addSystemListener(this.weaponSystem);  // in the level
// inside InputSystem:
this.sendInteraction("space");   // calls listener.receiveInteraction(entities, args)
// also sendControl -> receiveControl, sendUpdate -> receiveUpdate
```

Override `receiveControl`, `receiveInteraction` or `receiveUpdate` in the receiving system. `InputSystem` -> `MotionSystemShip` goes through `controlResolver`, which decides whether an entity is driven by player input or by AI (`AIState`).

### Helpers

Reusable logic that is not tied to a system lives in `system/utils/` (damage, range checks, explosions, tracing physics shapes, light culling, sprite layers). Prefer adding a helper and importing it over duplicating logic.

## 6. Events

Use the event bus for decoupled, game-wide notifications.

```js
const events = ServiceLocator.resolve("game", "EventSystem");
events.on("G_MY_EVENT", (a, b) => { /* ... */ });
events.emit("G_MY_EVENT", a, b);
```

- Global handlers are registered in `services/Events.js` -> `registerEvents()`.
- `emit` on an event with no listeners logs a warning.
- `TriggerComponent.action` names an event. When a trigger fires, the `TriggerSystem` emits it with `(triggerEntity, targetEntity)`. Example: `G_CHANGE_SPRITE` swaps a sprite, `G_ADD_AMMO` and `G_INVENTORY_ADD_ITEM` feed inventory/ammo.
- Built-in events: `G_REFRESH_ENTITY_LISTS`, `G_SPRITE_UPDATED`.

Naming convention: `G_` prefix for the `game` domain.

## 7. Services

`ServiceLocator.register(domain, name, instance)` / `resolve(domain, name)`. Domains: `"system"`, `"game"`. Game-domain services are cleared in `shutDown()`.

Used by the engine: `EntityManager`, `EventSystem`, `DebugSystem`. Register your own singletons the same way.

## 8. Feature recipes

**Trigger that fires a custom action when the player presses space nearby**

```js
{ type: "trigger", components: {
    Position: { x: 200, y: 100 },
    CheckConditionComponent: { conditions: [{ type: "keyPress", key: "space" }] },
    TriggerComponent: { action: "G_MY_EVENT", args: { foo: 1 } },
} }
```

plus `events.on("G_MY_EVENT", ...)` in `Events.js`. The player needs `TriggerSendComponent` (already in `player_ship`).

**Dynamic light with shadows**

```js
LightComponent: { sprites: [{ scale: 4, sprite: "defaultLight" }], castShadows: true, isSpot: false }
```

Shadow casters add `ShadowComponent: { sprite: "testRoom", scale: 1, complex: true }` (`complex` traces the PNG outline into a polygon). Requires `LightSystem` in the level. Light sprites render in the `lighting` layer.

**NPC with AI**

Use the `pirate` or `trader` type. Behaviour is driven by `PerceptionSystem` (what the NPC sees) -> `AIScoringSystem` (scores actions from faction, emotion, intelligence) -> `AIState` / `controlResolver` -> `MotionSystemShip`. `PatrolComponent` and `GoalComponent` (e.g. `{ type: "escort_player" }`) provide waypoint and goal behaviour. Include `PerceptionSystem`, `AIScoringSystem` and `MotionSystemShip` in the level.

**Make an NPC player-controlled** (the whiteroom does this for `trader_test`): give it `InputComponent: ""` and `MotionShipComponent: ""` in its level overrides.

**Spawn several copies**: a level entry with `amount: N` creates N entities (see the `pirate_test` entry). Each copy gets its own deep-copied component data. Copy 0 keeps the entry's `uniqueId`; the others get `<uniqueId>_<i>`. Add `spread: true` to fan the copies out around the entry's `Position` (override the distance with `spreadRadius`, default 40). Spread only moves a `Position` given in the level entry's `components`, not one that comes from the type defaults.

## 9. Debugging

- `BasicGame.entities` and `BasicGame.service` are exposed on `window` by the whiteroom, so in the browser console you can run `BasicGame.entities[0].components`.
- `DebugSystem` owns a camera-fixed bitmap (`debug` layer) for drawing overlays; use `debugTools.js` helpers.
- `EntityManager` logs system registrations and refreshes to the console. Silence them if too noisy.
- Common failures:

| Symptom | Likely cause |
|---|---|
| `Failed to find service: "EventSystem"` | `EventBus("game")` not created before `EntityManager`/`Entity` |
| Entity does not appear | Missing `Position`/`SpriteComponent`, sprite key not preloaded in `boot.js`, or wrong layer |
| Component has no effect | Not registered in `ComponentClasses.js`, or name typo |
| System never sees an entity | Entity lacks one of the required components, is disabled, or was created after registering and no refresh fired |
| Blank page / module errors | Opened via `file://`, or a missing import path (paths are case-sensitive) |

## 10. Checklist for a new project

1. Clone, `npm install`, `npm start`; confirm the whiteroom runs.
2. Add your art to `assets/` and preload it in `boot.js`.
3. Define entity types in `data/SharedData.js`.
4. Write your level data in `data/`.
5. Copy `level-whiteroom.js`, trim the systems you do not need, add yours.
6. Register the state in `boot.js` and start it.
7. Add components/systems as in sections 4 and 5.
