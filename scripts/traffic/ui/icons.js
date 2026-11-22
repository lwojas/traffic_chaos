import { el } from "./dom.js";

// Small stroke icon set (24x24, currentColor) so the HUD needs no icon font.
const PATHS = {
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8"/><path d="M14.5 9.5c-.6-.6-1.4-.9-2.5-.9-1.4 0-2.5.6-2.5 1.7 0 2.4 5 1.1 5 3.5 0 1.1-1.1 1.7-2.5 1.7-1.1 0-2-.3-2.6-1"/>',
  gauge: '<path d="M3.3 17a9 9 0 1 1 17.4 0"/><path d="M12 14l4-5"/>',
  grid: '<path d="M12 3v7"/><path d="M12 10l-6 5v6"/><path d="M12 10l6 5v6"/><path d="M9 6l3-3 3 3"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  recenter: '<path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4"/><circle cx="12" cy="12" r="2.5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  touch: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l5 1.2a2 2 0 0 1 1.5 2.4L17.8 19a2 2 0 0 1-2 1.5H11a2 2 0 0 1-1.6-.8L5.5 14a1.5 1.5 0 0 1 2.2-2L9 13"/>',
  warning: '<path d="M12 4l9.5 16h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  tow: '<path d="M2 17V8h10v9M12 11h5l3 3v3h-2"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
};

export function icon(name, size = 16) {
  const span = el("span", "hud-icon");
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
  return span;
}
