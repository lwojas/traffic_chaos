// Progression, goal, rating and demand tuning for the shipped levels, merged in
// by the generators so regenerating a level never drops its tuning. The level
// JSON stays the source of truth: these values end up in it.
const ramp = (pts) => ({ shift: pts.map(([time, rate]) => ({ time, rate })) });

// Per-gate authoring overrides, so a level's entry and exit capacity is explicit data:
//   inputs:  { gateId: { queueCapacity, demandScale } }   how much each entry can hold and how hard it pushes
//   outputs: { gateId: { outflowPerMinute } }             how fast each exit discharges (a downstream bottleneck)
export const META = {
  first_junction: {
    name: "Mill Town",
    progression: { order: 1, blurb: "Two entries, three exits. Hold a line of cars, then let them go. Hold too long and the queue backs into the junction.", teaches: ["signals", "queues", "release", "satisfaction"] },
    demandCurves: ramp([[0, 0.05], [90, 0.08], [240, 0.12], [420, 0.16], [600, 0.2]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 1900, satisfaction: 0.62 }, gold: { time: 720, earned: 3400, satisfaction: 0.74, maxIncidents: 3 } },
    gridlock: { fullSeconds: 10 },
    incidents: { duration: 14 },
    inputs: { input_w1: { queueCapacity: 14 }, input_n2: { queueCapacity: 8 } },
    outputs: { output_s2: { outflowPerMinute: 14 } },
    // Playtest bots only (not written to the level): two exclusive phases; the one real conflict is the merge at j_0_1
    botPhases: [["sg_j_0_0_ew_straight", "sg_j_0_0_ew_turn", "sg_j_0_1_ew_turn", "sg_j_1_0_ns_straight", "sg_j_1_0_ew_straight", "sg_j_1_1_ns_straight", "sg_j_1_1_ns_turn"], ["sg_j_0_0_ew_straight", "sg_j_0_0_ew_turn", "sg_j_0_1_ns_straight", "sg_j_1_0_ns_straight", "sg_j_1_0_ew_straight", "sg_j_1_1_ns_straight", "sg_j_1_1_ns_turn"]],
  },
  city_balanced: {
    name: "Harbour Street",
    progression: { order: 2, blurb: "Three entries, three exits. Balanced: every queue can be held, but not all at once.", teaches: ["priorities", "shared exits"], unlock: { after: "first_junction", medal: "bronze" } },
    demandCurves: ramp([[0, 0.07], [60, 0.11], [180, 0.15], [360, 0.19], [540, 0.22]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 2300, satisfaction: 0.65 }, gold: { time: 720, earned: 3600, satisfaction: 0.8, maxIncidents: 2 } },
    gridlock: { fullSeconds: 9 },
    incidents: { duration: 15 },
    inputs: { input_w1: { queueCapacity: 12 }, input_n1: { queueCapacity: 8 }, input_n3: { queueCapacity: 8 } },
    outputs: { output_s1: { outflowPerMinute: 18 }, output_s2: { outflowPerMinute: 18 }, output_s3: { outflowPerMinute: 18 } },
  },
  city_rush: {
    name: "Rush Hour",
    progression: { order: 3, blurb: "Four entries, still three exits. Demand starts to outrun what the exits can take.", teaches: ["triage", "downstream pressure"], unlock: { after: "city_balanced", medal: "bronze" } },
    demandCurves: ramp([[0, 0.07], [60, 0.11], [180, 0.15], [360, 0.19], [540, 0.22]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 2300, satisfaction: 0.65 }, gold: { time: 720, earned: 3600, satisfaction: 0.8, maxIncidents: 3 } },
    gridlock: { fullSeconds: 9 },
    incidents: { duration: 15 },
    inputs: { input_w1: { queueCapacity: 12 }, input_w2: { queueCapacity: 12 }, input_n1: { queueCapacity: 8 }, input_n3: { queueCapacity: 8 } },
    outputs: { output_s1: { outflowPerMinute: 18 }, output_s2: { outflowPerMinute: 18 }, output_s3: { outflowPerMinute: 18 } },
  },
  city_crunch: {
    name: "The Crunch",
    progression: { order: 4, blurb: "Five entries, three exits. Something is always backing up: choose which queue pays.", teaches: ["pressure", "sacrifice"], unlock: { after: "city_rush", medal: "bronze" } },
    demandCurves: ramp([[0, 0.07], [60, 0.11], [180, 0.15], [360, 0.19], [540, 0.22]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 2300, satisfaction: 0.65 }, gold: { time: 720, earned: 3700, satisfaction: 0.82, maxIncidents: 4 } },
    gridlock: { fullSeconds: 9 },
    incidents: { duration: 15 },
    inputs: { input_w1: { queueCapacity: 12 }, input_w2: { queueCapacity: 12 }, input_n1: { queueCapacity: 8 }, input_n2: { queueCapacity: 8 }, input_n3: { queueCapacity: 8 } },
    outputs: { output_s1: { outflowPerMinute: 18 }, output_s2: { outflowPerMinute: 18 }, output_s3: { outflowPerMinute: 18 } },
  },
  network_01: {
    name: "Turning Traffic",
    progression: { order: 7, blurb: "Four arms, separate turn signals. Straight and turning cars share a crossing.", teaches: ["turns", "shared lanes"], unlock: { after: "network_02", medal: "bronze" } },
    demandCurves: ramp([[0, 0.06], [120, 0.12], [300, 0.2], [480, 0.3], [660, 0.4]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 2400, satisfaction: 0.65 }, gold: { time: 720, earned: 3700, satisfaction: 0.78, maxIncidents: 3 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
  network_03: {
    name: "Connected Junctions",
    progression: { order: 5, blurb: "Two junctions share a road. A queue released too early lands on the next light.", teaches: ["propagation", "downstream blocking"], unlock: { after: "city_crunch", medal: "bronze" } },
    demandCurves: ramp([[0, 0.05], [90, 0.1], [240, 0.16], [420, 0.22], [600, 0.3]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 2400, satisfaction: 0.65 }, gold: { time: 720, earned: 3700, satisfaction: 0.78, maxIncidents: 3 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
  network_02: {
    name: "City Grid",
    progression: { order: 6, blurb: "A 3x2 grid with many gates. Something is always going wrong somewhere else.", teaches: ["scanning", "triage"], unlock: { after: "network_03", medal: "bronze" } },
    demandCurves: ramp([[0, 0.06], [90, 0.1], [240, 0.14], [420, 0.18], [600, 0.22]]),
    curve: "shift",
    goal: { surviveSeconds: 900 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, earned: 2600, satisfaction: 0.65 }, gold: { time: 900, earned: 4200, satisfaction: 0.78, maxIncidents: 4 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
};

// Applies a level's META to a generated level object (and points every gate at its curve).
export function applyMeta(level) {
  const m = META[level.id];
  if (!m) return level;
  const { curve, name, inputs = {}, outputs = {}, botPhases, ...rest } = m;
  Object.assign(level, rest, { name });
  for (const g of level.inputGates) {
    const { demandScale, ...patch } = inputs[g.id] ?? {};
    Object.assign(g, patch);
    g.demand = { ...g.demand, curve, ...(demandScale ? { scale: demandScale } : {}) };
  }
  for (const g of level.outputGates) Object.assign(g, outputs[g.id] ?? {});
  return level;
}
