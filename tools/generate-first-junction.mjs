// Scaffolds data/levels/first-junction.json: the teaching level. One crossroads,
// two inputs (north, west), each with a straight lane and a right-turn lane, so
// four movements and three exits. The two approach arms differ in length on purpose: the short
// north arm fills quickly (dangerous to hold), the long west arm can hold a big
// queue (safe to charge). JSON is the source of truth; re-run only to regenerate:
//   node tools/generate-first-junction.mjs
import { writeFileSync } from "node:fs";

const W = 1400, H = 800, CX = 820, CY = 400, HALF = 40;

// Arm frame (right-hand traffic), as in generate-network.mjs: `d` points out from the centre,
// `r` is the driver's right when inbound. Lane 0 (side 10) goes straight, lane 1 (side 30) turns right.
const ARMS = { n: { d: [0, -1], r: [-1, 0] }, s: { d: [0, 1], r: [1, 0] }, e: { d: [1, 0], r: [0, -1] }, w: { d: [-1, 0], r: [0, 1] } };
const pt = (arm, along, side) => [CX + ARMS[arm].d[0] * along + ARMS[arm].r[0] * side, CY + ARMS[arm].d[1] * along + ARMS[arm].r[1] * side];
const far = { n: CY, s: H - CY, w: CX, e: W - CX };
const road = (a) => (a === "n" || a === "s" ? "road_ns" : "road_ew");
const inLane = (arm, index, side) => ({ id: `lane_${arm}_in_${index}`, kind: "approach", index, road: road(arm), junction: "junction_main", decisionDistance: 170, points: [pt(arm, far[arm], side), pt(arm, HALF, side)] });
const outLane = (arm) => ({ id: `lane_${arm}_out`, kind: "exit", index: 0, road: road(arm), points: [pt(arm, HALF, -10), pt(arm, far[arm], -10)] });
const lanes = [inLane("n", 0, 10), inLane("n", 1, 30), inLane("w", 0, 10), inLane("w", 1, 30), outLane("s"), outLane("e"), outLane("w")];

// Buildings fill the four quadrants, leaving a margin around the roads
const colors = ["#59606e", "#6b6558", "#4f5d6b", "#665b63"];
const buildings = [];
const I = 34; // extra clearance beside the roads, where the signal controls sit
const quads = [[0, 0, CX - HALF - I, CY - HALF - I], [CX + HALF + I, 0, W - CX - HALF - I, CY - HALF - I], [0, CY + HALF + I, CX - HALF - I, H - CY - HALF - I], [CX + HALF + I, CY + HALF + I, W - CX - HALF - I, H - CY - HALF - I]];
quads.forEach(([ox, oy, w, h], q) => {
  const cols = Math.max(1, Math.round(w / 300)), rows = Math.max(1, Math.round(h / 190));
  const cw = (w - 30 * (cols + 1)) / cols, ch = (h - 30 * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    buildings.push({ id: `bld_${q}_${r}_${c}`, x: Math.round(ox + 30 + c * (cw + 30)), y: Math.round(oy + 30 + r * (ch + 30)), w: Math.round(cw), h: Math.round(ch), color: colors[(q + r + c) % 4], windows: 4 + ((r + c) % 4) * 2 });
  }
});

const level = {
  schemaVersion: 2,
  id: "first_junction",
  name: "First Junction",
  progression: {
    order: 1,
    blurb: "Two roads, one crossing. Hold a line of cars, then let them go.",
    teaches: ["signals", "queues", "release", "risk", "incidents", "recovery"],
  },
  map: { width: W, height: H, background: "#33402f" },
  traffic: { seed: 7, vehicleMix: { car: 78, fast: 6, slow: 8, truck: 5, taxi: 3 } },
  // Arrivals per second at EACH input gate. A learning ramp: quiet start, then pressure.
  demandCurves: {
    shift: [
      { time: 0, rate: 0.07 },
      { time: 90, rate: 0.14 },
      { time: 210, rate: 0.25 },
      { time: 360, rate: 0.37 },
      { time: 510, rate: 0.47 },
      { time: 660, rate: 0.56 },
    ],
  },
  goal: { surviveSeconds: 720 },
  ratings: {
    bronze: { time: 360 },
    silver: { time: 540, earned: 3000, flow: 2 },
    gold: { time: 720, earned: 6000, flow: 3, maxIncidents: 2 },
  },
  gridlock: { fullSeconds: 8 },
  incidents: { duration: 16 },
  roads: [
    { id: "road_ns", points: [[CX, 0], [CX, H]], width: HALF * 2 },
    { id: "road_ew", points: [[0, CY], [W, CY]], width: HALF * 2 },
  ],
  lanes,
  inputGates: [
    { id: "input_north", label: "NORTH IN", lanes: ["lane_n_in_0", "lane_n_in_1"], queueCapacity: 8, demand: { curve: "shift" }, routes: [{ route: "route_n_straight", weight: 6 }, { route: "route_n_right", weight: 3 }] },
    { id: "input_west", label: "WEST IN", lanes: ["lane_w_in_0", "lane_w_in_1"], queueCapacity: 8, demand: { curve: "shift" }, routes: [{ route: "route_w_straight", weight: 6 }, { route: "route_w_right", weight: 3 }] },
  ],
  outputGates: [
    { id: "output_south", label: "SOUTH OUT", lane: "lane_s_out" },
    { id: "output_east", label: "EAST OUT", lane: "lane_e_out" },
    { id: "output_west", label: "WEST OUT", lane: "lane_w_out" },
  ],
  junctions: [
    {
      id: "junction_main",
      bounds: { x: CX - HALF, y: CY - HALF, w: HALF * 2, h: HALF * 2 },
      // N straight and W right both end in the south exit: a merge the player must keep apart
      movements: [
        { id: "mv_n_straight", from: "lane_n_in_0", to: "lane_s_out", turn: "straight", signalGroup: "sg_n_straight" },
        { id: "mv_n_right", from: "lane_n_in_1", to: "lane_w_out", turn: "right", signalGroup: "sg_n_turn" },
        { id: "mv_w_straight", from: "lane_w_in_0", to: "lane_e_out", turn: "straight", signalGroup: "sg_w_straight" },
        { id: "mv_w_right", from: "lane_w_in_1", to: "lane_s_out", turn: "right", signalGroup: "sg_w_turn" },
      ],
    },
  ],
  signalGroups: [
    { id: "sg_n_straight", junction: "junction_main", label: "SOUTHBOUND", initial: "green" },
    { id: "sg_n_turn", junction: "junction_main", label: "SOUTHBOUND TURN", initial: "red" },
    { id: "sg_w_straight", junction: "junction_main", label: "EASTBOUND", initial: "red" },
    { id: "sg_w_turn", junction: "junction_main", label: "EASTBOUND TURN", initial: "red" },
  ],
  routes: [
    { id: "route_n_straight", steps: ["lane_n_in_0", "mv_n_straight", "lane_s_out"] },
    { id: "route_n_right", steps: ["lane_n_in_1", "mv_n_right", "lane_w_out"] },
    { id: "route_w_straight", steps: ["lane_w_in_0", "mv_w_straight", "lane_e_out"] },
    { id: "route_w_right", steps: ["lane_w_in_1", "mv_w_right", "lane_s_out"] },
  ],
  obstacles: [],
  buildings,
  lighting: { preset: "day", enabled: false, quality: "low" },
};

writeFileSync(new URL("../data/levels/first-junction.json", import.meta.url), JSON.stringify(level, null, 2) + "\n");
console.log("wrote data/levels/first-junction.json");
