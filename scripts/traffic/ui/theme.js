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
  minimap: { maxWidth: 240, maxHeight: 160, maxViewportShare: 0.34, background: "#161b24", road: "#5d6573", junction: "#8a93a5", viewport: "#ffffff", input: "#46c46a", output: "#e5484d", incident: "#ff8a1f" },
  // World-space signal controls (Phaser). Sizes are in world px.
  signalControl: { size: 26, gap: 4, roadsideMargin: 6, hitPadding: 3, border: 2, borderHover: 3, colors: { fill: [0xe5484d, 0xf2c744, 0x46c46a], border: 0x10131a, hover: 0xffffff, glyph: 0x10131a, pending: 0xffffff }, tooltip: { font: "12px system-ui, sans-serif", padding: 5 } },
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
