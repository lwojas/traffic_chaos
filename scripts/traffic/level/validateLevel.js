// Validates level JSON at the data boundary so malformed levels fail here, with
// a path to the problem, rather than later inside ECS systems.
// Pure function: no Phaser, no ECS. The editor can use it as-is.

export const LEVEL_SCHEMA_VERSION = 2;

const TURNS = ["left", "straight", "right", "uturn"];
const LANE_KINDS = ["approach", "exit"];
const LIGHT_QUALITY = ["low", "medium", "high"];
export const MEDALS = ["bronze", "silver", "gold"];
// time: seconds survived, score: points from exits, maxIncidents: at most this many
export const RATING_KEYS = ["time", "score", "maxIncidents"];

export class LevelValidationError extends Error {
  constructor(levelId, errors) {
    super(
      `Level "${levelId}" is invalid (${errors.length} error${errors.length === 1 ? "" : "s"}):\n` +
        errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n"),
    );
    this.name = "LevelValidationError";
    this.errors = errors;
  }
}

// options.vehicleTypes: optional map of known vehicle type ids from game config.
export function validateLevel(level, options = {}) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!isObject(level)) {
    err("$", "level must be an object");
    return { valid: false, errors, warnings };
  }

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const isStr = (v) => typeof v === "string" && v.length > 0;
  const isPoint = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
  const checkPoints = (path, pts) => {
    if (!Array.isArray(pts) || pts.length < 2) return err(path, "needs at least 2 points");
    pts.forEach((p, i) => {
      if (!isPoint(p)) err(`${path}[${i}]`, "point must be [x, y] with finite numbers");
    });
  };
  const list = (key, required = true) => {
    const v = level[key];
    if (v === undefined) {
      if (required) err(key, "required array is missing");
      return [];
    }
    if (!Array.isArray(v)) {
      err(key, "must be an array");
      return [];
    }
    return v;
  };

  if (level.schemaVersion !== LEVEL_SCHEMA_VERSION)
    err("schemaVersion", `expected ${LEVEL_SCHEMA_VERSION}, got ${JSON.stringify(level.schemaVersion)}`);
  if (!isStr(level.id)) err("id", "required string");
  if (!isStr(level.name)) err("name", "required string");
  if (!isObject(level.map) || !(level.map.width > 0) || !(level.map.height > 0)) err("map", "requires positive width and height");

  // A level id must be unique across every entity category.
  const seen = new Map();
  const ids = { roads: new Set(), lanes: new Set(), movements: new Set(), junctions: new Set(), groups: new Set(), routes: new Set(), inputs: new Set(), outputs: new Set(), obstacles: new Set() };
  const claim = (path, id, set) => {
    if (!isStr(id)) return err(`${path}.id`, "required string");
    if (seen.has(id)) return err(`${path}.id`, `duplicate id "${id}" (also at ${seen.get(id)})`);
    seen.set(id, path);
    if (set) set.add(id);
  };

  const roads = list("roads", false);
  const lanes = list("lanes");
  const junctions = list("junctions");
  const groups = list("signalGroups");
  const routes = list("routes");
  const inputs = list("inputGates");
  const outputs = list("outputGates");
  const buildings = list("buildings", false);
  const obstacles = list("obstacles", false);

  roads.forEach((r, i) => {
    claim(`roads[${i}]`, r?.id, ids.roads);
    checkPoints(`roads[${i}].points`, r?.points);
    if (!(r?.width > 0)) err(`roads[${i}].width`, "must be > 0");
    if (r?.name !== undefined && typeof r.name !== "string") err(`roads[${i}].name`, "must be a string");
  });
  buildings.forEach((b, i) => {
    claim(`buildings[${i}]`, b?.id);
    for (const k of ["x", "y", "w", "h"]) if (!isNum(b?.[k])) err(`buildings[${i}].${k}`, "must be a number");
  });
  lanes.forEach((l, i) => claim(`lanes[${i}]`, l?.id, ids.lanes));
  junctions.forEach((j, i) => {
    claim(`junctions[${i}]`, j?.id, ids.junctions);
    (Array.isArray(j?.movements) ? j.movements : []).forEach((m, k) => claim(`junctions[${i}].movements[${k}]`, m?.id, ids.movements));
  });
  groups.forEach((g, i) => claim(`signalGroups[${i}]`, g?.id, ids.groups));
  routes.forEach((r, i) => claim(`routes[${i}]`, r?.id, ids.routes));
  inputs.forEach((g, i) => claim(`inputGates[${i}]`, g?.id, ids.inputs));
  outputs.forEach((g, i) => claim(`outputGates[${i}]`, g?.id, ids.outputs));
  obstacles.forEach((o, i) => claim(`obstacles[${i}]`, o?.id, ids.obstacles));

  const laneById = new Map(lanes.map((l) => [l?.id, l]));
  const movementById = new Map();
  junctions.forEach((j) => (Array.isArray(j?.movements) ? j.movements : []).forEach((m) => movementById.set(m?.id, { ...m, junction: j.id })));

  lanes.forEach((l, i) => {
    const p = `lanes[${i}]`;
    if (!isObject(l)) return err(p, "must be an object");
    checkPoints(`${p}.points`, l.points);
    if (l.speedLimit !== undefined && !(l.speedLimit > 0)) err(`${p}.speedLimit`, "must be > 0");
    if (l.kind !== undefined && !LANE_KINDS.includes(l.kind)) err(`${p}.kind`, `must be one of ${LANE_KINDS.join(", ")}`);
    if (l.index !== undefined && !(Number.isInteger(l.index) && l.index >= 0)) err(`${p}.index`, "must be an integer >= 0");
    if (l.road !== undefined && !ids.roads.has(l.road)) err(`${p}.road`, `unknown road "${l.road}"`);
    if (l.junction !== undefined && !ids.junctions.has(l.junction)) err(`${p}.junction`, `unknown junction "${l.junction}"`);
    if (l.decisionDistance !== undefined && !(l.decisionDistance >= 0)) err(`${p}.decisionDistance`, "must be >= 0");
    if (l.stopLineOffset !== undefined && !(l.stopLineOffset >= 0)) err(`${p}.stopLineOffset`, "must be >= 0");
  });

  const groupJunction = new Map(groups.map((g) => [g?.id, g?.junction]));
  junctions.forEach((j, i) => {
    const p = `junctions[${i}]`;
    if (!isObject(j)) return err(p, "must be an object");
    const b = j.bounds;
    if (!isObject(b) || !["x", "y", "w", "h"].every((k) => isNum(b[k]))) err(`${p}.bounds`, "requires numeric x, y, w, h");
    if (j.conflictDistance !== undefined && !(j.conflictDistance > 0)) err(`${p}.conflictDistance`, "must be > 0");
    if (!Array.isArray(j.movements) || j.movements.length === 0) return err(`${p}.movements`, "needs at least one movement");
    j.movements.forEach((m, k) => {
      const mp = `${p}.movements[${k}]`;
      if (!laneById.has(m?.from)) err(`${mp}.from`, `unknown lane "${m?.from}"`);
      if (!laneById.has(m?.to)) err(`${mp}.to`, `unknown lane "${m?.to}"`);
      if (m?.from !== undefined && m.from === m.to) err(mp, "from and to must differ");
      if (m?.turn !== undefined && !TURNS.includes(m.turn)) err(`${mp}.turn`, `must be one of ${TURNS.join(", ")}`);
      if (m?.speedLimit !== undefined && !(m.speedLimit > 0)) err(`${mp}.speedLimit`, "must be > 0");
      if (m?.path !== undefined) checkPoints(`${mp}.path`, m.path);
      if (!ids.groups.has(m?.signalGroup)) err(`${mp}.signalGroup`, `unknown signalGroup "${m?.signalGroup}"`);
      else if (groupJunction.get(m.signalGroup) !== j.id) err(`${mp}.signalGroup`, `signalGroup "${m.signalGroup}" belongs to junction "${groupJunction.get(m.signalGroup)}", not "${j.id}"`);
    });
  });

  groups.forEach((g, i) => {
    const p = `signalGroups[${i}]`;
    if (!ids.junctions.has(g?.junction)) err(`${p}.junction`, `unknown junction "${g?.junction}"`);
    if (g?.initial !== undefined && !["red", "green"].includes(g.initial)) err(`${p}.initial`, 'must be "red" or "green"');
    if (g?.yellowTime !== undefined && !(g.yellowTime >= 0)) err(`${p}.yellowTime`, "must be a number >= 0");
  });

  routes.forEach((r, i) => {
    const p = `routes[${i}]`;
    if (!Array.isArray(r?.steps) || r.steps.length < 1) return err(`${p}.steps`, "needs at least one step");
    let prevLane = null;
    let pendingMovement = null;
    r.steps.forEach((id, k) => {
      const sp = `${p}.steps[${k}]`;
      const isLane = laneById.has(id);
      const isMove = movementById.has(id);
      if (!isLane && !isMove) return err(sp, `unknown lane or movement "${id}"`);
      if (k === 0 && !isLane) err(sp, "route must start on a lane");
      if (isLane) {
        if (pendingMovement && pendingMovement.to !== id) err(sp, `movement "${pendingMovement.id}" leads to "${pendingMovement.to}", not "${id}"`);
        if (prevLane && !pendingMovement) err(sp, "two lanes in a row need a movement between them");
        prevLane = id;
        pendingMovement = null;
      } else {
        if (!prevLane || pendingMovement) err(sp, "movement must follow a lane");
        else if (movementById.get(id).from !== prevLane) err(sp, `movement "${id}" starts at "${movementById.get(id).from}", not "${prevLane}"`);
        pendingMovement = movementById.get(id);
      }
    });
    if (pendingMovement) err(`${p}.steps`, "route ends on a movement, it must end on a lane");
  });

  const curves = isObject(level.demandCurves) ? level.demandCurves : {};
  if (level.demandCurves !== undefined && !isObject(level.demandCurves)) err("demandCurves", "must be an object of curveId -> [{ time, rate }]");
  for (const [id, pts] of Object.entries(curves)) {
    const p = `demandCurves.${id}`;
    if (!Array.isArray(pts) || pts.length === 0) {
      err(p, "needs at least one { time, rate } point");
      continue;
    }
    pts.forEach((pt, k) => {
      if (!(pt?.time >= 0)) err(`${p}[${k}].time`, "must be a number >= 0");
      if (!(pt?.rate >= 0)) err(`${p}[${k}].rate`, "must be a number >= 0");
      if (k > 0 && pt?.time <= pts[k - 1]?.time) err(`${p}[${k}].time`, "points must be in increasing time order");
    });
  }

  const routeById = new Map(routes.map((r) => [r?.id, r]));
  const lastLane = (r) => r?.steps?.[r.steps.length - 1];
  inputs.forEach((g, i) => {
    const p = `inputGates[${i}]`;
    if (!Array.isArray(g?.lanes) || g.lanes.length === 0) err(`${p}.lanes`, "needs at least one lane the gate feeds");
    else g.lanes.forEach((id, k) => {
      if (!laneById.has(id)) err(`${p}.lanes[${k}]`, `unknown lane "${id}"`);
    });
    if (!(Number.isInteger(g?.queueCapacity) && g.queueCapacity > 0)) err(`${p}.queueCapacity`, "must be an integer > 0");
    if (!isObject(g?.demand) || !(g.demand.curve in curves)) err(`${p}.demand.curve`, `unknown demand curve "${g?.demand?.curve}"`);
    else if (g.demand.scale !== undefined && !(g.demand.scale >= 0)) err(`${p}.demand.scale`, "must be >= 0");
    if (!Array.isArray(g?.routes) || g.routes.length === 0) return err(`${p}.routes`, "needs at least one route");
    g.routes.forEach((entry, k) => {
      const rp = `${p}.routes[${k}]`;
      const route = routeById.get(entry?.route);
      if (!route) err(`${rp}.route`, `unknown route "${entry?.route}"`);
      else if (!g.lanes?.includes(route.steps?.[0])) err(`${rp}.route`, `route "${route.id}" starts at "${route.steps?.[0]}", which this gate does not feed`);
      else if (!outputs.some((o) => o?.lane === lastLane(route))) err(`${rp}.route`, `route "${route.id}" ends on "${lastLane(route)}", which has no output gate`);
      if (!(entry?.weight > 0)) err(`${rp}.weight`, "must be > 0");
    });
  });
  outputs.forEach((g, i) => {
    const p = `outputGates[${i}]`;
    if (!laneById.has(g?.lane)) err(`${p}.lane`, `unknown lane "${g?.lane}"`);
    if (g?.outflowPerMinute !== undefined && !(g.outflowPerMinute > 0)) err(`${p}.outflowPerMinute`, "must be > 0");
  });
  if (inputs.length === 0) err("inputGates", "needs at least one input gate");
  if (outputs.length === 0) err("outputGates", "needs at least one output gate");

  obstacles.forEach((o, i) => {
    const p = `obstacles[${i}]`;
    if (!isStr(o?.kind)) err(`${p}.kind`, "required string");
    if (!(o?.at >= 0)) err(`${p}.at`, "start time must be a number >= 0");
    if (!(o?.duration > 0)) err(`${p}.duration`, "must be > 0");
    if (o?.position !== undefined && !(isNum(o.position) && o.position >= 0 && o.position <= 1)) err(`${p}.position`, "must be a fraction 0..1 along the lane (default 1, the far end)");
    if (!Array.isArray(o?.blockedLanes) || o.blockedLanes.length === 0) err(`${p}.blockedLanes`, "needs at least one lane or movement id");
    else o.blockedLanes.forEach((id, k) => {
      if (!laneById.has(id) && !movementById.has(id)) err(`${p}.blockedLanes[${k}]`, `unknown lane or movement "${id}"`);
    });
  });

  const optNum = (path, v, min = 0) => {
    if (v !== undefined && !(isNum(v) && v >= min)) err(path, `must be a number >= ${min}`);
  };
  if (level.traffic !== undefined) {
    const t = level.traffic;
    if (!isObject(t)) err("traffic", "must be an object");
    else {
      if (t.seed !== undefined && !Number.isInteger(t.seed)) err("traffic.seed", "must be an integer");
      if (t.vehicleMix !== undefined) {
        if (!isObject(t.vehicleMix)) err("traffic.vehicleMix", "must be an object of typeId -> weight");
        else
          for (const [type, w] of Object.entries(t.vehicleMix)) {
            if (!(w >= 0)) err(`traffic.vehicleMix.${type}`, "weight must be >= 0");
            if (options.vehicleTypes && !options.vehicleTypes[type]) err(`traffic.vehicleMix.${type}`, `unknown vehicle type "${type}"`);
          }
      }
    }
  }
  for (const key of ["gridlock", "incidents", "scoring"]) if (level[key] !== undefined && !isObject(level[key])) err(key, "must be an object");
  optNum("gridlock.fullSeconds", level.gridlock?.fullSeconds);
  optNum("incidents.duration", level.incidents?.duration, 0.001);
  optNum("scoring.perVehicle", level.scoring?.perVehicle);
  for (const key of ["economy", "multiplier", "pressure", "interventions", "goal", "ratings", "progression"]) if (level[key] !== undefined && !isObject(level[key])) err(key, "must be an object");
  optNum("economy.cashPerVehicle", level.economy?.cashPerVehicle);
  optNum("economy.startCash", level.economy?.startCash);
  for (const key of ["min", "max", "calm", "jam", "riseGain", "fallGain", "fallSeconds"]) optNum(`multiplier.${key}`, level.multiplier?.[key]);
  if (level.pressure?.riskBands !== undefined && !(Array.isArray(level.pressure.riskBands) && level.pressure.riskBands.every(isNum))) err("pressure.riskBands", "must be an array of numbers");
  if (isObject(level.interventions)) for (const [id, cfg] of Object.entries(level.interventions)) for (const [k, v] of Object.entries(cfg ?? {})) optNum(`interventions.${id}.${k}`, v);
  optNum("goal.surviveSeconds", level.goal?.surviveSeconds, 1);
  if (isObject(level.ratings))
    for (const [medal, req] of Object.entries(level.ratings)) {
      if (!MEDALS.includes(medal)) err(`ratings.${medal}`, `must be one of ${MEDALS.join(", ")}`);
      else if (!isObject(req)) err(`ratings.${medal}`, "must be an object of requirements");
      else for (const [k, v] of Object.entries(req)) if (!RATING_KEYS.includes(k)) err(`ratings.${medal}.${k}`, `unknown requirement (use ${RATING_KEYS.join(", ")})`); else optNum(`ratings.${medal}.${k}`, v);
    }
  if (isObject(level.progression)) {
    const u = level.progression.unlock;
    if (u !== undefined && !(isObject(u) && isStr(u.after) && (u.medal === undefined || MEDALS.includes(u.medal)))) err("progression.unlock", "must be { after: levelId, medal?: bronze|silver|gold }");
  }
  if (level.lighting !== undefined) {
    const l = level.lighting;
    if (!isObject(l)) err("lighting", "must be an object");
    else if (l.quality !== undefined && !LIGHT_QUALITY.includes(l.quality)) err("lighting.quality", `must be one of ${LIGHT_QUALITY.join(", ")}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function assertValidLevel(level, options) {
  const result = validateLevel(level, options);
  if (!result.valid) throw new LevelValidationError(level?.id ?? "<unknown>", result.errors);
  return result;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
