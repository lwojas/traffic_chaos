import { DataProvider } from "./DataProvider.js";

// In-memory provider for tests and tools. Levels are deep-copied on read so
// callers cannot mutate the source.
export class MemoryDataProvider extends DataProvider {
  constructor({ gameConfig, levels }) {
    super();
    this.gameConfig = gameConfig;
    this.levels = levels; // { [id]: levelJson }
  }
  async getGameConfig() {
    return structuredClone(this.gameConfig);
  }
  async getManifest() {
    return { levels: Object.values(this.levels).map((l) => ({ id: l.id, name: l.name })) };
  }
  async getLevel(id) {
    if (!this.levels[id]) throw new Error(`Unknown level "${id}"`);
    return structuredClone(this.levels[id]);
  }
}
