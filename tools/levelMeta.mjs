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
    progression: { order: 1, blurb: "Four entries, one exit, and left turns. Every car that gets through pays; queues cost you multiplier, and a queue that backs into the junction ends the shift.", teaches: ["signals", "queues", "congestion"] },
    demandCurves: ramp([[0, 0.15], [90, 0.2], [240, 0.26], [420, 0.31], [660, 0.36]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 4000 }, gold: { time: 720, score: 7000, maxIncidents: 3 } },
    gridlock: { fullSeconds: 6 },
    incidents: { duration: 14 },
    // Roadworks close a link for a while: the streams behind it stall, so the player must re-prioritise mid-shift
    obstacles: [
      { id: "roadworks_a", kind: "roadworks", at: 150, duration: 30, blockedLanes: ["link_j_0_0_j_0_1"] },
      { id: "roadworks_b", kind: "roadworks", at: 330, duration: 35, blockedLanes: ["link_j_1_0_j_1_1"] },
      { id: "roadworks_c", kind: "roadworks", at: 520, duration: 40, blockedLanes: ["link_j_0_1_j_1_1"] },
    ],
    inputs: { input_w1: { queueCapacity: 14 }, input_n2: { queueCapacity: 8 }, input_w2: { queueCapacity: 12 }, input_e2: { queueCapacity: 8 } },
    // Playtest bots only (not written to the level): one phase per entry; the merges are at j_0_1 and j_1_1, E2 turns left into the exit
    botPhases: [["sg_j_0_1_ns_straight", "sg_j_1_1_ns_straight"], ["sg_j_0_0_ew_straight", "sg_j_0_1_ew_turn", "sg_j_1_1_ns_straight"], ["sg_j_1_0_ew_straight", "sg_j_1_1_ew_turn"], ["sg_j_1_1_e_left"]],
  },
  city_balanced: {
    name: "Harbour Street",
    progression: { order: 2, blurb: "Three entries, three exits. Balanced: every queue can be held, but not all at once.", teaches: ["priorities", "shared exits"], unlock: { after: "first_junction", medal: "bronze" } },
    demandCurves: ramp([[0, 0.07], [60, 0.11], [180, 0.15], [360, 0.19], [540, 0.22]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 5500 }, gold: { time: 720, score: 9500, maxIncidents: 2 } },
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
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 5500 }, gold: { time: 720, score: 10000, maxIncidents: 3 } },
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
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 6000 }, gold: { time: 720, score: 11000, maxIncidents: 4 } },
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
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 9500 }, gold: { time: 720, score: 17000, maxIncidents: 3 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
  network_03: {
    name: "Connected Junctions",
    progression: { order: 5, blurb: "Two junctions share a road. A queue released too early lands on the next light.", teaches: ["propagation", "downstream blocking"], unlock: { after: "city_crunch", medal: "bronze" } },
    demandCurves: ramp([[0, 0.05], [90, 0.1], [240, 0.16], [420, 0.22], [600, 0.3]]),
    curve: "shift",
    goal: { surviveSeconds: 720 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 14000 }, gold: { time: 720, score: 24000, maxIncidents: 3 } },
    gridlock: { fullSeconds: 8 },
    incidents: { duration: 16 },
  },
  network_02: {
    name: "City Grid",
    progression: { order: 6, blurb: "A 3x2 grid with many gates. Something is always going wrong somewhere else.", teaches: ["scanning", "triage"], unlock: { after: "network_03", medal: "bronze" } },
    demandCurves: ramp([[0, 0.06], [90, 0.1], [240, 0.14], [420, 0.18], [600, 0.22]]),
    curve: "shift",
    goal: { surviveSeconds: 900 },
        ratings: { bronze: { time: 360 }, silver: { time: 540, score: 25000 }, gold: { time: 900, score: 45000, maxIncidents: 4 } },
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
