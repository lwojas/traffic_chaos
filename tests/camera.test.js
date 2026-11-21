import { test } from "node:test";
import assert from "node:assert/strict";
import { ViewCamera } from "../scripts/traffic/view/ViewCamera.js";
import { edgeScrollVelocity } from "../scripts/traffic/view/edgeScroll.js";
import { MinimapTransform, fitMinimapSize } from "../scripts/traffic/view/MinimapTransform.js";

const cam = (world = { w: 3400, h: 1700 }, viewport = { w: 1280, h: 720 }) => new ViewCamera({ world, viewport });

test("camera clamps to the world bounds on every move", () => {
  const c = cam();
  c.moveTo(-50, -50);
  assert.deepEqual([c.x, c.y], [0, 0]);
  c.moveTo(99999, 99999);
  assert.deepEqual([c.x, c.y], [3400 - 1280, 1700 - 720]);
  c.panBy(-99999, 0);
  assert.equal(c.x, 0);
});

test("a world smaller than the viewport is centred and cannot pan", () => {
  const c = cam({ w: 800, h: 600 });
  const centred = [c.clampX(0), c.clampY(0)];
  c.centerOn(400, 300);
  assert.deepEqual([c.x, c.y], centred);
  assert.ok(c.x < 0 && c.y < 0);
  c.panBy(500, 500);
  assert.deepEqual([c.x, c.y], centred);
});

test("centerOn centres, and clamps near the edges", () => {
  const c = cam();
  c.centerOn(1700, 850);
  assert.deepEqual([c.centerX, c.centerY], [1700, 850]);
  c.centerOn(10, 10);
  assert.deepEqual([c.x, c.y], [0, 0]);
});

test("world and screen coordinates round-trip at any camera position", () => {
  const c = cam();
  c.moveTo(500, 300);
  const s = c.worldToScreen(900, 400);
  assert.deepEqual(s, { x: 400, y: 100 });
  assert.deepEqual(c.screenToWorld(s.x, s.y), { x: 900, y: 400 });
});

test("resizing the viewport keeps the same world point centred", () => {
  const c = cam();
  c.centerOn(1700, 850);
  c.setViewport(800, 500);
  assert.deepEqual([c.centerX, c.centerY], [1700, 850]);
  assert.equal(c.width, 800);
});

test("version bumps only when the view really changes", () => {
  const c = cam();
  const v = c.version;
  c.moveTo(0, 0);
  assert.equal(c.version, v);
  c.moveTo(10, 0);
  assert.ok(c.version > v);
});

test("glideTo eases toward the target, ends exactly on it, and an instant move cancels it", () => {
  const c = cam();
  c.glideTo(2000, 900);
  const tx = 2000 - 640;
  c.update(0.05);
  assert.ok(c.x > 0 && c.x < tx);
  for (let i = 0; i < 200; i++) c.update(1 / 60);
  assert.equal(c.x, tx);
  assert.equal(c.target, null);
  c.glideTo(100, 100);
  c.panBy(5, 0);
  assert.equal(c.target, null);
});

test("edge scrolling: zero in the middle, ramps toward the edge, signs point the right way", () => {
  const vp = { w: 1000, h: 600 };
  const opt = { margin: 30, speed: 600 };
  assert.deepEqual(edgeScrollVelocity({ x: 500, y: 300 }, vp, opt), { x: 0, y: 0 });
  assert.equal(edgeScrollVelocity({ x: 31, y: 300 }, vp, opt).x, 0, "just outside the margin");
  const shallow = edgeScrollVelocity({ x: 25, y: 300 }, vp, opt).x;
  const deep = edgeScrollVelocity({ x: 2, y: 300 }, vp, opt).x;
  assert.ok(shallow < 0 && deep < shallow, "left edge scrolls left, faster near the edge");
  assert.ok(edgeScrollVelocity({ x: 999, y: 300 }, vp, opt).x > 0);
  assert.ok(edgeScrollVelocity({ x: 500, y: 1 }, vp, opt).y < 0);
  assert.ok(edgeScrollVelocity({ x: 500, y: 599 }, vp, opt).y > 0);
  assert.equal(Math.abs(edgeScrollVelocity({ x: 0, y: 300 }, vp, opt).x), 600);
  const corner = edgeScrollVelocity({ x: 1, y: 1 }, vp, opt);
  assert.ok(corner.x < 0 && corner.y < 0);
});

test("edge scrolling ignores a missing or outside pointer", () => {
  const vp = { w: 1000, h: 600 };
  assert.deepEqual(edgeScrollVelocity(null, vp), { x: 0, y: 0 });
  assert.deepEqual(edgeScrollVelocity({ x: -5, y: 10 }, vp), { x: 0, y: 0 });
  assert.deepEqual(edgeScrollVelocity({ x: 1005, y: 10 }, vp), { x: 0, y: 0 });
});

test("minimap maps world <-> minimap and clamps clicks outside the map", () => {
  const world = { w: 3400, h: 1700 };
  const size = fitMinimapSize(world, { w: 240, h: 160 });
  assert.ok(size.w <= 240 && size.h <= 160);
  assert.ok(Math.abs(size.w / size.h - 2) < 0.05, "keeps the world's aspect ratio");
  const t = new MinimapTransform(world, size);
  const m = t.worldToMap(1700, 850);
  const w = t.mapToWorld(m.x, m.y);
  assert.ok(Math.abs(w.x - 1700) < 1e-6 && Math.abs(w.y - 850) < 1e-6);
  assert.deepEqual(t.mapToWorld(-20, -20), { x: 0, y: 0 });
  assert.deepEqual(t.mapToWorld(9999, 9999), { x: 3400, y: 1700 });
});

test("minimap view rectangle tracks the camera and clicking it centres the camera there", () => {
  const world = { w: 3400, h: 1700 };
  const c = cam(world);
  const t = new MinimapTransform(world, fitMinimapSize(world, { w: 240, h: 120 }));
  const r = t.viewRect(c);
  assert.ok(Math.abs(r.w - 1280 * t.scale) < 1e-9);
  c.moveTo(1000, 500);
  assert.ok(t.viewRect(c).x > r.x);
  const click = t.worldToMap(2500, 1200);
  const target = t.mapToWorld(click.x, click.y);
  c.centerOn(target.x, target.y);
  assert.ok(Math.abs(c.centerX - 2500) < 1 && Math.abs(c.centerY - 1200) < 1);
  const corner = t.mapToWorld(t.size.w, t.size.h);
  c.centerOn(corner.x, corner.y);
  assert.deepEqual([c.x, c.y], [world.w - 1280, world.h - 720], "clicking a corner clamps to the world bounds");
});
