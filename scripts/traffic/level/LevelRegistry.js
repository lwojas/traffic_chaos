// Lightweight level catalog built from the provider's manifest. Lets the game
// list and launch levels by id without importing anything level-specific.
export class LevelRegistry {
  constructor(provider) {
    this.provider = provider;
    this.entries = [];
    this.metas = []; // [{ id, name, progression, ratings, goal }] in manifest order
  }

  // Loads every level once for its progression/rating metadata (maps are small JSON).
  // A level that fails to load is left out of the list rather than breaking the menu.
  async loadMetas() {
    const metas = [];
    for (const e of this.entries) {
      try {
        const l = await this.provider.getLevel(e.id);
        metas.push({ id: l.id, name: l.name ?? e.name ?? l.id, progression: l.progression ?? {}, ratings: l.ratings ?? {}, goal: l.goal ?? null });
      } catch (err) {
        console.warn(`Level "${e.id}" metadata unavailable:`, err.message);
      }
    }
    return (this.metas = metas);
  }

  async refresh() {
    const manifest = await this.provider.getManifest();
    this.entries = manifest.levels.map((l) => ({ ...l }));
    return this.entries;
  }

  list() {
    return this.entries;
  }

  has(id) {
    return this.entries.some((e) => e.id === id);
  }

  nextId(id) {
    const i = this.entries.findIndex((e) => e.id === id);
    return i >= 0 && i + 1 < this.entries.length ? this.entries[i + 1].id : null;
  }

  load(id) {
    return this.provider.getLevel(id);
  }
}
