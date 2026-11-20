import { el, Cell } from "../dom.js";
import { icon } from "../icons.js";

// Incidents card (only while a crash is active) with the tow truck: one button per active incident, with its price. Spending is a
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
    this.head.set(`${list.length} INCIDENT${list.length === 1 ? "" : "S"} · ${tow.ready ? `TOW $${tow.cost}` : `TOW BACK IN ${Math.ceil(tow.cooldownLeft)}s`}`);
    const seen = new Set();
    for (const i of list) {
      seen.add(i.id);
      let r = this.rows.get(i.id);
      if (!r) {
        const row = el("div", "hud-tow-row");
        const look = el("button", "hud-button", "Look");
        look.title = "Move the camera to this crash";
        look.addEventListener("click", () => this.camera.glideTo(r.x, r.y));
        const text = el("span", "hud-tow-text");
        const button = el("button", "hud-button hud-tow-go");
        button.addEventListener("click", () => this.actions.tow(i.id));
        row.append(look, text, button);
        this.list.append(row);
        r = { row, button, text: new Cell(text), label: new Cell(button), x: 0, y: 0 };
        this.rows.set(i.id, r);
      }
      r.x = i.x;
      r.y = i.y;
      r.text.set(i.towed ? "tow arriving…" : `clears in ${Math.ceil(i.remaining)}s`);
      r.label.set(i.towed ? "Towing" : `Tow $${tow.cost}`);
      r.button.disabled = !!i.towRefusal;
      r.button.title = i.towRefusal ?? `Spend $${tow.cost} to clear this crash in ${tow.delay}s`;
    }
    for (const [id, r] of this.rows) {
      if (seen.has(id)) continue;
      r.row.remove();
      this.rows.delete(id);
    }
  }

  // Tow the incident that is blocking the most of the network (hotkey T)
  towWorst() {
    const list = this.model?.incidents.filter((i) => !i.towRefusal) ?? [];
    if (list.length === 0) return;
    list.sort((a, b) => b.blocked - a.blocked || b.remaining - a.remaining);
    this.actions.tow(list[0].id);
  }
}
