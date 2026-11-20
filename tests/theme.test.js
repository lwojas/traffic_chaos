import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, THEME_IDS, ThemeManager, THEME_STORAGE_KEY, toHex } from "../scripts/traffic/ui/themes.js";
import { stabilityBand } from "../scripts/traffic/view/HudReadModel.js";

const keys = (o) => Object.keys(o).sort();
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test("the three required themes exist and define exactly the same tokens", () => {
  assert.deepEqual(THEME_IDS.sort(), ["cyberpunk", "day", "night"]);
  const ref = THEMES.day;
  for (const t of Object.values(THEMES)) {
    for (const group of ["css", "world", "signal", "minimap"]) assert.deepEqual(keys(t[group]), keys(ref[group]), `${t.id}.${group}`);
    assert.deepEqual(keys(t.world.vehicle), keys(ref.world.vehicle), `${t.id}.world.vehicle`);
    assert.equal(t.world.light.length, 3);
    for (const id of ["car", "fast", "slow", "truck", "taxi"]) assert.ok(t.world.vehicle.palette[id], `${t.id} palette ${id}`);
  }
});

test("world and signal colours are numbers, minimap and cash colours are css strings", () => {
  for (const t of Object.values(THEMES)) {
    for (const k of ["ground", "road", "junction", "marking", "stopLine", "hazard", "tow"]) assert.equal(typeof t.world[k], "number", `${t.id}.world.${k}`);
    for (const c of t.world.light) assert.equal(typeof c, "number");
    for (const k of ["face", "rim", "ink", "track", "hover", "lane"]) assert.equal(typeof t.signal[k], "number", `${t.id}.signal.${k}`);
    for (const k of ["congestion-safe", "congestion-pressure", "congestion-danger", "congestion-critical"]) assert.ok(Number.isFinite(toHex(t.css[k])), `${t.id} ${k}`);
  }
});

test("themes are distinct looks, not recolours: day is light, night and cyberpunk dark, cyberpunk has its own pattern and glow", () => {
  assert.equal(THEMES.day.scheme, "light");
  assert.equal(THEMES.night.scheme, "dark");
  assert.notEqual(THEMES.night.world.vehicle.beam, null); // headlights
  assert.notEqual(THEMES.cyberpunk.world.vehicle.trail, null); // neon trails
  assert.equal(THEMES.cyberpunk.world.pattern, "grid");
  assert.notEqual(THEMES.day.world.pattern, "grid");
  assert.equal(THEMES.day.world.lightGlow, 0);
  assert.ok(THEMES.night.world.lightGlow > 0);
});

test("ThemeManager switches, notifies and persists; unknown ids are ignored", () => {
  const storage = memory();
  const m = new ThemeManager({ storage, root: null });
  assert.equal(m.id, "day");
  const seen = [];
  m.onChange((t) => seen.push(t.id));
  m.set("night");
  m.set("night"); // no change, no event
  m.set("nope");
  m.set("cyberpunk");
  assert.deepEqual(seen, ["night", "cyberpunk"]);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "cyberpunk");
  assert.equal(new ThemeManager({ storage, root: null }).id, "cyberpunk"); // restored
  m.toggleDayNight();
  assert.equal(m.id, "day");
});

test("stability is a label over the worse of queue fill and lost capacity", () => {
  assert.equal(stabilityBand(0.1, 1).label, "STABLE");
  assert.equal(stabilityBand(0.4, 1).label, "MODERATE");
  assert.equal(stabilityBand(0.1, 0.3).label, "STRAINED"); // incidents cost capacity
  assert.equal(stabilityBand(0.9, 1).label, "CRITICAL");
});
