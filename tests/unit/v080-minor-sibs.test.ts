// v0.8.0 rc fixes: (1) a minor's savings never go negative and spending under 18 is capped at own savings + parents' allowance;
// (2) siblings come from the PARENTS' fertility (WPP period TFR over the mother's childbearing years).
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, applyAction, runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { budget, parentsAllowance, itemState, priceOf, ITEMS } from '../../src/engine/life/spend.ts';
import { parentsTfr, siblingMeanTfr } from '../../src/engine/life/family.ts';
import { wppAt } from '../../src/engine/life/fertility.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string, iso = 'TWN', year = 1990, auto = false): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't', ...(auto ? { autoFocus: true, autoSpend: true } : {}),
  constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });

describe('minor savings', () => {
  it('cash is never negative before 18 (yearly rows and state), with and without auto', () => {
    for (let i = 0; i < 40; i++) for (const auto of [false, true]) {
      const s = runLife(data, cfg(`minor-${i}`, i % 2 ? 'TWN' : 'IND', 1990, auto), registry) as LifeState;
      for (const y of s.years) if (y.age < 18) expect(y.cash).toBeGreaterThanOrEqual(0);
    }
  });
  it('spending under 18 is capped at own savings + the parents\' allowance, and never drives cash below 0', () => {
    let s = newLife(data, cfg('minor-buy')) as LifeState; while (s.age < 16) s = advanceYear(data, s, registry);
    if (s.death) return;
    const broke = { ...s, econ: { ...s.econ, cash: 0 } };
    const allow = parentsAllowance(data, broke); expect(allow).toBeGreaterThan(0);
    expect(budget(data, broke)).toBe(allow);
    let cur = broke;
    for (let k = 0; k < 30; k++) {
      const it = ITEMS.find((i) => i.price > 0 && itemState(data, cur, i.id).ok); if (!it) break;
      expect(priceOf(data, cur, it.id)).toBeLessThanOrEqual(budget(data, cur));
      cur = applyAction(data, cur, { t: 'buy', age: cur.age, id: it.id });
      expect(cur.econ.cash).toBeGreaterThanOrEqual(0);
    }
    expect(budget(data, cur)).toBeLessThan(allow + 1);
    expect(itemState(data, cur, 'tripAbroad').ok).toBe(false);
    // adults have no allowance
    expect(parentsAllowance(data, { ...broke, age: 20 })).toBe(0);
  });
});

describe('siblings from the parents\' cohort fertility', () => {
  it('mean siblings matches WPP TFR of the mother\'s childbearing years (TWN 1990, IND 1990, KOR 1960)', () => {
    for (const [iso, year] of [['TWN', 1990], ['IND', 1990], ['KOR', 1960]] as const) {
      const N = 500; let k = 0, want = 0;
      for (let i = 0; i < N; i++) {
        const s = newLife(data, cfg(`sib-${iso}-${i}`, iso, year)) as LifeState;
        k += s.family.siblings.length;
        want += siblingMeanTfr(parentsTfr((y) => wppAt(data.wpp, 'tfr', iso, y), s.family.mother.born)!);
      }
      const mean = k / N, exp = want / N;
      expect(Math.abs(mean - exp)).toBeLessThan(0.15 + 0.08 * exp);
    }
  });
  it('uses the parents\' years, not the child\'s: KOR 1960 has many more siblings than KOR 2000', () => {
    const m = (year: number) => { let k = 0; for (let i = 0; i < 300; i++) k += (newLife(data, cfg(`sibk-${i}`, 'KOR', year)) as LifeState).family.siblings.length; return k / 300; };
    expect(m(1960)).toBeGreaterThan(m(2000) + 1.5);
  });
});
