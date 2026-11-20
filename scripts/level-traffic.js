import { TrafficGame } from "./traffic/TrafficGame.js";
import { TrafficPresentation } from "./traffic/presentation/TrafficPresentation.js";
import { TrafficHud } from "./traffic/ui/TrafficHud.js";
import { LocalJsonProvider } from "./services/data/LocalJsonProvider.js";
import { DEBUG_LAYERS } from "./traffic/presentation/TrafficDebugView.js";

// Thin Phaser state: wires the data provider, presentation and HUD into the
// TrafficGame controller and forwards the frame tick. No game logic lives here.
// Use ?data=<url> to read levels from a remote data server instead of data/.
export class TrafficLevel {
  create() {
    const quiet = ["decision", "vehicles"]; // busiest layers start off
    const debugFlags = { enabled: false, layers: Object.fromEntries(DEBUG_LAYERS.map((n) => [n, !quiet.includes(n)])) };
    const provider = new LocalJsonProvider({ baseUrl: new URLSearchParams(location.search).get("data") ?? "data" });
    this.app = new TrafficGame({
      provider,
      hooks: {
        attachPresentation: (session) => new TrafficPresentation(session, debugFlags),
        onLevelLaunched: (session) => this.hud.onLevelLaunched(session),
        onError: (err) => {
          console.error(err);
          this.hud.showError(err);
        },
      },
    });
    this.hud = new TrafficHud(this.app, debugFlags);
    BasicGame.traffic = this.app; // console access: BasicGame.traffic.session.stats
    this.app.launchLevel().catch((err) => this.hud.showError(err)); // onError also logs
  }

  update() {
    // Real frame time in seconds; physicsElapsed is a fixed step and not reliable here
    this.app.update(game.time.elapsedMS / 1000);
  }

  shutdown() {
    this.app.unload();
    this.hud.destroy();
  }
}
