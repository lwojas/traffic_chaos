import { TrafficGame } from "./traffic/TrafficGame.js";
import { TrafficPresentation } from "./traffic/presentation/TrafficPresentation.js";
import { DebugPanel } from "./traffic/ui/DebugPanel.js";
import { DebugMode } from "./traffic/ui/DebugMode.js";
import { GameActions } from "./traffic/ui/GameActions.js";
import { GameHud } from "./traffic/ui/hud/GameHud.js";
import { ViewportInput } from "./traffic/ui/ViewportInput.js";
import { ViewCamera } from "./traffic/view/ViewCamera.js";
import { Progression } from "./traffic/progress/Progression.js";
import { LocalJsonProvider } from "./services/data/LocalJsonProvider.js";
import { DEBUG_LAYERS } from "./traffic/presentation/TrafficDebugView.js";

// Thin Phaser state: wires the data provider, presentation, player HUD, input
// router and debug panel into the TrafficGame controller and forwards the frame
// tick. No game logic lives here.
// Use ?data=<url> to read levels from a remote data server instead of data/.
export class TrafficLevel {
  create() {
    // The game fills its container (#game-viewport) and follows its size
    game.scale.scaleMode = Phaser.ScaleManager.RESIZE;

    const quiet = ["decision", "vehicles"]; // busiest layers start off
    const debugFlags = { enabled: false, layers: Object.fromEntries(DEBUG_LAYERS.map((n) => [n, !quiet.includes(n)])) };
    this.debug = new DebugMode(debugFlags);
    const provider = new LocalJsonProvider({ baseUrl: new URLSearchParams(location.search).get("data") ?? "data" });
    let storage = null;
    try {
      storage = window.localStorage; // medals and unlocks persist per browser; absent storage just means no saving
    } catch {
      /* blocked */
    }
    this.app = new TrafficGame({
      provider,
      progression: new Progression(storage),
      hooks: {
        attachPresentation: (session) => {
          const map = session.level.map;
          const camera = new ViewCamera({ world: { w: map.width, h: map.height }, viewport: { w: game.camera.width, h: game.camera.height } });
          const first = session.level.junctions[0].bounds;
          camera.centerOn(first.x + first.w / 2, first.y + first.h / 2); // open on the first junction (a small map just fits)
          return new TrafficPresentation(session, { debugFlags, camera, actions: this.actions });
        },
        onLevelLaunched: (session) => {
          const p = this.app.presentation;
          this.input.bind({ camera: p.camera, worldUi: p.worldUi });
          this.hud.bind(session, p.camera);
          this.panel.onLevelLaunched(session);
        },
        onLevelUnloaded: () => this.input.unbind(),
        onError: (err) => {
          console.error(err);
          this.panel.showError(err);
        },
      },
    });
    this.actions = new GameActions(this.app, this.debug);
    this.actions.onError = (err) => this.panel.showError(err);
    this.input = new ViewportInput({ element: document.getElementById("game-viewport"), canvas: () => game.canvas });
    this.hud = new GameHud(document.getElementById("game-hud"), this.actions);
    this.panel = new DebugPanel(this.app, this.actions, this.debug);
    BasicGame.traffic = this.app; // console access: BasicGame.traffic.session.stats
    this.app.launchLevel().catch((err) => this.panel.showError(err)); // onError also logs
  }

  update() {
    // Real frame time in seconds; physicsElapsed is a fixed step and not reliable here
    const dt = game.time.elapsedMS / 1000;
    this.input.update(dt); // camera moves even while the simulation is paused
    this.app.update(dt);
    this.hud.update(dt);
  }

  shutdown() {
    this.app.unload();
    this.input.destroy();
    this.hud.destroy();
    this.panel.destroy();
  }
}
