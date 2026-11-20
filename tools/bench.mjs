// Headless performance probe:  node tools/bench.mjs [demandScale] [seconds]
// Runs the simulation without Phaser, alternating NS/EW, and reports tick cost.
// Gridlock freezes the simulation, so a high demandScale ends the run early.
import { readFileSync } from "node:fs";
import { TrafficSession } from "../scripts/traffic/session/TrafficSession.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), "utf8"));
const demandScale = Number(process.argv[2] ?? 1);
const seconds = Number(process.argv[3] ?? 180);
const s = TrafficSession.create(read("levels/network-01.json"), read("game-config.json"), { demandScale });
const NS = ["sg_ns_straight", "sg_ns_turn"];
const EW = ["sg_ew_straight", "sg_ew_turn"];
let peak = 0;
const t0 = performance.now();
for (let i = 0; i < seconds * 30 && !s.gameOver; i++) {
  if (i % 30 === 0) {
    const phase = Math.floor((i / 30) % 30);
    const ns = phase < 12;
    const ew = phase >= 15 && phase < 27;
    for (const g of NS) s.setSignal(g, ns);
    for (const g of EW) s.setSignal(g, ew);
  }
  s.tick();
  peak = Math.max(peak, s.vehicles().length);
}
const wall = performance.now() - t0;
console.log(`demand x${demandScale}, ${s.time.toFixed(0)}s sim: ${wall.toFixed(0)}ms wall, ${(wall / s.sim.tick).toFixed(3)} ms/tick avg, max tick ${s.perf.tickMsMax.toFixed(2)}ms`);
console.log(`peak vehicles ${peak}, injected ${s.stats.spawned}, throughput ${s.stats.completed}, incidents ${s.stats.incidents}, ${s.gameOver ? "GRIDLOCK" : "alive"}`);
