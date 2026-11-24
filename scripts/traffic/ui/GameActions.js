// Everything the player or the debug panel can ask the game to do, in one place.
// UI code calls these; they translate into lifecycle calls on the TrafficGame or
// simulation commands on the session. Nothing in the UI mutates ECS components.
export class GameActions {
  constructor(app, debug) {
    this.app = app;
    this.debug = debug;
    this.onError = (err) => console.error(err);
  }

  get session() {
    return this.app.session;
  }

  get speeds() {
    return this.app.config?.simulation.speeds ?? [1];
  }

  guard(promise) {
    promise.catch((err) => this.onError(err));
  }

  restart() {
    this.guard(this.app.restartLevel());
  }
  reloadData() {
    this.guard(this.app.reloadLevelData());
  }
  nextLevel() {
    this.guard(this.app.loadNextLevel());
  }
  launchLevel(id) {
    this.guard(this.app.launchLevel(id));
  }
  // Map list with locks and medals for the level-select panel
  mapList() {
    const metas = this.app.registry.metas;
    return this.app.progression ? this.app.progression.list(metas) : metas.map((m) => ({ id: m.id, name: m.name, blurb: m.progression?.blurb ?? "", unlocked: true, medal: null, requires: null }));
  }
  hasNextOpen() {
    const app = this.app;
    const ids = app.registry.list().map((e) => e.id);
    const open = app.progression.unlockedIds(app.registry.metas);
    return ids.slice(ids.indexOf(app.levelId) + 1).some((id) => open.has(id));
  }

  togglePause() {
    const s = this.session;
    if (s) s.setPaused(!s.sim.paused);
  }
  step() {
    const s = this.session;
    if (s && s.sim.paused) s.step(1);
  }
  setSpeed(multiplier) {
    this.session?.setSpeed(multiplier);
  }

  // The signal command used by world controls, the debug panel and keys.
  toggleSignal(groupId) {
    const s = this.session;
    if (s && !s.gameOver) s.toggleSignal(groupId);
  }

  // A command has been queued for this group but not yet applied by a tick (the game is paused).
  isSignalPending(groupId) {
    const s = this.session;
    if (!s) return false;
    const cmds = s.sim.commands;
    for (let i = 0; i < cmds.length; i++) if (cmds[i].group === groupId) return true;
    return false;
  }

  // Spend cash on an intervention. The simulation re-checks it at the next tick.
  tow(obstacleId) {
    const s = this.session;
    if (s && !s.gameOver) s.intervene("tow", obstacleId);
  }

  // The road crew fixes roadworks (the tow truck clears crashes).
  crew(obstacleId) {
    const s = this.session;
    if (s && !s.gameOver) s.intervene("crew", obstacleId);
  }

  toggleDebug() {
    this.debug.toggle();
  }
}
