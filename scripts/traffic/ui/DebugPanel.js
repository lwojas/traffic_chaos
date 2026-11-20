import { DEBUG_LAYERS } from "../presentation/TrafficDebugView.js";

const STAT_ROWS = [
  ["Sim time", (s) => `${s.time.toFixed(1)} s`],
  ["Demand", (s) => `${s.demandRate.toFixed(2)} / sec`],
  ["Throughput", (s) => s.completed],
  ["Incidents", (s) => s.incidents],
  ["Score", (s) => s.score],
  ["Network capacity", (s) => `${(s.networkCapacity * 100).toFixed(0)} %`],
  ["Network load", (s) => `${(s.networkLoad * 100).toFixed(0)} %`],
  ["Active obstacles", (s) => `${s.activeObstacles} (${s.blockedLanes} lanes blocked)`],
  ["On road / stopped", (s) => `${s.current} / ${s.waiting}`],
  ["Throughput /min", (s) => s.throughputPerMin.toFixed(1)],
  ["Avg wait", (s) => `${s.avgWaitTime.toFixed(1)} s`],
  ["Held at green (no room)", (s) => s.blockedEntries],
  ["Junction blocked events", (s) => s.blockedJunctionEvents],
];

const STATE_LABEL = ["RED", "YELLOW", "GREEN"];
const GROUP_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// Development panel (debug mode). Detailed simulation state, every signal group,
// level switching and the debug-overlay layers. The player HUD (hud/GameHud.js)
// is deliberately much simpler and does not depend on this. Talks to the game
// through GameActions; reads the ECS world only to display it, never writes.
export class DebugPanel {
  constructor(app, actions, debug, root = document.getElementById("debug-panel")) {
    this.app = app;
    this.actions = actions;
    this.debug = debug;
    this.flags = debug.flags;
    this.root = root;
    this.statCells = [];
    this.groups = [];
    this.gates = [];
    this.build();
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener("keydown", this.onKey);
    this.unsubscribe = debug.onChange(() => {
      this.syncDebug();
      if (debug.open) this.refresh();
    });
    this.timer = setInterval(() => this.debug.open && this.refresh(), 150);
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <h1>Traffic Control: debug</h1>
      <div class="banner" data-id="banner"></div>
      <div class="row"><select data-id="level"></select></div>
      <div class="row">
        <button data-act="restart">Restart (R)</button>
        <button data-act="reload" title="Re-fetch level JSON and restart">Reload data</button>
        <button data-act="next">Next level</button>
      </div>
      <div class="row">
        <button data-act="pause">Pause (Space)</button>
        <button data-act="step" title="Advance one tick while paused">Step (.)</button>
      </div>
      <div class="row speeds"></div>
      <h2>Signals</h2><div data-id="signals"></div>
      <h2>Input queues</h2><div data-id="gates"></div>
      <h2>Network</h2><table data-id="stats"></table>
      <h2>Obstacles</h2><div data-id="obstacles" class="obstacles"></div>
      <h2>Debug <label class="inline"><input type="checkbox" data-id="debug"> overlay (D)</label></h2>
      <div data-id="layers" class="layers"></div>
      <div class="perf" data-id="perf"></div>
      <div class="error" data-id="error"></div>
      <p class="hint">Signals are normally switched from the world; here you can switch any of them (or press 1-9). Debug mode: D. Green is instant; red goes through yellow first. Nothing stops you opening conflicting movements, and nothing adds a gap between phases: wait for the old group to clear before opening the next. Speed: Q / W / E. Click a car in debug mode to trace it.</p>`;
    r.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) this.act(b.dataset.act, b.dataset);
    });
    r.querySelector('[data-id="level"]').addEventListener("change", (e) => this.actions.launchLevel(e.target.value));
    r.querySelector('[data-id="debug"]').addEventListener("change", (e) => this.debug.setOverlay(e.target.checked));
    const layers = r.querySelector('[data-id="layers"]');
    for (const name of DEBUG_LAYERS) {
      const label = document.createElement("label");
      label.className = "inline";
      label.innerHTML = `<input type="checkbox" ${this.flags.layers[name] ? "checked" : ""} data-layer="${name}"> ${name}`;
      label.firstElementChild.addEventListener("change", (e) => (this.flags.layers[name] = e.target.checked));
      layers.appendChild(label);
    }
    this.stats = r.querySelector('[data-id="stats"]');
    for (const [label] of STAT_ROWS) {
      const tr = this.stats.insertRow();
      tr.insertCell().textContent = label;
      this.statCells.push(tr.insertCell());
    }
  }

  // Called when a level is launched: refresh anything level-specific.
  onLevelLaunched(session) {
    this.root.querySelector('[data-id="error"]').textContent = "";
    const sel = this.root.querySelector('[data-id="level"]');
    sel.innerHTML = this.app.registry.list().map((l) => `<option value="${l.id}">${l.name}</option>`).join("");
    sel.value = this.app.levelId;

    const speeds = this.root.querySelector(".speeds");
    speeds.innerHTML = (this.app.config.simulation.speeds ?? [1]).map((x) => `<button data-act="speed" data-speed="${x}">×${x}</button>`).join("");

    this.groups = [];
    this.gates = [];
    const signals = this.root.querySelector('[data-id="signals"]');
    const gates = this.root.querySelector('[data-id="gates"]');
    signals.innerHTML = "";
    gates.innerHTML = "";
    session.entityManager.world.forEach((e) => {
      const g = e.getComponent("SignalGroupComponent");
      if (g) this.groups.push(g);
      const gate = e.getComponent("InputGateComponent");
      if (gate) this.gates.push(gate);
    });
    this.groups.forEach((g, i) => {
      const b = document.createElement("button");
      b.className = "signal-btn";
      b.dataset.act = "toggle";
      b.dataset.group = g.levelId;
      b.innerHTML = `<span class="key">${GROUP_KEYS[i] ?? ""}</span><span class="name">${g.label}</span><span class="state" data-state></span>`;
      signals.appendChild(b);
    });
    this.gates.forEach((g) => {
      const row = document.createElement("div");
      row.className = "gate";
      row.innerHTML = `<div class="gate-title"><span>${g.label}</span><span data-gate-count></span></div><div class="bar"><div class="fill" data-gate-fill></div></div>`;
      gates.appendChild(row);
    });
    this.refresh();
  }

  showError(err) {
    this.root.querySelector('[data-id="error"]').textContent = err.message;
  }

  act(action, data) {
    const a = this.actions;
    switch (action) {
      case "restart": return a.restart();
      case "reload": return a.reloadData();
      case "next": return a.nextLevel();
      case "pause": return a.togglePause();
      case "step": return a.step();
      case "speed": return a.setSpeed(Number(data.speed));
      case "toggle": return a.toggleSignal(data.group);
    }
  }

  // Pause, restart, speed and debug-mode keys belong to the game HUD; the panel keeps step and the 1-9 signal shortcuts.
  handleKey(e) {
    if (!this.debug.open || !this.app.session || ["SELECT", "INPUT"].includes(e.target.tagName) || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === ".") this.act("step");
    else {
      const i = GROUP_KEYS.indexOf(key);
      if (i >= 0 && this.groups[i]) this.act("toggle", { group: this.groups[i].levelId });
    }
  }

  syncDebug() {
    this.root.querySelector('[data-id="debug"]').checked = this.flags.enabled;
  }

  refresh() {
    const s = this.app.session;
    if (!s) return;
    const st = s.stats;
    STAT_ROWS.forEach(([, fmt], i) => (this.statCells[i].textContent = fmt(st)));
    const pause = this.root.querySelector('[data-act="pause"]');
    pause.textContent = s.sim.paused ? "Resume (Space)" : "Pause (Space)";
    this.root.querySelectorAll('[data-act="speed"]').forEach((b) => b.classList.toggle("active", Number(b.dataset.speed) === s.sim.speed));

    this.root.querySelectorAll(".signal-btn").forEach((b, i) => {
      const g = this.groups[i];
      b.dataset.state = STATE_LABEL[g.state].toLowerCase();
      b.querySelector("[data-state]").textContent = `${STATE_LABEL[g.state]} ${g.timeInState.toFixed(1)}s`;
    });
    this.root.querySelectorAll(".gate").forEach((row, i) => {
      const g = this.gates[i];
      const frac = g.queue.length / g.queueCapacity;
      row.classList.toggle("full", g.queue.length >= g.queueCapacity);
      row.querySelector("[data-gate-count]").textContent = `${g.queue.length} / ${g.queueCapacity}  (${g.rate.toFixed(2)}/s)`;
      row.querySelector("[data-gate-fill]").style.width = `${Math.min(1, frac) * 100}%`;
    });

    const obstacles = [];
    s.entityManager.world.forEach((e) => {
      const o = e.getComponent("ObstacleComponent");
      if (o) obstacles.push(`${o.kind}: ${o.blocks.length} blocked, clears in ${Math.max(0, o.remaining).toFixed(1)}s`);
    });
    this.root.querySelector('[data-id="obstacles"]').textContent = obstacles.length ? obstacles.join("\n") : "none";

    const banner = this.root.querySelector('[data-id="banner"]');
    if (s.gameOver) {
      banner.textContent = `GRIDLOCK at ${s.sim.gridlockTime.toFixed(0)} s. ${s.sim.gridlockGate.getComponent("InputGateComponent").label} could not take traffic. Throughput ${st.completed}, incidents ${st.incidents}, score ${st.score}. Press R to retry.`;
      banner.classList.add("show");
    } else {
      banner.textContent = "";
      banner.classList.remove("show");
    }
    const fps = typeof game !== "undefined" && game.time ? game.time.fps : 0;
    this.root.querySelector('[data-id="perf"]').textContent =
      `fps ${fps}  tick ${s.perf.tickMs.toFixed(3)} ms (max ${s.perf.tickMsMax.toFixed(2)})  entities ${s.entityManager.world.length}`;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.unsubscribe();
    clearInterval(this.timer);
  }
}
