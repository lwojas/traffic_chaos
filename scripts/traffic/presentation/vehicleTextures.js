// Generated placeholder car textures, one per (type, braking). Cars read as
// directional (windscreen + headlights at the front, +x) and show brake lights.
export class VehicleTextures {
  constructor() {
    this.cache = new Map();
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
    const braking = mode === 1;
    const L = Math.round(type.length);
    const W = Math.round(type.width);
    const bmd = game.make.bitmapData(L, W);
    const c = bmd.ctx;
    c.fillStyle = "#101216";
    c.fillRect(0, 0, L, W);
    c.fillStyle = type.color;
    c.fillRect(1, 1, L - 2, W - 2);
    c.fillStyle = "rgba(15,20,30,0.85)"; // windscreen
    c.fillRect(L * 0.62, 2, L * 0.16, W - 4);
    c.fillStyle = "rgba(0,0,0,0.25)"; // rear window
    c.fillRect(L * 0.12, 2, L * 0.1, W - 4);
    c.fillStyle = "#fff4b0"; // headlights
    c.fillRect(L - 3, 2, 2, 3);
    c.fillRect(L - 3, W - 5, 2, 3);
    c.fillStyle = braking ? "#ff2020" : "#7d1d1d"; // tail lights
    c.fillRect(1, 2, braking ? 3 : 2, 3);
    c.fillRect(1, W - 5, braking ? 3 : 2, 3);
    if (mode === 2) {
      // Wreck: scorched body, red hazard stripes
      c.fillStyle = "rgba(20,10,10,0.6)";
      c.fillRect(0, 0, L, W);
      c.strokeStyle = "#ff3030";
      c.lineWidth = 2;
      for (let x = -W; x < L; x += 8) {
        c.beginPath();
        c.moveTo(x, W);
        c.lineTo(x + W, 0);
        c.stroke();
      }
    }
    bmd.dirty = true;
    return bmd;
  }

  destroy() {
    for (const bmd of this.cache.values()) bmd.destroy();
    this.cache.clear();
  }
}
