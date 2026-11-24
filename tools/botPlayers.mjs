// Headless "players" for pacing and balance checks. A bot only does what a
// human can: it reads stream state (queue, pressure) and issues signal / tow
// / diversion commands through the session. Phases are lists of signal groups opened
// together; the bot opens one phase at a time with an all-red gap between
// phases, so an exclusive bot never causes incidents by itself.
import { readFileSync } from "node:fs";
import { TrafficSession } from "../scripts/traffic/session/TrafficSession.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), "utf8"));
export const gameConfig = read("game-config.json");
export const loadLevel = (file) => read(`levels/${file}`);

const GAP = 3.5; // seconds all-red between phases (yellow 2s + clearance)

export function makeBot(kind, phases, opts = {}) {
  const st = { cur: -1, since: 0, gapUntil: 0, next: null, nextCheck: 0 };
  const queueOf = (s, phase) => s.streams.streams.filter((x) => phase.includes(x.groupId)).reduce((a, x) => a + x.queue, 0);
  const pressureOf = (s, phase) => Math.max(0, ...s.streams.streams.filter((x) => phase.includes(x.groupId)).map((x) => x.pressure));
  const open = (s, i) => {
    for (const g of phases.flat()) s.setSignal(g, phases[i].includes(g));
    st.cur = i;
    st.since = s.time;
  };
  const closeAll = (s) => {
    for (const g of phases.flat()) s.setSignal(g, false);
    st.cur = -1;
  };
  return (s) => {
    const t = s.time;
    if (kind === "reckless") {
      if (st.cur < 0) {
        for (const g of phases.flat()) s.setSignal(g, true);
        st.cur = 0;
      }
      return;
    }
    if (kind === "idle") return;
    if (t < st.nextCheck) return;
    st.nextCheck = t + 0.5;
    if (st.cur === -1 && t >= st.gapUntil) return open(s, st.next ?? 0);
    if (st.cur === -1) return;
    const held = t - st.since;
    const others = phases.map((_, i) => i).filter((i) => i !== st.cur);
    let switchTo = null;
    if (kind === "fixed") {
      if (held >= (opts.cycle ?? 12)) switchTo = (st.cur + 1) % phases.length;
    } else if (kind === "greedy") {
      const cq = queueOf(s, phases[st.cur]);
      const best = others.sort((a, b) => queueOf(s, phases[b]) - queueOf(s, phases[a]))[0];
      const bq = queueOf(s, phases[best]);
      if ((cq === 0 && bq > 0 && held >= 4) || (bq > cq * 2 + 3 && held >= 8)) switchTo = best;
    } else if (kind === "charger") {
      // Hold the other lines to build a big queue; release when it is worth it, or when it is getting dangerous.
      const cq = queueOf(s, phases[st.cur]);
      const target = opts.target ?? 0.4;
      let best = null;
      for (const i of others) {
        const streams = s.streams.streams.filter((x) => phases[i].includes(x.groupId));
        const ready = streams.some((x) => x.queue >= Math.max(3, Math.ceil(x.capacity * target)) || x.pressure >= (opts.danger ?? 0.55));
        if (ready && (best === null || queueOf(s, phases[i]) > queueOf(s, phases[best]))) best = i;
      }
      if (best !== null && held >= 6 && cq <= 1) switchTo = best;
      else if (best !== null && held >= 14) switchTo = best;
      else if (cq === 0 && held >= 6 && others.some((i) => queueOf(s, phases[i]) > 0) && best === null && held >= 20) switchTo = others[0];
    }
    if (switchTo !== null) {
      closeAll(s);
      st.next = switchTo;
      st.gapUntil = t + GAP;
    }
  };
}

// Tows any incident that has been active for `after` seconds, if affordable (the human "spend to recover" move).
export function withTow(bot, after = 2) {
  return (s) => {
    bot(s);
    for (const e of s.interventions.obstacleHelper.entities) {
      const o = e.getComponent("ObstacleComponent");
      if (o.active && !o.towed && s.time - o.createdAt >= after && !s.interventions.refusal("tow", e.id)) s.intervene("tow", e.id);
    }
  };
}

// Signs traffic round any incident that has been active for `after` seconds, when a
// diversion is free (the free "route round it" move; lifts itself when it clears).
export function withDivert(bot, after = 2) {
  return (s) => {
    bot(s);
    for (const e of s.diversions.obstacles.entities) {
      const o = e.getComponent("ObstacleComponent");
      if (o.active && !o.towed && s.time - o.createdAt >= after && !s.diversions.isDiverted(e.id) && !s.diversions.refusal(`incident:${e.id}`)) s.divertAround(e.id);
    }
  };
}

export function play(level, bot, { seed, demandScale = 1, maxSeconds = 1500 } = {}) {
  const s = TrafficSession.create(structuredClone(level), structuredClone(gameConfig), { seed, demandScale });
  const max = maxSeconds * s.sim.tickRate;
  for (let i = 0; i < max && s.sim.status === "running"; i++) {
    bot(s);
    s.tick();
  }
  s.dispose();
  return s.summary();
}
