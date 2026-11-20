import { LevelRegistry } from "./level/LevelRegistry.js";
import { TrafficSession } from "./session/TrafficSession.js";

// Game lifecycle controller. Boot -> load config -> load level -> validate ->
// create session -> attach presentation -> play -> unload. Plain class: Phaser
// states and the HUD call into it, it calls out through `hooks`.
//   hooks.attachPresentation(session) -> presentation | null  (must have update(), destroy())
//   hooks.onLevelLaunched(session), hooks.onLevelUnloaded(), hooks.onError(err)
export class TrafficGame {
  constructor({ provider, hooks = {}, progression = null }) {
    this.progression = progression; // optional Progression: medals and unlocks
    this.provider = provider;
    this.hooks = hooks;
    this.registry = new LevelRegistry(provider);
    this.config = null;
    this.session = null;
    this.presentation = null;
    this.levelId = null;
    this.status = "idle"; // idle | loading | playing | error
    this.reported = false; // the finished run has been rated and recorded
    this.lastResult = null;
  }

  async boot() {
    this.config = await this.provider.getGameConfig();
    await this.registry.refresh();
    if (this.progression) await this.registry.loadMetas();
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
      this.reported = false;
      this.lastResult = null;
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
    let next = this.registry.nextId(this.levelId);
    if (this.progression) {
      const open = this.progression.unlockedIds(this.registry.metas);
      const ids = this.registry.list().map((e) => e.id);
      next = ids.slice(ids.indexOf(this.levelId) + 1).find((id) => open.has(id)) ?? null;
      if (!next) return this.restartLevel();
    }
    return this.launchLevel(next ?? this.registry.list()[0].id);
  }

  // Called once when a run ends (gridlock or shift complete): rate it, store progress, tell the UI.
  finishRun() {
    this.reported = true;
    const summary = this.session.summary();
    const meta = this.registry.metas.find((m) => m.id === this.levelId) ?? { id: this.levelId, ratings: this.session.level.ratings ?? {} };
    this.lastResult = this.progression ? { ...this.progression.record(meta, summary, this.registry.metas), summary } : { summary, medal: null };
    this.hooks.onLevelFinished?.(this.lastResult);
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
    if (this.session.gameOver && !this.reported) this.finishRun();
    this.presentation?.update(realDt);
  }
}
