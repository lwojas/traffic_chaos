import { readFileSync } from "node:fs";
import { TrafficSession } from "../../scripts/traffic/session/TrafficSession.js";
import { MemoryDataProvider } from "../../scripts/services/data/MemoryDataProvider.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../../data/${p}`, import.meta.url), "utf8"));

export const gameConfig = read("game-config.json");
// Engine fixtures: frozen copies of the original 4-arm and 3x2 grid levels, so engine tests
// do not move when the shipped levels are retuned. Shipped levels are tested in levels.test.js.
const readFixture = (p) => JSON.parse(readFileSync(new URL(`../fixtures/${p}`, import.meta.url), "utf8"));
export const level01 = readFixture("network-01.json");
export const level02 = readFixture("network-02.json");
export const firstJunction = readFixture("first-junction.json");
export const clone = (o) => structuredClone(o);

export function memoryProvider(levels = [firstJunction, level02, level01]) {
  return new MemoryDataProvider({ gameConfig, levels: Object.fromEntries(levels.map((l) => [l.id, l])) });
}

// Session with all demand switched off, so tests place vehicles explicitly.
export function quietSession(level = level01, overrides = {}) {
  return TrafficSession.create(clone(level), gameConfig, { demandScale: 0, ...overrides });
}

// Places one vehicle at the start of its route's first lane, as the spawn system would.
export function spawnVehicle(session, gateId, routeId, typeId = "car") {
  const spawnSystem = session.systems[1];
  const gate = session.entity(gateId).getComponent("InputGateComponent");
  const route = session.entity(routeId);
  spawnSystem.inject(gate, route.getComponent("RouteComponent").steps[0], { type: session.sim.vehicleTypes[typeId], route });
  const lane = route.getComponent("RouteComponent").steps[0].getComponent("LaneComponent");
  return lane.vehicles[lane.vehicles.length - 1];
}

// Convenience: spawn by arm and movement, e.g. car(s, "n", "straight").
export const car = (session, arm, move, typeId = "car") =>
  spawnVehicle(session, `input_${{ n: "north", s: "south", e: "east", w: "west" }[arm]}`, `route_${arm}_${move}`, typeId);

export function runUntil(session, predicate, maxSeconds = 60) {
  const max = maxSeconds * session.sim.tickRate;
  for (let i = 0; i < max; i++) {
    if (predicate()) return true;
    session.tick();
  }
  return predicate();
}

export const vs = (vehicle) => vehicle.getComponent("VehicleStateComponent");
export const lane = (s, id) => s.entity(id).getComponent("LaneComponent");
export const group = (s, id) => s.entity(id).getComponent("SignalGroupComponent");
export const GROUPS = { nsS: "sg_ns_straight", nsT: "sg_ns_turn", ewS: "sg_ew_straight", ewT: "sg_ew_turn" };

// Sets the listed groups green and every other group red.
export function setGroups(session, ...greens) {
  for (const id of Object.values(GROUPS)) session.setSignal(id, greens.includes(id));
}
