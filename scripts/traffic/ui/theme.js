// The one place UI styling values live. The DOM HUD reads them as CSS custom
// properties (applyTheme), world-space controls and the minimap read them from
// this object directly. Restyling the game means editing this file (and the
// skins that draw with it), not the components.
export const UI = {
  font: { family: "system-ui, -apple-system, 'Segoe UI', sans-serif", mono: "ui-monospace, Menlo, monospace", small: 11, body: 13, label: 11, value: 22, big: 30 },
  space: { hudMargin: 12, gap: 8, panelPadding: 8 },
  panel: { radius: 6, border: 1, width: { score: 150, meter: 300, controls: 210, queues: 220, banner: 360 } },
  color: {
    panel: "rgba(14, 17, 23, 0.82)",
    panelBorder: "rgba(255, 255, 255, 0.14)",
    text: "#e6e9ef",
    textDim: "#8f98aa",
    good: "#46c46a",
    warn: "#f2c744",
    bad: "#e5484d",
    hazard: "#ff8a1f",
    accent: "#4c8dff",
    track: "#262c3a",
  },
  minimap: { maxWidth: 240, maxHeight: 160, maxViewportShare: 0.34, background: "#161b24", road: "#5d6573", junction: "#8a93a5", viewport: "#ffffff", input: "#46c46a", output: "#e5484d", incident: "#ff8a1f", risk: ["#46c46a", "#f2c744", "#ff8a1f", "#e5484d"] },
  // World-space signal controls (Phaser). Sizes are in world px. `size` is the whole control box (button + label).
  signalControl: {
    size: 46, gap: 4, roadsideMargin: 4, hitPadding: 3, radius: 16, lift: 6, ring: 5, hoverScale: 1.14,
    colors: {
      light: [0xe5484d, 0xf2c744, 0x46c46a], // indexed by LightState
      lightDark: [0x9c2a30, 0xa8872a, 0x2c8a48],
      risk: [0x46c46a, 0xf2c744, 0xff8a1f, 0xe5484d], // SAFE, PRESSURE, DANGER, CRITICAL
      track: 0x10131a,
      glyph: 0xffffff,
      hover: 0xffffff,
      pending: 0xffffff,
      lane: 0xffffff,
    },
    label: { font: "bold 13px system-ui, sans-serif", risk: "bold 10px system-ui, sans-serif" },
    tooltip: { font: "12px system-ui, sans-serif", padding: 5 },
  },
  // Incident and tow markers in the world
  world: { hazard: 0xff8a1f, tow: 0xf2c744, cash: "#7dffa0", cashBig: "#ffe27a" },
  thresholds: { warn: 0.6, bad: 0.85 }, // meter fractions where bars turn amber / red
};

// Pushes the DOM-facing tokens onto an element as CSS custom properties.
export function applyTheme(root, theme = UI) {
  const set = (k, v) => root.style.setProperty(`--${k}`, typeof v === "number" ? `${v}px` : v);
  for (const [k, v] of Object.entries(theme.color)) set(`c-${k}`, v);
  for (const [k, v] of Object.entries(theme.space)) set(`s-${k}`, v);
  set("radius", theme.panel.radius);
  set("border", theme.panel.border);
  for (const [k, v] of Object.entries(theme.panel.width)) set(`w-${k}`, v);
  for (const [k, v] of Object.entries(theme.font)) if (typeof v === "number") set(`f-${k}`, v);
  set("f-family", theme.font.family);
  set("f-mono", theme.font.mono);
}

// Danger colour for a 0..1 fill fraction
export function dangerColor(fraction, theme = UI) {
  if (fraction >= theme.thresholds.bad) return theme.color.bad;
  if (fraction >= theme.thresholds.warn) return theme.color.warn;
  return theme.color.good;
}
