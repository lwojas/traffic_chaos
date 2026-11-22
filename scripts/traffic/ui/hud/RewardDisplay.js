import { el, Cell } from "../dom.js";
import { icon } from "../icons.js";

const CASH_DIGITS = 6; // reserved tiles: up to $999,999 without the counter changing size

// The reward read-out, top-centre. Reads left to right as the rule does:
//   MULTIPLIER (how well is traffic flowing?) -> SCORE and CASH (what each exit pays).
//
// Every vehicle that reaches an exit adds base points and base cash x the multiplier shown here.
// The multiplier falls as congestion rises and recovers as it clears; the line under its bar says
// how much congestion is costing right now.
export class RewardDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-reward");

    const mult = el("div", "hud-mult-chip");
    const top = el("div", "hud-mult-head");
    top.append(icon("gauge", 14));
    top.append(el("span", "hud-label", "MULTIPLIER"));
    this.mult = new Cell(el("b", "hud-mult-x", "×1.0"));
    top.append(this.mult.node);
    const track = el("span", "hud-track hud-mult-track");
    this.bar = new Cell(el("span", "hud-fill"));
    track.append(this.bar.node);
    this.why = new Cell(el("div", "hud-mult-why", ""));
    mult.append(top, track, this.why.node);
    this.multRoot = mult;

    const score = el("div", "hud-score");
    score.append(el("div", "hud-label", "SCORE"));
    this.score = new Cell(el("b", "hud-score-value", "0"));
    score.append(this.score.node);

    const cash = el("div", "hud-cash");
    cash.append(el("div", "hud-label", "CASH"));
    this.tiles = el("div", "hud-tiles");
    cash.append(this.tiles);
    this.tileNodes = [];
    this.shown = "";
    this.lead = -1;

    this.root.append(mult, score, cash);
    parent.append(this.root);
  }

  // The counter reserves a fixed number of tiles, so it never changes width as
  // cash grows. Unused leading tiles are ghosted; it only widens if cash ever
  // exceeds the reserved digits.
  setDigits(value) {
    const n = Math.max(CASH_DIGITS, String(value).length);
    const text = String(value).padStart(n, "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const lead = n - String(value).length; // leading zeros to ghost
    if (text.length !== this.shown.length) {
      this.tiles.replaceChildren();
      this.tileNodes = [...text].map((ch) => this.tiles.appendChild(el("span", ch === "," ? "hud-tile-sep" : "hud-tile", ch)));
      this.tileNodes.forEach((node, i) => node.classList.toggle("hot", i === this.tileNodes.length - 1));
      this.shown = "";
    }
    if (text === this.shown && lead === this.lead) return;
    let digit = 0;
    [...text].forEach((ch, i) => {
      const node = this.tileNodes[i];
      if (node.textContent !== ch) node.textContent = ch;
      if (ch !== ",") node.classList.toggle("ghost", digit++ < lead);
    });
    this.shown = text;
    this.lead = lead;
  }

  update(m) {
    this.setDigits(Math.max(0, Math.floor(m.cash)));
    this.score.set(Math.floor(m.score).toLocaleString("en-US"));
    const x = m.multiplier;
    this.mult.set(`×${x.value.toFixed(1)}`);
    this.bar.css("width", `${Math.round(Math.min(1, Math.max(0, x.fill)) * 100)}%`);
    const costly = x.lost >= 0.1;
    this.multRoot.classList.toggle("max", !costly);
    this.multRoot.dataset.band = String(m.congestion.band);
    this.why.set(costly ? `−${x.lost.toFixed(1)} from congestion` : "FLOWING");
    this.why.toggle("down", costly);
  }
}
