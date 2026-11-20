import { ThemeManager, toHex } from "./themes.js";

// Layout constants shared by every theme (sizes, widths, geometry). Colours,
// fonts, radii and shadows are NOT here: they are tokens in themes.js and reach
// the DOM as --theme-* custom properties and the Phaser view through `Theme`.
export const UI = {
  font: { small: 11, body: 13, label: 11, value: 22, big: 30 },
  space: { hudMargin: 16, gap: 10, panelPadding: 12 },
  panel: { width: { meter: 300, controls: 210, queues: 220, banner: 380 } },
  minimap: { maxWidth: 240, maxHeight: 160, maxViewportShare: 0.34 },
  // World-space signal controls (Phaser). Sizes are in world px. `size` is the whole control box (button + label).
  signalControl: {
    size: 52, gap: 4, roadsideMargin: 4, hitPadding: 3, radius: 18, lift: 4, ring: 5, hoverScale: 1.1,
    label: { font: "bold 13px Epilogue, system-ui, sans-serif", risk: "bold 10px Epilogue, system-ui, sans-serif" },
    tooltip: { font: "12px Epilogue, system-ui, sans-serif", padding: 6 },
  },
  thresholds: { warn: 0.6, bad: 0.85 }, // meter fractions where bars turn amber / red
};

// The active theme. Components read tokens through it; nothing outside this file
// and themes.js names a theme.
let storage = null;
try {
  storage = typeof window !== "undefined" ? window.localStorage : null;
} catch {
  /* blocked */
}
export const Theme = new ThemeManager({ storage });

export const tokens = () => Theme.theme.css;
export const world = () => Theme.theme.world;
export const signalTokens = () => Theme.theme.signal;

// Risk band (0 SAFE .. 3 CRITICAL) -> colour, from the congestion tokens
const RISK_KEYS = ["congestion-safe", "congestion-pressure", "congestion-danger", "congestion-critical"];
export const riskCss = (risk) => tokens()[RISK_KEYS[Math.min(3, Math.max(0, risk))]];
export const riskHex = (risk) => toHex(riskCss(risk));

// Colour for a 0..1 "how bad" fraction
export function dangerColor(fraction) {
  const t = UI.thresholds;
  return riskCss(fraction >= 1 ? 3 : fraction >= t.bad ? 2 : fraction >= t.warn ? 1 : 0);
}

// LightState index (0 red, 1 yellow, 2 green) -> colour
export const lightHex = (state) => world().light[state];

// Layout custom properties (the colour tokens are applied by ThemeManager)
export function applyLayout(root) {
  const set = (k, v) => root.style.setProperty(`--${k}`, typeof v === "number" ? `${v}px` : v);
  for (const [k, v] of Object.entries(UI.space)) set(`s-${k}`, v);
  for (const [k, v] of Object.entries(UI.panel.width)) set(`w-${k}`, v);
  for (const [k, v] of Object.entries(UI.font)) set(`f-${k}`, v);
}
