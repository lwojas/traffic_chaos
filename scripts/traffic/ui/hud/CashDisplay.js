import { el, Cell } from "../dom.js";
import { icon } from "../icons.js";

const CASH_DIGITS = 6; // reserved tiles: up to $999,999 without the counter changing size

// The reward read-out, top-centre, in the order the player should think about it:
// SATISFACTION (is traffic moving?) -> its income multiplier -> FUNDS (what I get).
//
//   waiting cars drain the bar, cars that get moving after a wait refill it,
//   the bar sets the multiplier, the multiplier sets the funds rate (+$/s).
//
// The line under the bar says why it is moving ("-12 waiting" / "+28% moving").
export class CashDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-reward");
    const cash = el("div", "hud-cash");
    const head = el("div", "hud-cash-head");
    head.append(el("div", "hud-label", "FUNDS"));
    this.rate = new Cell(el("b", "hud-rate", ""));
    head.append(this.rate.node);
    cash.append(head);
    this.tiles = el("div", "hud-tiles");
    cash.append(this.tiles);
    this.tileNodes = [];
    this.shown = "";
    this.lead = -1;

    const sat = el("div", "hud-sat-chip");
    const top = el("div", "hud-sat-head");
    top.append(icon("gauge", 14));
    top.append(el("span", "hud-label", "SATISFACTION"));
    this.mult = new Cell(el("b", "hud-sat-x", "×1.0"));
    top.append(this.mult.node);
    const track = el("span", "hud-track hud-sat-track");
    this.bar = new Cell(el("span", "hud-fill"));
    track.append(this.bar.node);
    this.why = new Cell(el("div", "hud-sat-why", ""));
    sat.append(top, track, this.why.node);
    this.satRoot = sat;

    this.root.append(sat, cash);
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
    this.rate.set(`+$${m.income.rate.toFixed(1)}/s`);

    const sat = m.satisfaction;
    this.mult.set(`×${sat.multiplier.toFixed(1)}`);
    this.bar.css("width", `${Math.round(sat.value * 100)}%`);
    this.satRoot.dataset.band = sat.band;
    this.satRoot.classList.toggle("surge", sat.recovering >= 8);
    // One short reason: surging beats draining beats quiet
    let why = "STEADY";
    if (sat.recovering >= 2) why = `+${sat.recovering}% traffic moving`;
    else if (sat.waiting >= 1) why = `−${sat.waiting} waiting`;
    this.why.set(why);
    this.why.toggle("up", sat.recovering >= 2);
    this.why.toggle("down", sat.recovering < 2 && sat.waiting >= 1);
  }
}
