import { PrefabFactory } from "../../services/PrefabFactory.js";
import { trafficComponentDefaults } from "../../data/TrafficDefaults.js";
import { compileLevel } from "./compileLevel.js";

// Stable per-gate RNG seed from the level seed and the gate's level id.
function gateSeed(seed, id) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// Creates ECS entities from validated level data. Level ids become Entity ids
// (persistent, editor-facing); the runtime ids are the Entity objects themselves
// (and Entity.tempId). Returns a map levelId -> entity.
export function instantiateLevel(entityManager, level, seed = level.traffic?.seed ?? 1) {
  const { lanes, connectors, zones } = compileLevel(level);
  const factory = new PrefabFactory(entityManager, trafficComponentDefaults, level);
  const byId = new Map();
  const make = (type, levelId, components) => {
    const entity = factory.createEntity({ type, uniqueId: levelId, components });
    byId.set(levelId, entity);
    return entity;
  };

  entityManager.beginBatch();

  for (const r of level.roads ?? []) make("road", r.id, { RoadComponent: { ...r, levelId: r.id } });
  for (const b of level.buildings ?? []) make("building", b.id, { Position: { x: b.x, y: b.y }, BuildingComponent: { ...b, levelId: b.id } });
  for (const lane of lanes.values()) make("lane", lane.levelId, { LaneComponent: lane });
  for (const c of connectors.values()) make("lane", c.levelId, { LaneComponent: c });
  for (const j of level.junctions) make("junction", j.id, { Position: { x: j.bounds.x, y: j.bounds.y }, JunctionComponent: { ...j, levelId: j.id } });
  for (const g of level.signalGroups) make("signalGroup", g.id, { SignalGroupComponent: { ...g, levelId: g.id } });
  for (const r of level.routes) make("route", r.id, { RouteComponent: { levelId: r.id, steps: r.steps } });
  for (const g of level.inputGates) make("inputGate", g.id, { InputGateComponent: { ...g, levelId: g.id, seed: gateSeed(seed, g.id) } });
  for (const g of level.outputGates) make("outputGate", g.id, { OutputGateComponent: { ...g, levelId: g.id } });

  // Second pass: resolve level ids to entity references
  const comp = (id, name) => byId.get(id).getComponent(name);
  for (const lane of [...lanes.values(), ...connectors.values()]) {
    const lc = comp(lane.levelId, "LaneComponent");
    if (lane.junction) lc.junction = byId.get(lane.junction);
    if (lane.kind === "connector") {
      lc.signalGroup = byId.get(lane.signalGroup);
      comp(lane.signalGroup, "SignalGroupComponent").movements.push(byId.get(lane.levelId));
      comp(lane.junction, "JunctionComponent").connectors.push(byId.get(lane.levelId));
    }
  }
  for (const z of zones) {
    comp(z.junction, "JunctionComponent").zones.push(z);
    for (const side of ["a", "b"]) {
      z[side].lane = byId.get(z[side].movement);
      comp(z[side].movement, "LaneComponent").zones.push({ zone: z, side });
    }
    z.occupied = { a: null, b: null }; // vehicle currently inside each side
  }
  for (const r of level.routes) comp(r.id, "RouteComponent").steps = r.steps.map((id) => byId.get(id));
  for (const g of level.inputGates) {
    const gc = comp(g.id, "InputGateComponent");
    gc.lanes = g.lanes.map((id) => byId.get(id));
    gc.routes = g.routes.map((e) => ({ route: byId.get(e.route), weight: e.weight }));
  }
  for (const g of level.outputGates) {
    const gc = comp(g.id, "OutputGateComponent");
    gc.lane = byId.get(g.lane);
    gc.lane.getComponent("LaneComponent").outputGate = gc;
  }

  entityManager.endBatch();
  return byId;
}
