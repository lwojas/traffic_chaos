import { el, Cell, clock } from "../dom.js";

const MEDAL_GLYPH = { bronze: "★", silver: "★★", gold: "★★★" };
const KEY_TEXT = { time: (n) => `survive ${clock(n)}`, earned: (n) => `earn $${Math.round(n).toLocaleString("en-US")}`, satisfaction: (n) => `average ${Math.round(n * 100)}% satisfaction`, incidents: (n) => `at most ${n} crash${n === 1 ? "" : "es"}` };

// Centre-of-screen messages: paused hint and the end-of-run result card. The
// card is the replay hook: it names the medal earned and the single clearest
// thing to improve for the next one.
export class StatusBanner {
  constructor(parent, actions, onMaps = () => {}) {
    this.actions = actions;
    this.paused = el("div", "hud-panel hud-banner hud-paused", "PAUSED   press Space to resume");
    this.over = el("div", "hud-panel hud-banner hud-result");
    this.title = new Cell(el("div", "hud-banner-title", ""));
    this.medal = el("div", "hud-medal");
    this.medalCell = new Cell(this.medal);
    this.detail = new Cell(el("div", "hud-banner-detail", ""));
    this.next = new Cell(el("div", "hud-result-next", ""));
    const buttons = el("div", "hud-result-actions");
    const retry = el("button", "hud-button hud-action", "Retry (R)");
    retry.addEventListener("click", () => actions.restart());
    this.nextButton = el("button", "hud-button", "Next map");
    this.nextButton.addEventListener("click", () => actions.nextLevel());
    const maps = el("button", "hud-button", "Maps");
    maps.addEventListener("click", onMaps);
    buttons.append(retry, this.nextButton, maps);
    this.over.append(this.title.node, this.medal, this.detail.node, this.next.node, buttons);
    this.paused.hidden = this.over.hidden = true;
    parent.append(this.paused, this.over);
    this.shownFor = null;
  }

  update(m) {
    const done = m.status !== "running";
    this.paused.hidden = !(m.paused && !done);
    this.over.hidden = !done;
    if (!done) {
      this.shownFor = null;
      return;
    }
    const win = m.status === "complete";
    this.over.classList.toggle("win", win);
    this.title.set(win ? "SHIFT COMPLETE" : "GRIDLOCK");
    const r = m.result;
    const lines = [];
    if (!win && m.gridlock) lines.push(`${m.gridlock.gate} could not take traffic.`);
    lines.push(`Survived ${clock(r.time)}  ·  Earned $${Math.round(r.earned).toLocaleString("en-US")}`);
    lines.push(`Satisfaction avg ${Math.round(r.avgSatisfaction * 100)}%  ·  Best ${Math.round(r.peakSatisfaction * 100)}%  ·  Crashes ${r.incidents}`);
    this.detail.set(lines.join("\n"));
    const result = this.actions.app.lastResult;
    if (!result) return;
    const medal = result.medal;
    this.medalCell.set(medal ? MEDAL_GLYPH[medal] : "–");
    this.medal.dataset.medal = medal ?? "none";
    const notes = [];
    notes.push(medal ? `${medal.toUpperCase()}${result.improved ? " — new best" : ""}` : "No medal yet");
    if (result.next?.medal) notes.push(`For ${result.next.medal.toUpperCase()}: ${result.next.missing.map((x) => KEY_TEXT[x.key](x.need)).join(", ")}`);
    for (const u of result.unlocked ?? []) notes.push(`Unlocked: ${u.name}`);
    this.next.set(notes.join("\n"));
    const hasNext = this.actions.app.progression ? this.actions.hasNextOpen() : true;
    this.nextButton.hidden = !hasNext;
  }
}
