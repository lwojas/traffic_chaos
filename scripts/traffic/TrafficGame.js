import { LevelRegistry } from "./level/LevelRegistry.js";
import { TrafficSession } from "./session/TrafficSession.js";

// Game lifecycle controller. Boot -> load config -> load level -> validate ->
// create session -> attach presentation -> play -> unload. Plain class: Phaser
// states and the HUD call into it, it calls out through `hooks`.
//   hooks.attachPresentation(session) -> presentation | null  (must have update(), destroy())
//   hooks.onLevelLaunched(session), hooks.onLevelUnloaded(), hooks.onError(err)
export class TrafficGame {
  constructor({ provider, hooks = {} }) {
    this.provider = provider;
    this.hooks = hooks;
    this.registry = new LevelRegistry(provider);
    this.config = null;
    this.session = null;
    this.presentation = null;
    this.levelId = null;
    this.status = "idle"; // idle | loading | playing | error
  }

  async boot() {
    this.config = await this.provider.getGameConfig();
    await this.registry.refresh();
    return this.config;
  }

  async launchLevel(id) {
    if (!this.config) await this.boot();
    id = id ?? this.config.startLevel;
    this.unload();
    this.status = "loading";
    try {
      const level = await this.registry.load(id);
      this.levelId = id;
      this.session = TrafficSession.create(level, this.config);
      this.presentation = this.hooks.attachPresentation?.(this.session) ?? null;
      this.status = "playing";
      this.hooks.onLevelLaunched?.(this.session);
      return this.session;
    } catch (err) {
      this.unload();
      this.status = "error";
      this.hooks.onError?.(err);
      throw err;
    }
  }

  // Rebuilds the world from the same level data; seeded, so it replays identically.
  restartLevel() {
    return this.launchLevel(this.levelId ?? undefined);
  }

  // Re-fetches level data from the provider first (edit JSON, hit reload).
  async reloadLevelData() {
    await this.registry.refresh();
    return this.launchLevel(this.levelId ?? undefined);
  }

  async loadNextLevel() {
    const next = this.registry.nextId(this.levelId);
    return this.launchLevel(next ?? this.registry.list()[0].id);
  }

  unload() {
    if (this.presentation) this.presentation.destroy();
    this.presentation = null;
    if (this.session) {
      this.session.dispose();
      this.session = null;
      this.hooks.onLevelUnloaded?.();
    }
    if (this.status === "playing") this.status = "idle";
  }

  update(realDt) {
    if (!this.session) return;
    this.session.advance(realDt);
    this.presentation?.update(realDt);
  }
}
