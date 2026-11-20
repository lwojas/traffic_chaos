// Pacing / balance probe:  node tools/playtest.mjs [levelFile] [seeds]
// Plays a level with several bot strategies and prints how each run ended.
import { play, makeBot, withTow, loadLevel } from "./botPlayers.mjs";

const file = process.argv[2] ?? "first-junction.json";
const seeds = Number(process.argv[3] ?? 4);
const level = loadLevel(file);
const groups = level.signalGroups.map((g) => g.id);
const phases = process.env.PHASES ? JSON.parse(process.env.PHASES) : groups.map((g) => [g]);

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
console.log(`${level.id}  goal ${level.goal ? mm(level.goal.surviveSeconds) : "-"}  (${seeds} seeds)`);
for (const [name, make] of Object.entries(bots)) {
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) rows.push(play(level, make(), { seed }));
  const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const times = rows.map((r) => mm(r.time) + (r.status === "complete" ? "✓" : "")).join(" ");
  console.log(`${name.padEnd(13)} ends ${times.padEnd(28)} earned ${avg("earned").toFixed(0).padStart(5)}  incidents ${avg("incidents").toFixed(1).padStart(4)}  peakFlow ×${avg("peakFlow").toFixed(1)}  releases ${avg("releases").toFixed(0)}/${avg("cleanReleases").toFixed(0)} clean  biggest ${avg("biggestRelease").toFixed(0)}`);
}
