import { world } from "../ui/theme.js";

// Generated car textures, one per (type, mode) for the active theme. Cars are
// capsules that read as directional (windscreen and headlights at the front, +x)
// and show brake lights. Colours, outline, glow and shadow come from the theme's
// vehicle tokens; the cache is dropped and rebuilt when the theme changes.
// Effects that sit outside the body (headlight beams at night, neon trails in
// Cyberpunk) are separate textures drawn as a child sprite: see fx().
function capsule(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const withAlpha = (hex, a) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export class VehicleTextures {
  constructor() {
    this.cache = new Map();
    this.fxCache = new Map();
  }

  bodyColor(type) {
    return world().vehicle.palette[type.typeId] ?? type.color;
  }

  // mode: 0 normal, 1 braking, 2 crashed
  get(type, mode) {
    const key = `${type.typeId}:${mode ? +mode : 0}`;
    let bmd = this.cache.get(key);
    if (!bmd) {
      bmd = this.draw(type, mode);
      this.cache.set(key, bmd);
    }
    return bmd;
  }

  draw(type, mode) {
    const v = world().vehicle;
    const braking = mode === 1;
    const L = Math.round(type.length);
    const W = Math.round(type.width);
    const pad = v.glow > 0 ? 9 : v.shadow > 0 ? 7 : 1;
    const bmd = game.make.bitmapData(L + pad * 2, W + pad * 2);
    const c = bmd.ctx;
    const body = this.bodyColor(type);
    const r = W * 0.38;

    // Body: shadow (physical themes) or glow (emissive themes), then the fill
    c.save();
    if (v.glow > 0) {
      c.shadowColor = withAlpha(body, v.glow);
      c.shadowBlur = 8;
    } else if (v.shadow > 0) {
      c.shadowColor = `rgba(50, 48, 42, ${v.shadow})`;
      c.shadowBlur = 4;
      c.shadowOffsetY = 3;
    }
    capsule(c, pad, pad, L, W, r);
    c.fillStyle = v.glow > 0 ? "#07080d" : body; // neon cars are dark bodies with a bright edge
    c.fill();
    c.restore();
    if (v.glow > 0) {
      capsule(c, pad + 0.75, pad + 0.75, L - 1.5, W - 1.5, r);
      c.strokeStyle = body;
      c.lineWidth = 1.75;
      c.stroke();
      capsule(c, pad + 3, pad + 3, L - 6, W - 6, r * 0.7);
      c.fillStyle = withAlpha(body, 0.16);
      c.fill();
    } else {
      capsule(c, pad + 0.5, pad + 0.5, L - 1, W - 1, r);
      c.strokeStyle = v.outline;
      c.lineWidth = 1;
      c.stroke();
    }

    // Windscreen and rear window
    c.fillStyle = v.windshield;
    capsule(c, pad + L * 0.6, pad + 2.5, L * 0.17, W - 5, 2);
    c.fill();
    c.fillStyle = "rgba(0, 0, 0, 0.22)";
    capsule(c, pad + L * 0.12, pad + 2.5, L * 0.1, W - 5, 2);
    c.fill();

    // Headlights and tail lights
    c.fillStyle = v.headlight;
    c.fillRect(pad + L - 4, pad + 2, 2.5, 3);
    c.fillRect(pad + L - 4, pad + W - 5, 2.5, 3);
    c.fillStyle = braking ? v.brake : v.tail;
    c.fillRect(pad + 1.5, pad + 2, braking ? 3 : 2, 3);
    c.fillRect(pad + 1.5, pad + W - 5, braking ? 3 : 2, 3);

    if (mode === 2) {
      // Wreck: scorched body, hazard stripes
      c.save();
      capsule(c, pad, pad, L, W, r);
      c.clip();
      c.fillStyle = "rgba(20, 10, 10, 0.55)";
      c.fillRect(pad, pad, L, W);
      c.strokeStyle = withAlpha(`#${world().hazard.toString(16).padStart(6, "0")}`, 0.95);
      c.lineWidth = 2;
      for (let x = -W; x < L; x += 8) {
        c.beginPath();
        c.moveTo(pad + x, pad + W);
        c.lineTo(pad + x + W, pad);
        c.stroke();
      }
      c.restore();
    }
    bmd.dirty = true;
    return bmd;
  }

  // The light effect that travels with a car, or null: { bmd, x, anchorX }.
  // x is the offset from the car's centre, anchorX the sprite anchor.
  fx(type, mode) {
    const v = world().vehicle;
    if (mode === 2 || (!v.beam && !v.trail)) return null;
    const key = `${type.typeId}:${v.beam ? "beam" : "trail"}`;
    let entry = this.fxCache.get(key);
    if (!entry) {
      entry = v.beam ? this.drawBeam(type, v.beam) : this.drawTrail(type, v.trail);
      this.fxCache.set(key, entry);
    }
    return entry;
  }

  drawBeam(type, beam) {
    const len = beam.length;
    const W = type.width;
    const H = Math.round(len * beam.spread);
    const bmd = game.make.bitmapData(len, H);
    const c = bmd.ctx;
    const g = c.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, withAlpha(beam.color, beam.alpha));
    g.addColorStop(1, withAlpha(beam.color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, H / 2 - W * 0.32);
    c.lineTo(len, 0);
    c.lineTo(len, H);
    c.lineTo(0, H / 2 + W * 0.32);
    c.closePath();
    c.fill();
    bmd.dirty = true;
    return { bmd, x: type.length / 2 - 2, anchorX: 0 };
  }

  drawTrail(type, trail) {
    const len = trail.length;
    const W = Math.round(type.width * 0.55);
    const bmd = game.make.bitmapData(len, W);
    const c = bmd.ctx;
    const g = c.createLinearGradient(len, 0, 0, 0);
    g.addColorStop(0, withAlpha(this.bodyColor(type), trail.alpha));
    g.addColorStop(1, withAlpha(this.bodyColor(type), 0));
    c.fillStyle = g;
    c.fillRect(0, 0, len, W);
    bmd.dirty = true;
    return { bmd, x: -type.length / 2 + 2, anchorX: 1 };
  }

  destroy() {
    for (const bmd of this.cache.values()) bmd.destroy();
    for (const e of this.fxCache.values()) e.bmd.destroy();
    this.cache.clear();
    this.fxCache.clear();
  }
}
