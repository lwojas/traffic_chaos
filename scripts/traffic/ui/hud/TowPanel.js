import { el, Cell } from "../dom.js";
import { icon } from "../icons.js";

// Incidents card (only while a crash or roadworks is active): one button per active incident, with its price. Crashes get the tow
// truck, roadworks the road crew. Spending is a
// decision, so every button shows what it costs and why it may be unavailable.
// Clicking calls actions.tow(id); `T` tows the incident that blocks the most.
export class TowPanel {
  constructor(parent, actions, camera) {
    this.actions = actions;
    this.camera = camera;
    this.root = el("div", "hud-panel hud-tow");
    const head = el("div", "hud-label hud-tow-head");
    head.append(icon("warning", 14));
    this.head = new Cell(el("span", "", "INCIDENT"));
    head.append(this.head.node);
    this.root.append(head);
    this.list = el("div", "hud-tow-list");
    this.root.append(this.list);
    this.rows = new Map(); // incident id -> { row, button, text }
    this.root.hidden = true;
    parent.append(this.root);
    this.model = null;
  }

  update(m) {
    this.model = m;
    const list = m.incidents;
    this.root.hidden = list.length === 0;
    const tow = m.tow;
    const crashes = list.filter((i) => i.kind === "collision").length;
    const works = list.length - crashes;
    const crew = m.crew;
    const price = (d, name) => (d.ready ? `${name} $${d.cost}` : `${name} BACK IN ${Math.ceil(d.cooldownLeft)}s`);
    const parts = [];
    if (crashes > 0) parts.push(`${crashes} CRASH${crashes === 1 ? "" : "ES"} · ${price(tow, "TOW")}`);
    if (works > 0) parts.push(`${works} ROADWORKS · ${price(crew, "CREW")}`);
    this.head.set(parts.join(" · "));
    const seen = new Set();
    for (const i of list) {
      seen.add(i.id);
      let r = this.rows.get(i.id);
      if (!r) {
        const row = el("div", "hud-tow-row");
        const look = el("button", "hud-button", "Look");
        look.title = "Move the camera here";
        look.addEventListener("click", () => this.camera.glideTo(r.x, r.y));
        const text = el("span", "hud-tow-text");
        const button = el("button", "hud-button hud-tow-go");
        button.addEventListener("click", () => this.actions[i.fix](i.id)); // actions.tow for crashes, actions.crew for roadworks
        row.append(look, text, button);
        this.list.append(row);
        r = { row, button, text: new Cell(text), label: new Cell(button), x: 0, y: 0 };
        this.rows.set(i.id, r);
      }
      r.x = i.x;
      r.y = i.y;
      const crash = i.kind === "collision";
      const d = crash ? tow : crew;
      r.text.set(i.towed ? (crash ? "tow arriving…" : "crew arriving…") : crash ? `clears in ${Math.ceil(i.remaining)}s` : `roadworks, ends in ${Math.ceil(i.remaining)}s`);
      r.label.set(i.towed ? (crash ? "Towing" : "Fixing") : `${crash ? "Tow" : "Fix"} $${d.cost}`);
      r.button.disabled = !!i.fixRefusal;
      r.button.title = i.fixRefusal ?? (crash ? `Spend $${d.cost} to clear this crash in ${d.delay}s` : `Spend $${d.cost} to send the road crew: fixed in ${d.delay}s`);
    }
    for (const [id, r] of this.rows) {
      if (seen.has(id)) continue;
      r.row.remove();
      this.rows.delete(id);
    }
  }

  // Send the tow truck or road crew to the incident that is blocking the most of the network (hotkey T)
  towWorst() {
    const list = this.model?.incidents.filter((i) => !i.fixRefusal) ?? [];
    if (list.length === 0) return;
    list.sort((a, b) => b.blocked - a.blocked || b.remaining - a.remaining);
    this.actions[list[0].fix](list[0].id);
  }
}
