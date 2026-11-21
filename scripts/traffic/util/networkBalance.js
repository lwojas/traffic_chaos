// Design-time diagnostic: how much traffic a level pushes in versus how much its
// exits can discharge. A LEVEL-DESIGN aid, not a simulation rule: nothing in the
// session reads it. Signals, road capacity and the player decide what actually
// happens; this only tells an author whether the entry/exit data matches intent.
//
//   pressure = peak demand into the network / discharge capacity of the exits
//   < 0.5 forgiving   0.5-0.8 balanced   0.8-1.1 pressured   > 1.1 severe
//
// Demand is split across exits by each gate's route weights. An exit's capacity
// is its `outflowPerMinute`, or a nominal one-lane rate when it is uncapped.
export const NOMINAL_EXIT_RATE = 0.4; // vehicles per second through an uncapped exit lane

const peakRate = (curve) => Math.max(...curve.map((p) => p.rate));

export function networkBalance(level) {
  const routeExit = new Map();
  for (const r of level.routes) routeExit.set(r.id, r.steps[r.steps.length - 1]);
  const exitOfLane = new Map(level.outputGates.map((g) => [g.lane, g.id]));
  const load = new Map(level.outputGates.map((g) => [g.id, 0]));
  let demand = 0;
  for (const g of level.inputGates) {
    const rate = peakRate(level.demandCurves[g.demand.curve]) * (g.demand.scale ?? 1);
    demand += rate;
    const total = g.routes.reduce((a, r) => a + r.weight, 0);
    for (const r of g.routes) {
      const exit = exitOfLane.get(routeExit.get(r.route));
      if (exit) load.set(exit, load.get(exit) + (rate * r.weight) / total);
    }
  }
  const exits = level.outputGates.map((g) => {
    const capacity = g.outflowPerMinute ? g.outflowPerMinute / 60 : NOMINAL_EXIT_RATE;
    return { id: g.id, load: load.get(g.id), capacity, ratio: load.get(g.id) / capacity };
  });
  const capacity = exits.reduce((a, e) => a + e.capacity, 0);
  const pressure = demand / capacity;
  return {
    inputs: level.inputGates.length,
    outputs: level.outputGates.length,
    demand,
    capacity,
    pressure,
    worstExit: exits.reduce((a, e) => (e.ratio > a.ratio ? e : a), exits[0]),
    exits,
    label: pressure < 0.5 ? "forgiving" : pressure < 0.8 ? "balanced" : pressure <= 1.1 ? "pressured" : "severe",
  };
}
