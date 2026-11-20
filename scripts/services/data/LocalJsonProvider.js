import { JsonHttpProvider } from "./JsonHttpProvider.js";

// Loads JSON packaged with the app (static files next to index.html). Works
// offline and in standalone builds: no data server involved.
//   data/game-config.json, data/levels/manifest.json, data/levels/<file>
export class LocalJsonProvider extends JsonHttpProvider {
  constructor({ baseUrl = "data", ...rest } = {}) {
    super(rest);
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.manifest = null;
  }

  getGameConfig() {
    return this.fetchJson(`${this.baseUrl}/game-config.json`);
  }

  async getManifest() {
    return (this.manifest = await this.fetchJson(`${this.baseUrl}/levels/manifest.json`));
  }

  async getLevel(id) {
    const manifest = this.manifest ?? (await this.getManifest());
    const entry = manifest.levels.find((l) => l.id === id);
    if (!entry) throw new Error(`Unknown level "${id}". Available: ${manifest.levels.map((l) => l.id).join(", ")}`);
    return this.fetchJson(`${this.baseUrl}/levels/${entry.file}`);
  }
}
