// Performance rating for a finished run. Pure: level thresholds + a session
// summary in, medal out. A medal needs EVERY requirement listed for it, and a
// higher medal is only awarded if its own requirements are met.
//   ratings: { bronze: { time, score, maxIncidents }, silver: {...}, gold: {...} }
export const MEDAL_ORDER = ["bronze", "silver", "gold"];

export function meets(summary, req) {
  if (req.time !== undefined && summary.time < req.time) return false;
  if (req.score !== undefined && summary.score < req.score) return false;
  if (req.maxIncidents !== undefined && summary.incidents > req.maxIncidents) return false;
  return true;
}

// Best medal earned, or null. A completed shift is never worse than bronze.
export function rateRun(summary, ratings = {}) {
  let best = null;
  for (const m of MEDAL_ORDER) if (ratings[m] && meets(summary, ratings[m])) best = m;
  if (!best && summary.status === "complete" && ratings.bronze) best = "bronze";
  return best;
}

// What is still missing for the next medal: [{ key, need, have }] (for the result card).
export function nextTargets(summary, ratings = {}, current = null) {
  const next = MEDAL_ORDER[MEDAL_ORDER.indexOf(current) + 1];
  const req = next && ratings[next];
  if (!req) return { medal: null, missing: [] };
  const missing = [];
  if (req.time !== undefined && summary.time < req.time) missing.push({ key: "time", need: req.time, have: summary.time });
  if (req.score !== undefined && summary.score < req.score) missing.push({ key: "score", need: req.score, have: summary.score });
  if (req.maxIncidents !== undefined && summary.incidents > req.maxIncidents) missing.push({ key: "incidents", need: req.maxIncidents, have: summary.incidents });
  return { medal: next, missing };
}
