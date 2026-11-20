import { el } from "../dom.js";

// Map list with medals and locks. A map's unlock rule is level data, shown here
// as plain text ("Needs a Bronze on First Junction").
export class MapSelect {
  constructor(parent, actions) {
    this.actions = actions;
    this.root = el("div", "hud-panel hud-banner hud-maps");
    this.root.hidden = true;
    parent.append(this.root);
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
    if (!this.root.hidden) this.render();
  }

  render() {
    this.root.replaceChildren(el("div", "hud-label", "MAPS"));
    const metas = this.actions.app.registry.metas;
    const names = new Map(metas.map((m) => [m.id, m.name]));
    for (const m of this.actions.mapList()) {
      const row = el("div", `hud-map-row${m.unlocked ? "" : " locked"}`);
      const info = el("div", "");
      info.append(el("div", "", `${m.name}${m.medal ? "  " + { bronze: "★", silver: "★★", gold: "★★★" }[m.medal] : ""}`));
      info.append(el("div", "hud-map-note", m.unlocked ? m.blurb : `Needs ${(m.requires?.medal ?? "bronze")} on ${names.get(m.requires?.after) ?? m.requires?.after}`));
      const go = el("button", "hud-button", m.unlocked ? "Play" : "Locked");
      go.disabled = !m.unlocked;
      go.addEventListener("click", () => {
        this.root.hidden = true;
        this.actions.launchLevel(m.id);
      });
      row.append(info, go);
      this.root.append(row);
    }
    const close = el("button", "hud-button", "Close");
    close.addEventListener("click", () => (this.root.hidden = true));
    this.root.append(close);
  }
}
