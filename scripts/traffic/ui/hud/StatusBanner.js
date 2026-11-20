import { el, Cell } from "../dom.js";

// Centre-of-screen messages: paused hint, and the gridlock (game over) card.
export class StatusBanner {
  constructor(parent, actions) {
    this.paused = el("div", "hud-panel hud-banner hud-paused", "PAUSED   press Space to resume");
    this.over = el("div", "hud-panel hud-banner hud-over");
    this.over.append(el("div", "hud-banner-title", "GRIDLOCK"));
    const detail = el("div", "hud-banner-detail");
    this.over.append(detail);
    const restart = el("button", "hud-button active", "Restart (R)");
    restart.addEventListener("click", () => actions.restart());
    this.over.append(restart);
    this.detail = new Cell(detail);
    this.paused.hidden = this.over.hidden = true;
    parent.append(this.paused, this.over);
  }
  update(m) {
    this.paused.hidden = !(m.paused && !m.gridlock);
    this.over.hidden = !m.gridlock;
    if (m.gridlock) this.detail.set(`${m.gridlock.gate} could not take traffic at ${Math.round(m.gridlock.time)} s.\nScore ${m.score.toLocaleString("en-US")}  ·  Throughput ${m.throughput}  ·  Incidents ${m.incidentsTotal}`);
  }
}
