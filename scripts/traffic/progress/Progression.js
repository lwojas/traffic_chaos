import { MEDAL_ORDER, rateRun, nextTargets } from "./rating.js";

const KEY = "traffic.progress.v1";
const rank = (m) => MEDAL_ORDER.indexOf(m); // -1 for none

// Which maps are open and what medal each has earned. Pure bookkeeping over an
// injected storage ({ getItem, setItem }, e.g. localStorage): no Phaser, no
// ECS, no DOM. Unlock rules live in the level JSON (`progression.unlock`):
//   { "after": "first_junction", "medal": "bronze" }  (medal defaults to bronze)
// A level without a rule is always open.
export class Progression {
  constructor(storage = null) {
    this.storage = storage;
    this.data = { medals: {}, best: {} };
    try {
      const raw = storage?.getItem(KEY);
      if (raw) this.data = { medals: {}, best: {}, ...JSON.parse(raw) };
    } catch {
      /* private mode or corrupt data: start fresh */
    }
  }

  medal(levelId) {
    return this.data.medals[levelId] ?? null;
  }

  best(levelId) {
    return this.data.best[levelId] ?? null;
  }

  save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable: progress lasts for this session only */
    }
  }

  // metas: [{ id, progression?: { unlock? } }]
  isUnlocked(meta) {
    const u = meta.progression?.unlock;
    if (!u) return true;
    return rank(this.medal(u.after)) >= rank(u.medal ?? "bronze");
  }

  unlockedIds(metas) {
    return new Set(metas.filter((m) => this.isUnlocked(m)).map((m) => m.id));
  }

  // Rates a finished run, stores any improvement and reports what it opened.
  record(meta, summary, metas) {
    const before = this.unlockedIds(metas);
    const medal = rateRun(summary, meta.ratings);
    const previous = this.medal(meta.id);
    if (rank(medal) > rank(previous)) this.data.medals[meta.id] = medal;
    const best = this.data.best[meta.id];
    if (!best || summary.earned > best.earned) this.data.best[meta.id] = { earned: Math.round(summary.earned), time: Math.round(summary.time), avgSatisfaction: Math.round(summary.avgSatisfaction * 100) / 100 };
    this.save();
    const after = this.unlockedIds(metas);
    return {
      levelId: meta.id,
      medal,
      previous,
      improved: rank(medal) > rank(previous),
      next: nextTargets(summary, meta.ratings, this.medal(meta.id)),
      unlocked: metas.filter((m) => after.has(m.id) && !before.has(m.id)),
    };
  }

  // Everything a level-select screen needs.
  list(metas) {
    return metas.map((m) => ({ id: m.id, name: m.name, blurb: m.progression?.blurb ?? "", unlocked: this.isUnlocked(m), medal: this.medal(m.id), requires: m.progression?.unlock ?? null }));
  }
}
