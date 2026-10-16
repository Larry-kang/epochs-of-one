import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, runLife, pendingOffers, decisionQuote, applyAction, MORTGAGE_TERMS, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { Action, LifeState } from '../../src/engine/life/state.ts';
import { contentEvents, EVENTS } from '../../src/engine/content/registry.ts';
import { beats, ranks, summarize } from '../../src/engine/life/companions.ts';
import { lifetimeGuard } from '../../src/engine/calWealth.ts';
import { ending } from '../../src/engine/life/ending.ts';
import { PARAMS } from '../../src/engine/params.ts';

const data = loadBundleFromDisk();
const cfg = (iso: string, year: number, seed: string, q: 1 | 2 | 3 | 4 | 5 = 3): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't',
  constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'fixed', value: q }, urban: { kind: 'fixed', value: true } } });
const run = (c: LifeConfig, acts: Action[] = []) => { const s = runLife(data, c, contentEvents, acts); if ('infeasible' in s) throw new Error('infeasible'); return s; };

describe('P0-1 wealth guard (population/median)', () => {
  it('TWN/USA/IND 1980: among adults, median NW/lifetime income ≤ 1 and share > 3× ≤ 2 %', () => {
    for (const iso of ['TWN', 'USA', 'IND']) {
      const g = lifetimeGuard(data, iso, 1980, 400);
      expect(g.adults).toBeGreaterThan(300);
      expect(g.median).toBeLessThanOrEqual(1);
      expect(g.over3).toBeLessThanOrEqual(0.02);
    }
  }, 120_000);
});

describe('P0-2 income curve', () => {
  const uni: Action[] = [15, 16, 17, 18, 19].flatMap((a) => [{ t: 'choice', age: a, id: 'hs', opt: 'academic' }, { t: 'choice', age: a, id: 'uni', opt: 'uni' }] as Action[]);
  const grad: Action[] = [21, 22, 23].map((a) => ({ t: 'choice', age: a, id: 'grad', opt: 'work' }) as Action);
  it('TWN university graduate: full-time work starts ≈ 22, no full-time pay before', () => {
    let n = 0;
    for (let i = 0; i < 30; i++) {
      const s = run(cfg('TWN', 1995, 'tw-uni-' + i, 4), [...uni, ...grad]);
      if (s.death!.age < 30 || s.career.plan !== 'tertiary') continue;
      n++;
      const first = s.years.find((y) => y.inLabor)!;
      expect(first.age).toBeGreaterThanOrEqual(21);
      expect(first.age).toBeLessThanOrEqual(23);
      for (const y of s.years.filter((r) => r.age < first.age)) expect(y.inLabor).toBe(false);
    }
    expect(n).toBeGreaterThan(10);
  });
  it('unemployed years pay a benefit fraction of the last wage, or 0 where there is no scheme', () => {
    let seen = 0;
    for (let i = 0; i < 200 && seen < 20; i++) {
      const s = run(cfg(i % 2 ? 'USA' : 'IND', 1970, 'unemp-' + i));
      for (let k = 1; k < s.years.length; k++) {
        const y = s.years[k]!;
        if (!y.unemployed || !y.inLabor || y.age >= 60) continue;
        seen++;
        const prev = s.years[k - 1]!;
        if (!prev.unemployed && prev.inLabor) expect(y.income).toBeLessThanOrEqual(prev.income * (PARAMS.benefitRate.value + 0.05) + 1);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });
  it('a promotion raises the career multiplier by ≥ 0.8 × promoStep', () => {
    let hits = 0;
    for (let i = 0; i < 40 && hits < 5; i++) {
      let s = newLife(data, cfg('USA', 1970, 'promo-' + i)) as LifeState;
      while (!s.death && s.age < 60) {
        const m0 = s.career.mult; s = advanceYear(data, s, contentEvents);
        if (s.years.at(-1)!.eventIds.includes('promotion')) { hits++; expect(s.career.mult / m0).toBeGreaterThanOrEqual(1 + 0.8 * PARAMS.promoStep.value - 1e-9); }
      }
    }
    expect(hits).toBeGreaterThan(0);
  });
});

describe('P0-3 choices', () => {
  it('pending offers appear in 15–25 and answering is deterministic on replay', () => {
    let s = newLife(data, cfg('TWN', 2000, 'choice-1')) as LifeState; const acts: Action[] = []; const ids = new Set<string>();
    while (!s.death && s.age < 30) {
      for (const o of pendingOffers(data, s)) { ids.add(o.id); const a: Action = { t: 'choice', age: s.age, id: o.id, opt: o.opts.at(-1)! }; acts.push(a); s = applyAction(data, s, a); }
      s = advanceYear(data, s, contentEvents);
    }
    expect(ids.has('career')).toBe(true);
    const r = run(cfg('TWN', 2000, 'choice-1'), acts);
    expect(r.years.slice(0, s.years.length).map((y) => y.netWorth)).toEqual(s.years.map((y) => y.netWorth));
  });
});

describe('P1-4 events, ending, family', () => {
  it('cooldowns: no event repeats within its cooldown (cd 0 → once per life)', () => {
    const cd = new Map(EVENTS.map((e) => [e.id, e.cd]));
    for (let i = 0; i < 150; i++) {
      const s = run(cfg('JPN', 1960, 'cd-' + i)); const last = new Map<string, number>();
      for (const e of s.events) {
        const c = cd.get(e.id); if (c === undefined) continue;
        const p = last.get(e.id);
        if (p !== undefined) { expect(c, e.id).toBeGreaterThan(0); expect(e.age - p, e.id).toBeGreaterThanOrEqual(c); }
        last.set(e.id, e.age);
      }
      const perYear = new Map<number, number>();
      for (const e of s.events) if (cd.has(e.id)) perYear.set(e.age, (perYear.get(e.age) ?? 0) + 1);
      for (const v of perYear.values()) expect(v).toBeLessThanOrEqual(2);
    }
  });
  it('illness always costs money (> 0)', () => {
    let n = 0;
    for (let i = 0; i < 200; i++) for (const e of run(cfg('USA', 1960, 'ill-' + i)).events) if (e.id === 'illness') { n++; expect(Number(e.vars!.cost)).toBeGreaterThan(0); }
    expect(n).toBeGreaterThan(5);
  });
  it('every life has a name and family; ending has cause + last words', () => {
    const s = run(cfg('TWN', 1980, 'end-1'));
    expect(s.name.full.length).toBeGreaterThan(1);
    expect(s.family.mother.name.length).toBeGreaterThan(0);
    const e = ending(s, 30000);
    for (let i = 0; i < 150; i++) { const k = run(cfg('TWN', 1980, 'kids-' + i)).family.children.map((c) => c.name); expect(new Set(k).size, k.join()).toBe(k.length); }
    expect(e.cause.length).toBeGreaterThan(0); expect(e.lastWords.length).toBeGreaterThan(0);
  });
});

describe('Bugs: percentile', () => {
  it('beats counts strictly below (ties are not "beaten"); a $0 child death gets no money rank', () => {
    expect(beats([0, 0, 0, 5], 0)).toBe(0);
    const peers = [{ lifespan: 70, lifetimeIncome: 1e6, finalNetWorth: 1e5 }, { lifespan: 3, lifetimeIncome: 0, finalNetWorth: 0 }];
    const r = ranks({ lifespan: 4, lifetimeIncome: 0, finalNetWorth: 0 }, peers);
    expect(r.finalNetWorth).toBeNull(); expect(r.lifetimeIncome).toBeNull();
    expect(r.lifespan).toBe(0.5);
    const s = run(cfg('TWN', 1980, 'end-1')); expect(summarize(s).finalNetWorth).toBe(s.years.at(-1)!.netWorth);
  });
});

describe('P1-5 finance screens', () => {
  it('mortgage offers 20/30/40-year terms with required income and down payment', () => {
    expect([...MORTGAGE_TERMS]).toEqual([20, 30, 40]);
    let s = newLife(data, cfg('TWN', 1975, 'house-tw', 4)) as LifeState;
    while (!s.death && s.age < 35) s = advanceYear(data, s, contentEvents);
    const q30 = decisionQuote(data, s, 30).house, q40 = decisionQuote(data, s, 40).house;
    expect(q30.needDown).toBeGreaterThan(0);
    expect(q40.needIncome).toBeLessThan(q30.needIncome);
  });
  it('no dev strings in UI copy', () => {
    const ui = readFileSync('src/content/i18n/table.json', 'utf8');
    for (const bad of ['§', 'DBR22', '総量規制', 'TDSR', 'MSR']) expect(ui.includes(bad), bad).toBe(false);
  });
});
