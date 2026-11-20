// Progression, goal, rating and demand tuning for the shipped levels, merged in
// by the generators so regenerating a level never drops its tuning. The level
// JSON stays the source of truth: these values end up in it.
const ramp = (pts) => ({ shift: pts.map(([time, rate]) => ({ time, rate })) });

export const META = {
  network_01: {
    name: "Turning Traffic",
    progression: { order: 2, blurb: "Four arms, separate turn signals. Straight and turning cars share a crossing.", teaches: ["turns", "shared lanes"], unlock: { after: "first_junction", medal: "bronze" } },
    demandCurves: ramp([[0, 0.04], [120, 0.09], [300, 0.16], [480, 0.23], [660, 0.36]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
    ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 6000, flow: 3 }, gold: { time: 720, earned: 12000, flow: 5, maxIncidents: 3 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
  network_03: {
    name: "Connected Junctions",
    progression: { order: 3, blurb: "Two junctions share a road. A queue released too early lands on the next light.", teaches: ["propagation", "downstream blocking"], unlock: { after: "network_01", medal: "bronze" } },
    demandCurves: ramp([[0, 0.03], [120, 0.07], [300, 0.12], [480, 0.18], [660, 0.3]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
    ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 5000, flow: 2 }, gold: { time: 720, earned: 9000, flow: 3, maxIncidents: 3 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
  network_02: {
    name: "City Grid",
    progression: { order: 4, blurb: "A 3x2 grid with many gates. Something is always going wrong somewhere else.", teaches: ["scanning", "triage"], unlock: { after: "network_03", medal: "bronze" } },
    demandCurves: ramp([[0, 0.02], [120, 0.04], [300, 0.06], [480, 0.08], [660, 0.1]]),
    curve: "shift",
    goal: { surviveSeconds: 900 },
    ratings: { bronze: { time: 420 }, silver: { time: 660, earned: 8000, flow: 2 }, gold: { time: 900, earned: 16000, flow: 3, maxIncidents: 4 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
};

// Applies a level's META to a generated level object (and points every gate at its curve).
export function applyMeta(level) {
  const m = META[level.id];
  if (!m) return level;
  const { curve, name, ...rest } = m;
  Object.assign(level, rest, { name });
  for (const g of level.inputGates) g.demand = { ...g.demand, curve };
  return level;
}
