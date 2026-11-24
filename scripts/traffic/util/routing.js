// Detour planning for diversions. Pure: works on lane/connector entities (their
// LaneComponent topology) and knows nothing about vehicles, signals or queues.
//
// A detour is chosen by ROAD LENGTH ONLY, never by congestion, so it is the
// signed diversion a driver would follow, not a smart route around a jam. Ties go
// to the lower id, which keeps runs deterministic.
//
// The graph: an approach/link lane leads to every connector that starts on it;
// a connector leads to its exit lane. Moving onto a node costs its length.
export class RoadGraph {
  constructor(laneEntities) {
    const byId = new Map(laneEntities.map((e) => [e.id, e]));
    this.nodes = [...laneEntities].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.index = new Map(this.nodes.map((e, i) => [e, i]));
    this.next = this.nodes.map(() => []);
    for (const e of this.nodes) {
      const c = e.components.LaneComponent;
      if (c.kind !== "connector") continue;
      const from = byId.get(c.fromId);
      const to = byId.get(c.toId);
      if (from) this.next[this.index.get(from)].push(this.index.get(e));
      if (to) this.next[this.index.get(e)].push(this.index.get(to));
    }
    for (const list of this.next) list.sort((a, b) => a - b);
    this.length = this.nodes.map((e) => e.components.LaneComponent.length);
  }

  // Path from `fromNodes` (candidates, in order of preference) round the
  // `closed` connectors (a Set of entities). Returns the full node list from the
  // chosen start node, or null if there is no open way out.
  //
  // First choice: back onto the authored `route` at a point from which the rest
  // of it is open, then along it (a car goes round the closure and back onto its
  // road). Only when no such way exists does it take the nearest open lane in
  // `exits` (any exit pays the same).
  plan(fromNodes, route, closed, exits) {
    // The route is open from index `openFrom` to its end
    let openFrom = 0;
    for (let i = 0; i < route.length; i++) if (closed.has(route[i])) openFrom = i + 1;
    // Remaining cost of the route from each rejoin point (excluding the rejoin node itself)
    const rejoin = new Map();
    let tail = 0;
    for (let i = route.length - 1; i >= openFrom; i--) {
      rejoin.set(this.index.get(route[i]), { at: i, tail });
      tail += this.length[this.index.get(route[i])];
    }
    // Already on the open part of its own route: stay on it
    const own = rejoin.get(this.index.get(fromNodes[0]));
    if (own) return route.slice(own.at);

    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    for (const start of fromNodes) {
      const i = this.index.get(start);
      if (i !== undefined && !closed.has(start) && dist[i] === Infinity) dist[i] = 0;
    }
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = 1;
      for (const v of this.next[u]) {
        if (done[v] || closed.has(this.nodes[v])) continue;
        const d = dist[u] + this.length[v];
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    // Ties go to the lower node index (the lower id)
    let best = -1;
    let bestCost = Infinity;
    for (const [i, r] of rejoin) if (dist[i] + r.tail < bestCost || (dist[i] + r.tail === bestCost && i < best)) [best, bestCost] = [i, dist[i] + r.tail];
    let rest = best >= 0 ? route.slice(rejoin.get(best).at + 1) : [];
    if (best < 0) {
      for (const e of exits ?? []) {
        const i = this.index.get(e);
        if (dist[i] < bestCost || (dist[i] === bestCost && i < best)) [best, bestCost] = [i, dist[i]];
      }
      rest = [];
    }
    if (best < 0) return null;
    const head = [];
    for (let i = best; i >= 0; i = prev[i]) head.push(this.nodes[i]);
    head.reverse();
    return head.concat(rest);
  }
}

// True when any step of `steps` from index `from` on is a closed connector.
export function crossesClosure(steps, from, closed) {
  for (let i = from; i < steps.length; i++) if (closed.has(steps[i])) return true;
  return false;
}
