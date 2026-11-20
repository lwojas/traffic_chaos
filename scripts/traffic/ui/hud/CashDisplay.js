import { el, Cell } from "../dom.js";
import { icon } from "../icons.js";

const POP_SECONDS = 1.4;

// The earnings read-out, top-centre. Hierarchy: CASH as big digit tiles (what am
// I earning?), the FLOW chain beside it (what is my multiplier, will it hold?),
// and one quiet line for the queue gamble: what the held traffic is worth
// ("HELD ≈ $240"). A large payout shows once as "+$N" under the counter, then fades.
//
//   QUEUE -> HELD ≈ potential -> RELEASE (click) -> +$N -> CASH
export class CashDisplay {
  constructor(parent) {
    this.root = el("div", "hud-panel hud-reward");
    const cash = el("div", "hud-cash");
    cash.append(el("div", "hud-label", "CASH"));
    this.tiles = el("div", "hud-tiles");
    cash.append(this.tiles);
    this.pop = new Cell(el("div", "hud-pop", ""));
    cash.append(this.pop.node);
    this.tileNodes = [];
    this.shown = "";

    const flow = el("div", "hud-flow-chip");
    const head = el("div", "hud-flow-head");
    head.append(icon("gauge", 14));
    head.append(el("span", "hud-label", "FLOW"));
    this.mult = new Cell(el("b", "hud-flow-x", "×1"));
    head.append(this.mult.node);
    this.pips = el("span", "hud-flow-pips");
    const track = el("span", "hud-track hud-flow-track");
    this.bar = new Cell(el("span", "hud-fill"));
    track.append(this.bar.node);
    this.held = new Cell(el("div", "hud-flow-sub", ""));
    flow.append(head, this.pips, track, this.held.node);
    this.pipNodes = [];
    this.flowRoot = flow;

    this.root.append(cash, flow);
    parent.append(this.root);
    this.prev = null;
    this.gain = 0;
    this.popLeft = 0;
  }

  setDigits(text) {
    if (text === this.shown) return;
    if (text.length !== this.shown.length) {
      this.tiles.replaceChildren();
      this.tileNodes = [...text].map((ch, i) => this.tiles.appendChild(el("span", ch === "," ? "hud-tile-sep" : "hud-tile", ch)));
      this.tileNodes.forEach((n, i) => n.classList.toggle("hot", i === this.tileNodes.length - 1));
    } else {
      [...text].forEach((ch, i) => {
        if (this.tileNodes[i].textContent !== ch) this.tileNodes[i].textContent = ch;
      });
    }
    this.shown = text;
  }

  update(m) {
    this.setDigits(Math.floor(m.cash).toLocaleString("en-US"));

    // Payout pop: gather gains for a moment; only a released queue is worth showing
    if (this.prev !== null && m.cash > this.prev) {
      this.gain += m.cash - this.prev;
      this.popLeft = POP_SECONDS;
    } else if (this.popLeft > 0) {
      this.popLeft -= 0.1;
      if (this.popLeft <= 0) this.gain = 0;
    }
    this.prev = m.cash;
    const big = this.gain >= m.perVehicle * 2.5 && this.popLeft > 0;
    this.pop.set(big ? `+$${Math.round(this.gain).toLocaleString("en-US")}` : "");
    this.pop.toggle("on", big);

    const f = m.flow;
    if (this.pipNodes.length !== f.steps) {
      this.pips.replaceChildren();
      this.pipNodes = Array.from({ length: f.steps }, () => this.pips.appendChild(el("i")));
    }
    this.pipNodes.forEach((n, i) => n.classList.toggle("on", i <= f.step));
    this.mult.set(`×${f.multiplier}`);
    this.flowRoot.classList.toggle("hot", f.step > 0);
    this.bar.css("width", f.step > 0 ? `${Math.round((f.timeLeft / f.timeTotal) * 100)}%` : "0%");
    const held = m.streams.reduce((a, s) => a + (s.queue >= 1 ? s.potential : 0), 0);
    this.held.set(held > 0 ? `HELD ≈ $${held.toLocaleString("en-US")}` : `THROUGHPUT ${m.throughput}`);
    this.held.toggle("potential", held > 0);
  }
}
