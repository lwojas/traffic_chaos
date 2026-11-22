// Scaffolds data/levels/network-02.json: a 3x2 grid of signalised junctions on a
// map much larger than the viewport. The JSON is the source of truth; re-run only
// to regenerate:  node tools/generate-grid-network.mjs
//
// Arms on the map edge are input/output gates with two inbound lanes (lane 0 =
// straight, lane 1 = right turn), like network-01. Arms between junctions are a
// single "link" lane per direction that is the exit of one junction and the
// approach of the next, so a link lane carries both its straight and right-turn
// movements. Conflicts are NOT written here: they are derived at load time.
import { writeFileSync } from "node:fs";
import { applyMeta } from "./levelMeta.mjs";

// Variants:  node tools/generate-grid-network.mjs            -> network_02 (3x2 City Grid)
//            node tools/generate-grid-network.mjs connected  -> network_03 (2x1, two junctions on one road)
//            node tools/generate-grid-network.mjs start      -> first_junction (2x2, 2 entries / 3 exits)
// `entries` / `exits` (gate names such as W1, N2) make a gate entry-only or exit-only; omitted = every edge arm is both.
const VARIANTS = {
  connected: { cols: 2, rows: 1, id: "network_03", name: "Connected Junctions", file: "network-03.json", dx: 900 },
  start: { cols: 2, rows: 2, id: "first_junction", name: "Mill Town", file: "first-junction.json", dx: 1100, entries: ["W1", "N2"], exits: ["S1", "S2", "W2"] },
};
// One network, three levels: only the entry set changes. Exits are always the south edge, so each extra entry is pure added demand.
const CITY = { cols: 3, rows: 2, dx: 1000, exits: ["S1", "S2", "S3"] };
VARIANTS.balanced = { ...CITY, id: "city_balanced", name: "Harbour Street", file: "city-balanced.json", entries: ["W1", "N1", "N3"] };
VARIANTS.rush = { ...CITY, id: "city_rush", name: "Rush Hour", file: "city-rush.json", entries: ["W1", "W2", "N1", "N3"] };
VARIANTS.crunch = { ...CITY, id: "city_crunch", name: "The Crunch", file: "city-crunch.json", entries: ["W1", "W2", "N1", "N2", "N3"] };
const VARIANT = VARIANTS[process.argv[2]] ?? { cols: 3, rows: 2, id: "network_02", name: "City Grid", file: "network-02.json", dx: 1000 };
const COLS = VARIANT.cols, ROWS = VARIANT.rows;
const X0 = 700, Y0 = 450, DX = VARIANT.dx, DY = 800, HALF = 40;
const W = X0 * 2 + DX * (COLS - 1), H = Y0 * 2 + DY * (ROWS - 1);

const DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const RIGHT_VEC = { n: [-1, 0], s: [1, 0], e: [0, -1], w: [0, 1] }; // driver's right when inbound on that arm
const OPP = { n: "s", s: "n", e: "w", w: "e" };
const RIGHT_OF = { n: "w", w: "s", s: "e", e: "n" }; // exit arm after a right turn from this arm
const STEP = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] }; // [dRow, dCol] to the neighbouring junction
const isNS = (a) => a === "n" || a === "s";

const jid = (r, c) => `j_${r}_${c}`;
const jname = (r, c) => `${String.fromCharCode(65 + r)}${c + 1}`;
const centre = (r, c) => [X0 + c * DX, Y0 + r * DY];
const pt = (r, c, arm, along, side) => {
  const [cx, cy] = centre(r, c);
  const [dx, dy] = DIR[arm], [rx, ry] = RIGHT_VEC[arm];
  return [Math.round(cx + dx * along + rx * side), Math.round(cy + dy * along + ry * side)];
};
const neighbour = (r, c, arm) => {
  const [dr, dc] = STEP[arm];
  const nr = r + dr, nc = c + dc;
  return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS ? [nr, nc] : null;
};
const edgeDist = (r, c, arm) => {
  const [cx, cy] = centre(r, c);
  return { n: cy, s: H - cy, w: cx, e: W - cx }[arm];
};
const roadOf = (r, c, arm) => (isNS(arm) ? `road_v${c}` : `road_h${r}`);
const gateName = (r, c, arm) => {
  if (arm === "n") return `N${c + 1}`;
  if (arm === "s") return `S${c + 1}`;
  if (arm === "w") return `W${r + 1}`;
  return `E${r + 1}`;
};

const lanes = [];
const laneIds = { inbound: {}, out: {} }; // keyed `${r},${c},${arm}`
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  for (const arm of Object.keys(DIR)) {
    const key = `${r},${c},${arm}`;
    const nb = neighbour(r, c, arm);
    const base = `lane_${jid(r, c)}_${arm}`;
    if (!nb) {
      const far = edgeDist(r, c, arm);
      laneIds.inbound[key] = [`${base}_in_0`, `${base}_in_1`];
      laneIds.out[key] = `${base}_out`;
      [[0, 10], [1, 30]].forEach(([index, side]) =>
        lanes.push({ id: `${base}_in_${index}`, kind: "approach", index, road: roadOf(r, c, arm), junction: jid(r, c), decisionDistance: 170, points: [pt(r, c, arm, far, side), pt(r, c, arm, HALF, side)] }));
      lanes.push({ id: `${base}_out`, kind: "exit", index: 0, road: roadOf(r, c, arm), points: [pt(r, c, arm, HALF, -10), pt(r, c, arm, far, -10)] });
    }
  }
}
// Link lanes, one per direction between neighbouring junctions
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const arm of Object.keys(DIR)) {
  const nb = neighbour(r, c, arm);
  if (!nb) continue;
  const [nr, nc] = nb;
  const id = `link_${jid(r, c)}_${jid(nr, nc)}`; // leaves (r,c) through `arm`, arrives at (nr,nc) through OPP[arm]
  lanes.push({ id, kind: "approach", index: 0, road: roadOf(r, c, arm), junction: jid(nr, nc), decisionDistance: 170, points: [pt(r, c, arm, HALF, -10), pt(nr, nc, OPP[arm], HALF, 10)] });
  laneIds.out[`${r},${c},${arm}`] = id;
  laneIds.inbound[`${nr},${nc},${OPP[arm]}`] = [id];
}

const inboundLane = (r, c, arm, turn) => {
  const l = laneIds.inbound[`${r},${c},${arm}`];
  return turn === "right" && l.length > 1 ? l[1] : l[0];
};
const outLane = (r, c, arm) => laneIds.out[`${r},${c},${arm}`];

const junctions = [];
const signalGroups = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const J = jid(r, c);
  const [cx, cy] = centre(r, c);
  const movements = [];
  for (const arm of Object.keys(DIR)) {
    const axis = isNS(arm) ? "ns" : "ew";
    movements.push({ id: `mv_${J}_${arm}_straight`, from: inboundLane(r, c, arm, "straight"), to: outLane(r, c, OPP[arm]), turn: "straight", signalGroup: `sg_${J}_${axis}_straight` });
    movements.push({ id: `mv_${J}_${arm}_right`, from: inboundLane(r, c, arm, "right"), to: outLane(r, c, RIGHT_OF[arm]), turn: "right", signalGroup: `sg_${J}_${axis}_turn` });
  }
  junctions.push({ id: J, bounds: { x: cx - HALF, y: cy - HALF, w: HALF * 2, h: HALF * 2 }, movements });
  for (const [axis, kind, label] of [["ns", "straight", "NS STRAIGHT"], ["ns", "turn", "NS TURN"], ["ew", "straight", "EW STRAIGHT"], ["ew", "turn", "EW TURN"]])
    signalGroups.push({ id: `sg_${J}_${axis}_${kind}`, junction: J, label: `${jname(r, c)} ${label}`, initial: axis === "ns" && kind === "straight" ? "green" : "red" });
}

// Routes: from each edge input, straight through, or one right turn at the 1st or 2nd junction
const routes = [];
const inputGates = [];
const outputGates = [];
const ROUTE_WEIGHTS = { straight: 6, right0: 2, right1: 1.5 };
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const arm of Object.keys(DIR)) {
  if (neighbour(r, c, arm)) continue;
  const name = gateName(r, c, arm);
  const isExit = !VARIANT.exits || VARIANT.exits.includes(name);
  const isEntry = !VARIANT.entries || VARIANT.entries.includes(name);
  if (isExit) outputGates.push({ id: `output_${name.toLowerCase()}`, label: `OUTPUT ${name}`, lane: outLane(r, c, arm) });
  if (!isEntry) continue;
  const gate = { id: `input_${name.toLowerCase()}`, label: `INPUT ${name}`, lanes: laneIds.inbound[`${r},${c},${arm}`], queueCapacity: 12, demand: { curve: "rush-hour" }, routes: [] };
  for (const [kind, turnAt] of [["straight", -1], ["right0", 0], ["right1", 1]]) {
    const steps = [];
    let cr = r, cc = c, a = arm, hop = 0, lastArm = name;
    for (;;) {
      const turn = hop === turnAt ? "right" : "straight";
      if (hop === 0) steps.push(inboundLane(cr, cc, a, turn));
      steps.push(`mv_${jid(cr, cc)}_${a}_${turn}`);
      const exitArm = turn === "right" ? RIGHT_OF[a] : OPP[a];
      steps.push(outLane(cr, cc, exitArm));
      const nb = neighbour(cr, cc, exitArm);
      if (!nb) { lastArm = gateName(cr, cc, exitArm); break; }
      [cr, cc] = nb;
      a = OPP[exitArm];
      hop++;
    }
    if (turnAt >= 0 && hop < turnAt) continue; // route is shorter than the turn index: skip
    if (VARIANT.exits && !VARIANT.exits.includes(lastArm)) continue; // it would leave through an arm that is not an exit
    const id = `route_${name.toLowerCase()}_${kind}`;
    routes.push({ id, steps });
    gate.routes.push({ route: id, weight: ROUTE_WEIGHTS[kind] });
  }
  inputGates.push(gate);
}

// Road-side blocks between the roads
const xs = [0];
for (let c = 0; c < COLS; c++) xs.push(X0 + c * DX - HALF, X0 + c * DX + HALF);
xs.push(W);
const ys = [0];
for (let r = 0; r < ROWS; r++) ys.push(Y0 + r * DY - HALF, Y0 + r * DY + HALF);
ys.push(H);
const buildings = [];
const colors = ["#59606e", "#6b6558", "#4f5d6b", "#665b63"];
let n = 0;
for (let i = 0; i < xs.length - 1; i += 2) for (let k = 0; k < ys.length - 1; k += 2) {
  const x0 = xs[i] + 40, x1 = xs[i + 1] - 40, y0 = ys[k] + 40, y1 = ys[k + 1] - 40;
  const nx = Math.max(1, Math.floor((x1 - x0 + 30) / 220));
  const ny = Math.max(1, Math.floor((y1 - y0 + 30) / 190));
  const bw = (x1 - x0 - (nx - 1) * 30) / nx;
  const bh = (y1 - y0 - (ny - 1) * 30) / ny;
  for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
    buildings.push({ id: `bld_${n}`, x: Math.round(x0 + a * (bw + 30)), y: Math.round(y0 + b * (bh + 30)), w: Math.round(bw), h: Math.round(bh), color: colors[n % 4], windows: 4 + (n % 4) * 2 });
    n++;
  }
}

const roads = [];
for (let c = 0; c < COLS; c++) roads.push({ id: `road_v${c}`, name: ["Harbour Street", "Station Avenue", "Orchard Way"][c % 3], points: [[X0 + c * DX, 0], [X0 + c * DX, H]], width: HALF * 2 });
for (let r = 0; r < ROWS; r++) roads.push({ id: `road_h${r}`, name: ["Quarry Road", "Canal Street"][r % 2], points: [[0, Y0 + r * DY], [W, Y0 + r * DY]], width: HALF * 2 });

const level = {
  schemaVersion: 2,
  id: VARIANT.id,
  name: VARIANT.name,
  map: { width: W, height: H, background: "#33402f" },
  traffic: { seed: 7, vehicleMix: { car: 70, fast: 10, slow: 8, truck: 7, taxi: 5 } },
  // Arrivals per second at EACH input gate
  demandCurves: {
    "rush-hour": [
      { time: 0, rate: 0.04 },
      { time: 90, rate: 0.08 },
      { time: 180, rate: 0.12 },
      { time: 300, rate: 0.17 },
      { time: 420, rate: 0.22 },
    ],
  },
  gridlock: { fullSeconds: 8 },
  incidents: { duration: 15 },
  roads,
  lanes,
  inputGates,
  outputGates,
  junctions,
  signalGroups,
  routes,
  obstacles: [],
  buildings,
  lighting: { preset: "day", enabled: false, quality: "low" },
};

writeFileSync(new URL(`../data/levels/${VARIANT.file}`, import.meta.url), JSON.stringify(applyMeta(level), null, 2) + "\n");
console.log(`wrote data/levels/${VARIANT.file} (${W}x${H}, ${junctions.length} junctions, ${inputGates.length} gates, ${routes.length} routes, ${buildings.length} buildings)`);
