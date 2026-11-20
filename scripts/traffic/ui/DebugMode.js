// Debug mode: the development panel plus the world overlay. Shared state so the
// player HUD (a toggle button), keyboard and the panel itself agree. Owns
// nothing about the simulation.
export class DebugMode {
  constructor(flags) {
    this.flags = flags; // { enabled (world overlay), layers }
    this.open = false; // debug panel visible
    this.listeners = new Set();
  }

  // Panel and overlay together, as one "debug mode" switch.
  toggle() {
    this.set(!this.open);
  }

  set(on) {
    this.open = on;
    this.flags.enabled = on;
    document.body.classList.toggle("debug-open", on);
    // The game viewport changed size: let the engine's scale manager re-measure it
    window.dispatchEvent(new Event("resize"));
    for (const fn of this.listeners) fn(this);
  }

  setOverlay(on) {
    this.flags.enabled = on;
    for (const fn of this.listeners) fn(this);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
