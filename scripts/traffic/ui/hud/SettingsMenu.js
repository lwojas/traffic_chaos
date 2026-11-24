import { el } from "../dom.js";
import { Theme } from "../theme.js";
import { THEMES, THEME_IDS } from "../themes.js";

// Settings popover under the control cluster: visual theme, maps, restart and the
// Developer mode switch (the only way into debug UI from the player HUD).
export class SettingsMenu {
  constructor(parent, actions, { onMaps, anchor }) {
    this.actions = actions;
    this.anchor = anchor;
    this.root = el("div", "hud-menu");
    this.root.hidden = true;

    this.root.append(el("div", "hud-label", "THEME"));
    const themes = el("div", "hud-segmented");
    this.themeButtons = THEME_IDS.map((id) => {
      const b = el("button", "hud-button", THEMES[id].name);
      b.dataset.theme = id;
      b.addEventListener("click", () => Theme.set(id));
      themes.append(b);
      return b;
    });
    this.root.append(themes);

    this.root.append(el("div", "hud-label", "GAME"));
    const row = el("div", "hud-menu-row");
    const maps = el("button", "hud-button", "Maps");
    maps.addEventListener("click", () => {
      this.close();
      onMaps();
    });
    const restart = el("button", "hud-button", "Restart (R)");
    restart.addEventListener("click", () => {
      this.close();
      actions.restart();
    });
    row.append(maps, restart);
    this.root.append(row);

    const dev = el("label", "hud-check");
    this.devBox = el("input");
    this.devBox.type = "checkbox";
    this.devBox.addEventListener("change", () => actions.debug.set(this.devBox.checked));
    dev.append(this.devBox, el("span", "", "Developer mode (D)"));
    this.root.append(dev);
    this.root.append(el("div", "hud-menu-note", "Space pause · Q/W/E speed · T tow / crew · R restart · drag or arrows to scroll"));

    parent.append(this.root);
    this.onDocDown = (e) => {
      if (!this.root.hidden && !this.root.contains(e.target) && !this.anchor.contains(e.target)) this.close();
    };
    this.onKey = (e) => e.key === "Escape" && this.close();
    document.addEventListener("pointerdown", this.onDocDown);
    window.addEventListener("keydown", this.onKey);
    this.unsubscribe = Theme.onChange(() => this.sync());
    this.sync();
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
    this.anchor.classList.toggle("active", !this.root.hidden);
  }
  close() {
    this.root.hidden = true;
    this.anchor.classList.remove("active");
  }
  sync() {
    for (const b of this.themeButtons) b.classList.toggle("active", b.dataset.theme === Theme.id);
    this.devBox.checked = this.actions.debug.open;
  }
  destroy() {
    document.removeEventListener("pointerdown", this.onDocDown);
    window.removeEventListener("keydown", this.onKey);
    this.unsubscribe();
  }
}
