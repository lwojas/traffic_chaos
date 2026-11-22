// Visual themes. A theme is pure presentation: it never touches the simulation,
// scoring, levels or difficulty. Components consume SEMANTIC tokens (what a colour
// means) and never know which theme is active.
//
//   css      DOM tokens, exported as --theme-* custom properties (applyThemeCss)
//   world    Phaser world tokens (ground, roads, lights, vehicles), numbers 0xRRGGBB
//   signal   world-space signal control tokens
//   minimap  canvas tokens for the overview
//
// Every theme must define the same keys (tests/theme.test.js checks it). To add a
// theme: copy one below, change values, add it to THEMES. Nothing else changes.

const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// Shape shared by Day and Night (Tactile Tabletop / Nocturne Tabletop)
const SOFT = { "radius-sm": "4px", "radius-md": "8px", "radius-lg": "16px", "radius-panel": "16px", "border-width": "1px" };

const DAY = {
  id: "day",
  name: "Day",
  scheme: "light",
  css: {
    ...SOFT,
    "border-width": "1.5px",
    background: "#fef9f0",
    surface: "#fffdf8",
    "surface-elevated": "#ffffff",
    "surface-recessed": "#eae3d2",
    "text-primary": "#1d1c16",
    "text-secondary": "#6b564f",
    "text-on-accent": "#ffffff",
    accent: "#1e6667",
    "accent-strong": "#144f50",
    "accent-soft": "rgba(30, 102, 103, 0.12)",
    success: "#3a7d7e",
    warning: "#b9830f",
    danger: "#ba1a1a",
    info: "#1e6667",
    hazard: "#c44f2e",
    "control-background": "#f2ede4",
    "control-border": "#e3dac9",
    "control-hover": "#e7e2d9",
    "control-active": "#1e6667",
    "control-active-text": "#ffffff",
    "action-background": "#d35a38",
    "action-text": "#fffbff",
    "action-edge": "#a73d20",
    "tile-background": "#32302a",
    "tile-text": "#f5f0e7",
    "tile-hot-background": "#d35a38",
    "tile-hot-text": "#ffffff",
    "income-positive": "#3a7d7e",
    "income-multiplier": "#c18a14",
    "signal-green": "#3a7d7e",
    "signal-yellow": "#d8a232",
    "signal-red": "#d35a38",
    "congestion-safe": "#3a7d7e",
    "congestion-pressure": "#e0a92f",
    "congestion-danger": "#d35a38",
    "congestion-critical": "#ba1a1a",
    "panel-border": "#e3dac9",
    "panel-shadow": "0 2px 4px rgba(54, 51, 48, 0.07), 0 6px 14px rgba(54, 51, 48, 0.07)",
    "panel-glow": "none",
    "focus-ring": "0 0 0 2px #fef9f0, 0 0 0 4px #1e6667",
    "font-display": `Epilogue, ${FONT_STACK}`,
    "font-body": `'Plus Jakarta Sans', ${FONT_STACK}`,
    "font-label": `'Space Grotesk', ${FONT_STACK}`,
    "font-number": `Epilogue, ${FONT_STACK}`,
    "label-tracking": "0.1em",
    "panel-opacity": "1",
  },
  world: {
    ground: 0xfef9f0,
    pattern: "dots",
    patternColor: 0x8b716a,
    patternAlpha: 0.18,
    road: 0xe0dacb,
    roadEdge: 0xc9bfab,
    roadEdgeWidth: 2,
    roadEdgeAlpha: 1,
    junction: 0xdbd4c4,
    marking: 0xa89d88,
    markingAlpha: 0.95,
    laneDivider: 0xa89d88,
    stopLine: 0xba1a1a,
    building: 0xf4efe4,
    buildingTop: 0xfaf7f0,
    buildingShadow: 0x32302a,
    buildingShadowAlpha: 0.06,
    buildingEdge: 0xe9e2d3,
    buildingEdgeAlpha: 1,
    inputGate: 0x3a7d7e,
    outputGate: 0xd35a38,
    hazard: 0xd35a38,
    tow: 0xd8a232,
    light: [0xd35a38, 0xd8a232, 0x3a7d7e], // indexed by LightState: red, yellow, green
    lightGlow: 0,
    cash: "#1e6667",
    cashBig: "#a33818",
    warnText: "#ba1a1a",
    labelStroke: "#fef9f0",
    labelText: "#1d1c16",
    vehicle: {
      palette: { car: "#1e6667", fast: "#a33818", slow: "#fdc350", truck: "#8b716a", taxi: "#d8a232" },
      outline: "rgba(50, 48, 42, 0.35)",
      windshield: "rgba(254, 249, 240, 0.92)",
      headlight: "#fff4b0",
      brake: "#ff3b2f",
      tail: "#8b2a1a",
      beam: null,
      trail: null,
      glow: 0,
      shadow: 0.38,
    },
  },
  signal: {
    face: 0xfffdf8,
    rim: 0xe3dac9,
    ink: 0x32302a,
    track: 0xeae3d2,
    hover: 0x1d1c16,
    lane: 0x1d1c16,
    tipBackground: "#32302a",
    tipText: "#f5f0e7",
    shadow: 0.22,
    glow: 0,
  },
  minimap: { background: "#ece8df", road: "#d6cebc", junction: "#b8ad98", viewport: "#1e6667", input: "#3a7d7e", output: "#d35a38", incident: "#ba1a1a", glow: 0 },
};

const NIGHT = {
  id: "night",
  name: "Night",
  scheme: "dark",
  css: {
    ...SOFT,
    "radius-panel": "12px",
    background: "#0f1420",
    surface: "rgba(24, 32, 48, 0.92)",
    "surface-elevated": "#1e293b",
    "surface-recessed": "#0b0f1a",
    "text-primary": "#f1f5f9",
    "text-secondary": "#94a3b8",
    "text-on-accent": "#0f1420",
    accent: "#2dd4bf",
    "accent-strong": "#5eead4",
    "accent-soft": "rgba(45, 212, 191, 0.14)",
    success: "#2dd4bf",
    warning: "#fbbf24",
    danger: "#f87171",
    info: "#2dd4bf",
    hazard: "#fb923c",
    "control-background": "rgba(241, 245, 249, 0.06)",
    "control-border": "rgba(241, 245, 249, 0.12)",
    "control-hover": "rgba(241, 245, 249, 0.12)",
    "control-active": "#2dd4bf",
    "control-active-text": "#0f1420",
    "action-background": "#f59e0b",
    "action-text": "#0f1420",
    "action-edge": "#b45309",
    "tile-background": "rgba(241, 245, 249, 0.07)",
    "tile-text": "#f1f5f9",
    "tile-hot-background": "#f59e0b",
    "tile-hot-text": "#0f1420",
    "income-positive": "#2dd4bf",
    "income-multiplier": "#fbbf24",
    "signal-green": "#2dd4bf",
    "signal-yellow": "#f59e0b",
    "signal-red": "#f87171",
    "congestion-safe": "#2dd4bf",
    "congestion-pressure": "#fbbf24",
    "congestion-danger": "#fb923c",
    "congestion-critical": "#f87171",
    "panel-border": "rgba(241, 245, 249, 0.1)",
    "panel-shadow": "0 8px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(241, 245, 249, 0.06)",
    "panel-glow": "none",
    "focus-ring": "0 0 0 2px #0f1420, 0 0 0 4px #f59e0b",
    "font-display": `Epilogue, ${FONT_STACK}`,
    "font-body": `Epilogue, ${FONT_STACK}`,
    "font-label": `Epilogue, ${FONT_STACK}`,
    "font-number": `Epilogue, ${FONT_STACK}`,
    "label-tracking": "0.06em",
    "panel-opacity": "0.92",
  },
  world: {
    ground: 0x10141f,
    pattern: "dots",
    patternColor: 0x94a3b8,
    patternAlpha: 0.07,
    road: 0x1c1c2a,
    roadEdge: 0x2a2a3c,
    roadEdgeWidth: 2,
    roadEdgeAlpha: 1,
    junction: 0x20202f,
    marking: 0x5a4a3a,
    markingAlpha: 0.95,
    laneDivider: 0x4a3e33,
    stopLine: 0xee4343,
    building: 0x182030,
    buildingTop: 0x1e293b,
    buildingShadow: 0x000000,
    buildingShadowAlpha: 0.35,
    buildingEdge: 0x2a3550,
    buildingEdgeAlpha: 1,
    inputGate: 0x2dd4bf,
    outputGate: 0xf87171,
    hazard: 0xfb923c,
    tow: 0xfbbf24,
    light: [0xf87171, 0xf59e0b, 0x2dd4bf],
    lightGlow: 0.28,
    cash: "#5eead4",
    cashBig: "#fbbf24",
    warnText: "#fca5a5",
    labelStroke: "#0f1420",
    labelText: "#f1f5f9",
    vehicle: {
      palette: { car: "#2f9a9a", fast: "#e0603e", slow: "#f2b21a", truck: "#9aa4b8", taxi: "#fbbf24" },
      outline: "rgba(5, 8, 16, 0.85)",
      windshield: "rgba(15, 20, 32, 0.85)",
      headlight: "#fff4c2",
      brake: "#ff3b2f",
      tail: "#b02a2a",
      beam: { color: "#fff1c4", alpha: 0.32, length: 78, spread: 0.55 },
      trail: null,
      glow: 0,
      shadow: 0,
    },
  },
  signal: {
    face: 0x182030,
    rim: 0x2a3550,
    ink: 0xf1f5f9,
    track: 0x0b0f1a,
    hover: 0xffffff,
    lane: 0xffffff,
    tipBackground: "rgba(11, 15, 26, 0.95)",
    tipText: "#f1f5f9",
    shadow: 0.5,
    glow: 0.35,
  },
  minimap: { background: "#090e1a", road: "#273146", junction: "#3a4766", viewport: "#2dd4bf", input: "#2dd4bf", output: "#f87171", incident: "#fb923c", glow: 5 },
};

const CYBER_FONT = `'Space Grotesk', ${FONT_STACK}`;
const CYBER_MONO = `'JetBrains Mono', ui-monospace, Menlo, monospace`;

const CYBERPUNK = {
  id: "cyberpunk",
  name: "Cyberpunk",
  scheme: "dark",
  css: {
    "radius-sm": "2px",
    "radius-md": "4px",
    "radius-lg": "8px",
    "radius-panel": "8px",
    "border-width": "1px",
    background: "#07080d",
    surface: "rgba(15, 17, 26, 0.92)",
    "surface-elevated": "#161926",
    "surface-recessed": "#07080d",
    "text-primary": "#ffffff",
    "text-secondary": "#b8c4d9",
    "text-on-accent": "#07080d",
    accent: "#00f0ff",
    "accent-strong": "#7df9ff",
    "accent-soft": "rgba(0, 240, 255, 0.1)",
    success: "#39ff14",
    warning: "#ffd400",
    danger: "#ff007f",
    info: "#00f0ff",
    hazard: "#ff007f",
    "control-background": "rgba(0, 240, 255, 0.05)",
    "control-border": "rgba(0, 240, 255, 0.3)",
    "control-hover": "rgba(0, 240, 255, 0.16)",
    "control-active": "#00f0ff",
    "control-active-text": "#07080d",
    "action-background": "transparent",
    "action-text": "#00f0ff",
    "action-edge": "#00f0ff",
    "tile-background": "#07080d",
    "tile-text": "#00f0ff",
    "tile-hot-background": "#ff007f",
    "tile-hot-text": "#ffffff",
    "income-positive": "#39ff14",
    "income-multiplier": "#00e5ff",
    "signal-green": "#39ff14",
    "signal-yellow": "#ffd400",
    "signal-red": "#ff007f",
    "congestion-safe": "#39ff14",
    "congestion-pressure": "#00f0ff",
    "congestion-danger": "#ff4fa3",
    "congestion-critical": "#ff007f",
    "panel-border": "rgba(0, 240, 255, 0.3)",
    "panel-shadow": "none",
    "panel-glow": "0 0 12px rgba(0, 240, 255, 0.15)",
    "focus-ring": "0 0 0 1px #00f0ff, 0 0 10px rgba(0, 240, 255, 0.6)",
    "font-display": CYBER_FONT,
    "font-body": CYBER_FONT,
    "font-label": CYBER_MONO,
    "font-number": CYBER_MONO,
    "label-tracking": "0.1em",
    "panel-opacity": "0.92",
  },
  world: {
    ground: 0x0d0e13,
    pattern: "grid",
    patternColor: 0x00f0ff,
    patternAlpha: 0.06,
    road: 0x1a1b21,
    roadEdge: 0x00b8c4,
    roadEdgeWidth: 2.5,
    roadEdgeAlpha: 0.95,
    junction: 0x1a1b21,
    marking: 0xff3d8f,
    markingAlpha: 0.7,
    laneDivider: 0x00f0ff,
    stopLine: 0xff4a8d,
    building: 0x0f111a,
    buildingTop: 0x0f111a,
    buildingShadow: 0x00f0ff,
    buildingShadowAlpha: 0,
    buildingEdge: 0x00f0ff,
    buildingEdgeAlpha: 0.35,
    inputGate: 0x39ff14,
    outputGate: 0xff007f,
    hazard: 0xff007f,
    tow: 0xffd400,
    light: [0xff007f, 0xffd400, 0x39ff14],
    lightGlow: 0.4,
    cash: "#39ff14",
    cashBig: "#00f0ff",
    warnText: "#ff7ab0",
    labelStroke: "#07080d",
    labelText: "#ffffff",
    vehicle: {
      palette: { car: "#00f0ff", fast: "#ff007f", slow: "#39ff14", truck: "#b8c4d9", taxi: "#ffd400" },
      outline: "rgba(0, 0, 0, 0.9)",
      windshield: "rgba(7, 8, 13, 0.9)",
      headlight: "#ffffff",
      brake: "#ff007f",
      tail: "#7a0040",
      beam: null,
      trail: { length: 38, alpha: 0.6 },
      glow: 0.55,
      shadow: 0,
    },
  },
  signal: {
    face: 0x0f111a,
    rim: 0x00f0ff,
    ink: 0x00f0ff,
    track: 0x07080d,
    hover: 0xffffff,
    lane: 0x00f0ff,
    tipBackground: "rgba(7, 8, 13, 0.95)",
    tipText: "#00f0ff",
    shadow: 0,
    glow: 0.6,
  },
  minimap: { background: "#0d0e13", road: "#0e6a73", junction: "#00b8c4", viewport: "#00f0ff", input: "#39ff14", output: "#ff007f", incident: "#ff007f", glow: 9 },
};

export const THEMES = { day: DAY, night: NIGHT, cyberpunk: CYBERPUNK };
export const THEME_IDS = Object.keys(THEMES);
export const DEFAULT_THEME = "day";
export const THEME_STORAGE_KEY = "traffic.theme";

// DOM export: tokens -> --theme-* custom properties on the root, plus data-theme
// so CSS can still target a theme structurally if it ever needs to.
export function applyThemeCss(root, theme) {
  for (const [k, v] of Object.entries(theme.css)) root.style.setProperty(`--theme-${k}`, v);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.scheme;
}

// "#rrggbb" or 0xrrggbb -> number
export const toHex = (c) => (typeof c === "number" ? c : parseInt(c.replace("#", "").slice(0, 6), 16));
export const toCss = (n) => `#${n.toString(16).padStart(6, "0")}`;

// The active theme and the people who care when it changes (the Phaser view
// redraws, the minimap restyles). Owns no game state.
export class ThemeManager {
  constructor({ storage = null, root = typeof document !== "undefined" ? document.documentElement : null, initial } = {}) {
    this.storage = storage;
    this.root = root;
    this.listeners = new Set();
    let id = initial ?? DEFAULT_THEME;
    try {
      const saved = storage?.getItem(THEME_STORAGE_KEY);
      if (!initial && THEMES[saved]) id = saved;
    } catch {
      /* storage blocked */
    }
    this.theme = THEMES[id] ?? THEMES[DEFAULT_THEME];
    if (root) applyThemeCss(root, this.theme);
  }

  get id() {
    return this.theme.id;
  }

  set(id) {
    const next = THEMES[id];
    if (!next || next === this.theme) return;
    this.theme = next;
    if (this.root) applyThemeCss(this.root, next);
    try {
      this.storage?.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* storage blocked */
    }
    for (const fn of this.listeners) fn(next);
  }

  // Day <-> Night are the two core modes; the quick toggle flips between them.
  toggleDayNight() {
    this.set(this.theme.id === "day" ? "night" : "day");
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
