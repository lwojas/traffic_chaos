import { Entity } from "../entities/Entity.js";
import { componentClasses } from "./ComponentClasses.js";
import { EntityStore } from "./EntityStore.js";
import { InitManager } from "../system/init/InitManager.js";

export class PrefabFactory {
  constructor(entityManager, componentDefaults, levelData) {
    this.entityManager = entityManager;
    this.componentDefaults = componentDefaults;
    this.levelData = levelData;
  }

  createEntity(entityData) {
    const { type, components, uniqueId } = entityData;

    // Fetch default components for this type, fallback to empty object
    const defaultComponents = this.componentDefaults[type] || {};

    // Check for previous component snapshots
    let inventoryComponents = {};
    EntityStore.inventories.forEach((entity) => {
      entity.forEach((inventoryEntity) => {
        if (uniqueId === inventoryEntity.id) {
          inventoryComponents = inventoryEntity.components;
        }
      });
    });

    // Merge default components with provided components (allowing overrides)
    const mergedComponents = {
      ...defaultComponents,
      ...components,
      ...inventoryComponents,
    };

    // Create new entity
    const entity = new Entity(uniqueId);
    entity.snapshot = mergedComponents;
    // Add merged components to the entity
    for (const [componentName, componentData] of Object.entries(
      mergedComponents
    )) {
      if (componentClasses[componentName]) {
        entity.addComponent(
          new componentClasses[componentName](entity, componentData),
          // For snapshot:
          componentData
        );
      }
    }

    this.entityManager.addEntity(entity);
    return entity;
  }

  // Expands an entry with `amount: N` into N entities. With `spread: true`
  // each copy is offset from the entry's Position on a ring (copy 0 stays put).
  // Copies after the first get a `${uniqueId}_${i}` id so ids stay unique.
  createEntities(entityData) {
    const { amount = 1, spread = false, spreadRadius = 40 } = entityData;
    const count = Math.max(1, Math.floor(amount));
    if (count === 1) return [this.createEntity(entityData)];

    const entities = [];
    for (let i = 0; i < count; i++) {
      // Deep copy so copies never share component data (e.g. Position)
      const components = structuredClone(entityData.components || {});
      const position = components.Position;
      if (spread && position && i > 0) {
        const angle = (i / (count - 1)) * Math.PI * 2;
        position.x += Math.cos(angle) * spreadRadius * Math.ceil(i / 8);
        position.y += Math.sin(angle) * spreadRadius * Math.ceil(i / 8);
      }
      const uniqueId =
        entityData.uniqueId && i > 0
          ? `${entityData.uniqueId}_${i}`
          : entityData.uniqueId;
      entities.push(this.createEntity({ ...entityData, uniqueId, components }));
    }
    return entities;
  }

  loadLevel(levelData = this.levelData) {
    return levelData.entities.flatMap((entityData) =>
      this.createEntities(entityData)
    );
  }
}
