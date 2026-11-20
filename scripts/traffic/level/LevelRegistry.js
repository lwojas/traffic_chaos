// Lightweight level catalog built from the provider's manifest. Lets the game
// list and launch levels by id without importing anything level-specific.
export class LevelRegistry {
  constructor(provider) {
    this.provider = provider;
    this.entries = [];
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
