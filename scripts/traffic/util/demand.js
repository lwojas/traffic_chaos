// Demand curve lookup. A curve is [{ time, rate }] in increasing time order;
// the rate is linearly interpolated, held at the first point before it and at
// the last point after it, so a level ends in sustained peak demand.
export function demandAt(curve, t) {
  const n = curve.length;
  if (t <= curve[0].time) return curve[0].rate;
  if (t >= curve[n - 1].time) return curve[n - 1].rate;
  let i = 1;
  while (curve[i].time < t) i++;
  const a = curve[i - 1];
  const b = curve[i];
  return a.rate + ((b.rate - a.rate) * (t - a.time)) / (b.time - a.time);
}
