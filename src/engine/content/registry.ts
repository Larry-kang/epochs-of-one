// Event registry (M3): 10 originally-written events. Conditions/weights/effects only — no text.
// Text lives in src/content/zh-TW/events.json keyed by id. Probabilities are game-design content
// (tuning for pacing), not empirical parameters; they never affect mortality (calibration stays intact).
import type { EventCtx, EventOut, EventSystem } from '../life/events.ts';
import { stream } from '../rng/streams.ts';

export interface EventDef {
  id: string;
  /** base annual probability when eligible (design) */
  p: number | ((c: EventCtx) => number);
  when: (c: EventCtx) => boolean;
  apply: (c: EventCtx, o: EventOut, r: () => number) => Record<string, number | string> | void;
}

const n = (c: EventCtx, k: string) => Number(c.flags[k] ?? 0);

export const EVENTS: EventDef[] = [
  { id: 'study_prize', p: 0.12, when: (c) => c.age >= 7 && c.age <= 18 && c.stats.smart >= 60,
    apply: (_c, o) => { o.stats.smart += 4; o.stats.happy += 4; } },
  { id: 'first_paycheck', p: 1, when: (c) => c.inLabor && !c.unemployed && c.income > 0 && !c.flags.firstJob,
    apply: (c, o) => { o.flags.firstJob = c.age; o.stats.happy += 5; return { amount: Math.round(c.income) }; } },
  { id: 'jobless_year', p: 1, when: (c) => c.inLabor && c.unemployed,
    apply: (_c, o) => { o.stats.happy -= 8; o.stats.social -= 2; } },
  { id: 'promotion', p: (c) => 0.04 + c.stats.smart / 2000, when: (c) => c.inLabor && !c.unemployed && c.age >= 24 && c.age <= 58,
    apply: (_c, o) => { o.pct = Math.min(0.995, o.pct + 0.03); o.stats.happy += 5; } },
  { id: 'illness', p: (c) => (c.stats.health < 40 ? 0.12 : 0.04), when: (c) => c.age >= 3,
    apply: (c, o, r) => { const cost = Math.round(c.meanIncome * (0.05 + 0.1 * r())); o.stats.health -= 12; o.stats.happy -= 4; o.cash -= c.age >= 18 ? cost : 0; return { cost: c.age >= 18 ? cost : 0 }; } },
  { id: 'wedding', p: (c) => 0.06 + c.stats.social / 1500, when: (c) => c.age >= 21 && c.age <= 45 && !c.flags.married,
    apply: (c, o) => { o.flags.married = c.age; o.stats.happy += 10; o.stats.social += 4; } },
  { id: 'new_child', p: 0.1, when: (c) => !!c.flags.married && c.age >= 21 && c.age <= 44 && n(c, 'children') < 3,
    apply: (c, o) => { o.flags.children = n(c, 'children') + 1; o.stats.happy += 7; o.cash -= Math.round(c.meanIncome * 0.1); return { nth: n(c, 'children') + 1 }; } },
  { id: 'windfall', p: 0.012, when: (c) => c.age >= 18,
    apply: (c, o, r) => { const amt = Math.round(c.meanIncome * (0.2 + 0.8 * r())); o.cash += amt; o.stats.happy += 4; return { amount: amt }; } },
  { id: 'friend_leaves', p: 0.05, when: (c) => c.age >= 10 && c.age <= 75,
    apply: (_c, o) => { o.stats.social -= 6; o.stats.happy -= 2; } },
  { id: 'new_hobby', p: 0.07, when: (c) => c.age >= 8 && c.age <= 80,
    apply: (_c, o) => { o.stats.happy += 6; o.stats.health += 2; } },
];

export const MAX_EVENTS_PER_YEAR = 2;

export const contentEvents: EventSystem = {
  run(c) {
    const r = stream(c.seed, 'events', c.age);
    const o: EventOut = { stats: { ...c.stats }, cash: c.cash, income: c.income, pct: c.pct, flags: { ...c.flags }, fired: [] };
    // gentle ageing drift (design): health declines after 50
    if (c.age >= 50) o.stats.health -= 1;
    for (const e of EVENTS) {
      const u = r.next(); // one draw per event per year, always consumed → stable sequences
      if (o.fired.length >= MAX_EVENTS_PER_YEAR) continue;
      const ctx = { ...c, stats: o.stats, flags: o.flags, cash: o.cash, pct: o.pct };
      if (!e.when(ctx)) continue;
      const p = typeof e.p === 'function' ? e.p(ctx) : e.p;
      if (u < p) {
        const vars = e.apply(ctx, o, () => r.next()) ?? undefined;
        o.fired.push(vars ? { id: e.id, vars } : { id: e.id });
      }
    }
    for (const k of ['health', 'happy', 'smart', 'social'] as const) o.stats[k] = Math.max(0, Math.min(100, o.stats[k]));
    return o;
  },
};

/** Engine (market/finance) events: emitted by finance systems, not drawn by the content registry; text in events.json. */
export const ENGINE_EVENT_IDS = ['marginCall', 'forcedSale', 'levClosed', 'retire', 'mortgagePaid', 'paymentMissed', 'foreclosure', 'loanPaid', 'loanDefault', 'loanRateUp'] as const;
