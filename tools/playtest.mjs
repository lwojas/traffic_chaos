// Pacing / balance probe:  node tools/playtest.mjs [levelFile] [seeds]
// Plays a level with several bot strategies and prints how each run ended.
import { networkBalance } from "../scripts/traffic/util/networkBalance.js";
import { META } from "./levelMeta.mjs";
import { play, makeBot, withTow, loadLevel } from "./botPlayers.mjs";

const file = process.argv[2] ?? "first-junction.json";
const seeds = Number(process.argv[3] ?? 4);
const level = loadLevel(file);
// Only groups some route passes through: on big maps most junction arms carry no traffic
const usedMoves = new Set(level.routes.flatMap((r) => r.steps));
const groupOf = Object.fromEntries(level.junctions.flatMap((j) => j.movements.map((m) => [m.id, m.signalGroup])));
const groups = level.signalGroups.map((g) => g.id).filter((id) => Object.entries(groupOf).some(([m, g]) => g === id && usedMoves.has(m)));
// Grid maps: one phase per axis (the classic fixed-time plan); otherwise one group at a time
const axisPhases = (ids) => (ids.every((g) => /_(ns|ew)_/.test(g)) ? ["_ns_", "_ew_"].map((a) => ids.filter((g) => g.includes(a))).filter((p) => p.length) : ids.map((g) => [g]));
const phases = process.env.PHASES ? JSON.parse(process.env.PHASES) : META[level.id]?.botPhases ?? axisPhases(groups);

const bots = {
  idle: () => makeBot("idle", phases),
  reckless: () => makeBot("reckless", phases),
  "fixed-8": () => makeBot("fixed", phases, { cycle: 8 }),
  "fixed-14": () => makeBot("fixed", phases, { cycle: 14 }),
  greedy: () => makeBot("greedy", phases),
  charger: () => makeBot("charger", phases),
  "charger+tow": () => withTow(makeBot("charger", phases)),
  "reckless+tow": () => withTow(makeBot("reckless", phases)),
};
const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const nb = networkBalance(level);
console.log(`${level.id}  ${nb.inputs} in / ${nb.outputs} out  demand ${nb.demand.toFixed(2)}/s vs discharge ${nb.capacity.toFixed(2)}/s = ${nb.pressure.toFixed(2)} (${nb.label}); worst exit ${nb.worstExit.id} x${nb.worstExit.ratio.toFixed(2)}`);
console.log(`${level.id}  goal ${level.goal ? mm(level.goal.surviveSeconds) : "-"}  (${seeds} seeds)`);
for (const [name, make] of Object.entries(bots)) {
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) rows.push(play(level, make(), { seed }));
  const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const times = rows.map((r) => mm(r.time) + (r.status === "complete" ? "✓" : "")).join(" ");
  console.log(`${name.padEnd(13)} ends ${times.padEnd(28)} funds ${avg("earned").toFixed(0).padStart(5)}  incidents ${avg("incidents").toFixed(1).padStart(4)}  sat avg ${(avg("avgSatisfaction") * 100).toFixed(0)}% min ${(avg("minSatisfaction") * 100).toFixed(0)}% peak ${(avg("peakSatisfaction") * 100).toFixed(0)}%  biggest release +${(avg("biggestRelease") * 100).toFixed(0)}%`);
}
