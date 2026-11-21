// Scaffolds data/levels/network-01.json. The JSON is the source of truth: edit it
// directly (or with the future editor). Re-run only to regenerate the compact
// four-arm test level:  node tools/generate-network.mjs
//
// Layout per arm (right-hand traffic): two inbound lanes, one outbound lane.
//   lane 0 = straight, lane 1 = turn (right). Conflicts are NOT written here:
//   they are derived from the movement paths when the level loads.
import { writeFileSync } from "node:fs";
import { applyMeta } from "./levelMeta.mjs";

const W = 1280, H = 720, CX = 640, CY = 360, HALF = 40;

// Arm frame: `d` is the unit vector pointing from the centre out along the arm,
// `r` the unit vector to the driver's right when driving inbound.
const ARMS = {
  n: { name: "north", d: [0, -1], r: [-1, 0] },
  s: { name: "south", d: [0, 1], r: [1, 0] },
  e: { name: "east", d: [1, 0], r: [0, -1] },
  w: { name: "west", d: [-1, 0], r: [0, 1] },
};
const opposite = { n: "s", s: "n", e: "w", w: "e" };
const rightOf = { n: "w", w: "s", s: "e", e: "n" }; // exit arm after a right turn from this arm
const edge = (a) => (a === "n" || a === "s" ? H / 2 : W / 2);
const pt = (arm, along, side) => {
  const { d, r } = ARMS[arm];
  return [Math.round(CX + d[0] * along + r[0] * side), Math.round(CY + d[1] * along + r[1] * side)];
};

const lanes = [];
const movements = [];
const routes = [];
const inputGates = [];
const outputGates = [];
for (const arm of Object.keys(ARMS)) {
  const far = edge(arm);
  for (const [index, side] of [[0, 10], [1, 30]]) {
    lanes.push({ id: `lane_${arm}_in_${index}`, kind: "approach", index, road: arm === "n" || arm === "s" ? "road_ns" : "road_ew", junction: "junction_main", decisionDistance: 170, points: [pt(arm, far, side), pt(arm, HALF, side)] });
  }
  lanes.push({ id: `lane_${arm}_out`, kind: "exit", index: 0, road: arm === "n" || arm === "s" ? "road_ns" : "road_ew", points: [pt(arm, HALF, -10), pt(arm, far, -10)] });
}
for (const arm of Object.keys(ARMS)) {
  movements.push({ id: `mv_${arm}_straight`, from: `lane_${arm}_in_0`, to: `lane_${opposite[arm]}_out`, turn: "straight", signalGroup: arm === "n" || arm === "s" ? "sg_ns_straight" : "sg_ew_straight" });
  movements.push({ id: `mv_${arm}_right`, from: `lane_${arm}_in_1`, to: `lane_${rightOf[arm]}_out`, turn: "right", signalGroup: arm === "n" || arm === "s" ? "sg_ns_turn" : "sg_ew_turn" });
  routes.push({ id: `route_${arm}_straight`, steps: [`lane_${arm}_in_0`, `mv_${arm}_straight`, `lane_${opposite[arm]}_out`] });
  routes.push({ id: `route_${arm}_right`, steps: [`lane_${arm}_in_1`, `mv_${arm}_right`, `lane_${rightOf[arm]}_out`] });
  inputGates.push({
    id: `input_${ARMS[arm].name}`,
    label: `INPUT ${ARMS[arm].name.toUpperCase()}`,
    lanes: [`lane_${arm}_in_0`, `lane_${arm}_in_1`],
    queueCapacity: 12,
    demand: { curve: "rush-hour" },
    routes: [{ route: `route_${arm}_straight`, weight: 6 }, { route: `route_${arm}_right`, weight: 3 }],
  });
  outputGates.push({ id: `output_${ARMS[arm].name}`, label: `OUTPUT ${ARMS[arm].name.toUpperCase()}`, lane: `lane_${arm}_out` });
}

const blocks = [];
const colors = ["#59606e", "#6b6558", "#4f5d6b", "#665b63"];
[[0, 0], [CX + HALF, 0], [0, CY + HALF], [CX + HALF, CY + HALF]].forEach(([ox, oy], q) => {
  const w = CX - HALF, h = CY - HALF;
  const cw = (w - 90) / 2, ch = (h - 90) / 2;
  for (let i = 0; i < 4; i++) {
    blocks.push({ id: `bld_${q}_${i}`, x: Math.round(ox + 30 + (i % 2) * (cw + 30)), y: Math.round(oy + 30 + Math.floor(i / 2) * (ch + 30)), w: Math.round(cw), h: Math.round(ch), color: colors[(q + i) % 4], windows: 4 + i * 2 });
  }
});

const level = {
  schemaVersion: 2,
  id: "network_01",
  name: "Pressure Test",
  map: { width: W, height: H, background: "#33402f" },
  traffic: { seed: 1, vehicleMix: { car: 70, fast: 10, slow: 8, truck: 7, taxi: 5 } },
  // Arrivals per second at EACH input gate, interpolated between points and held after the last one.
  demandCurves: {
    "rush-hour": [
      { time: 0, rate: 0.1 },
      { time: 60, rate: 0.25 },
      { time: 120, rate: 0.4 },
      { time: 180, rate: 0.52 },
      { time: 240, rate: 0.64 },
      { time: 300, rate: 0.76 },
    ],
  },
  gridlock: { fullSeconds: 6 },
  incidents: { duration: 15 },
  scoring: { perVehicle: 1, perIncident: 5 },
  roads: [
    { id: "road_ns", name: "Mill Lane", points: [[CX, 0], [CX, H]], width: HALF * 2 },
    { id: "road_ew", name: "Quarry Road", points: [[0, CY], [W, CY]], width: HALF * 2 },
  ],
  lanes,
  inputGates,
  outputGates,
  junctions: [{ id: "junction_main", bounds: { x: CX - HALF, y: CY - HALF, w: HALF * 2, h: HALF * 2 }, movements }],
  signalGroups: [
    { id: "sg_ns_straight", junction: "junction_main", label: "NS STRAIGHT", initial: "green" },
    { id: "sg_ns_turn", junction: "junction_main", label: "NS TURN", initial: "red" },
    { id: "sg_ew_straight", junction: "junction_main", label: "EW STRAIGHT", initial: "red" },
    { id: "sg_ew_turn", junction: "junction_main", label: "EW TURN", initial: "red" },
  ],
  routes,
  obstacles: [],
  buildings: blocks,
  lighting: { preset: "day", enabled: false, quality: "low" },
};

writeFileSync(new URL("../data/levels/network-01.json", import.meta.url), JSON.stringify(applyMeta(level), null, 2) + "\n");
console.log("wrote data/levels/network-01.json");
