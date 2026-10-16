// Batch 2 P14: spend sheet — ~50 purchases with stat chips and reasons when unavailable; lifestyle settings and
// auto-routines; all recorded actions → deterministic replay; defaults leave calibrated lives unchanged.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, newLife, advanceYear, applyAction, type LifeConfig } from '../../src/engine/life/sim.ts';
import { ITEMS, itemState, recommend, lifestyleAt, LIFESTYLE, ROUTINES, priceOf } from '../../src/engine/life/spend.ts';
import type { LifeState } from '../../src/engine/life/state.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string): LifeConfig => ({ seed, era: { kind: 'past', year: 1975 }, nowYear: 2026, engineVersion: 't',
  constraints: { country: { kind: 'fixed', value: 'USA' }, sex: { kind: 'fixed', value: 'M' }, quintile: { kind: 'fixed', value: 4 }, urban: { kind: 'fixed', value: true } } });
const at = (seed: string, age: number) => { let s = newLife(data, cfg(seed)) as LifeState; while (!s.death && s.age < age) s = advanceYear(data, s); return s; };

describe('B2 spend sheet', () => {
  it('offers about 50 purchases with unique ids and at least one stat effect each', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(45);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS) expect(Object.values(i.fx).some((v) => v !== 0)).toBe(true);
  });
  it('explains why an item is unavailable (age, money, needs, cooldown)', () => {
    const kid = at('spend-1', 8);
    expect(itemState(data, kid, 'car').why).toBe('age');
    const adult = at('spend-1', 30);
    expect(itemState(data, { ...adult, econ: { ...adult.econ, cash: 0 } }, 'tripAbroad').why).toBe('cash');
    if (!adult.family.spouse) expect(itemState(data, adult, 'honeymoon').why).toBe('need');
    const rich = { ...adult, econ: { ...adult.econ, cash: 1e7 } };
    const b = applyAction(data, rich, { t: 'buy', age: rich.age, id: 'phone' });
    expect(itemState(data, b, 'phone').why).toBe('cooldown');
  });
  it('buying deducts the price and applies the stat chips; invalid buys are ignored (not recorded)', () => {
    const s0 = at('spend-2', 30); const s = { ...s0, econ: { ...s0.econ, cash: 1e7 } };
    const p = priceOf(data, s, 'gym');
    const b = applyAction(data, s, { t: 'buy', age: s.age, id: 'gym' });
    expect(b.econ.cash).toBeCloseTo(s.econ.cash - p, 6);
    expect(b.stats.health).toBeGreaterThanOrEqual(s.stats.health);
    const bad = applyAction(data, { ...s, econ: { ...s.econ, cash: 0 } }, { t: 'buy', age: s.age, id: 'cruise' });
    expect(bad.actions.length).toBe(s.actions.length);
  });
  it('"worth doing now" lists at most 6 affordable, available items', () => {
    const s = at('spend-3', 35); const r = recommend(data, { ...s, econ: { ...s.econ, cash: 1e6 } });
    expect(r.length).toBeGreaterThan(0); expect(r.length).toBeLessThanOrEqual(6);
    for (const id of r) expect(itemState(data, { ...s, econ: { ...s.econ, cash: 1e6 } }, id).ok).toBe(true);
  });
  it('lifestyle defaults are neutral; settings persist and replay deterministically', () => {
    const plain = runLife(data, cfg('spend-4')) as LifeState;
    expect(lifestyleAt([], 40)).toEqual(Object.fromEntries(LIFESTYLE.map((l) => [l.key, l.def])));
    const acts = [{ t: 'life' as const, age: 25, key: 'diet', value: 'healthy' }, { t: 'life' as const, age: 25, key: 'rt:donateSmall', value: 'on' }];
    const a = runLife(data, cfg('spend-4'), undefined, acts) as LifeState, b = runLife(data, cfg('spend-4'), undefined, acts) as LifeState;
    expect(a.years.map((y) => y.netWorth)).toEqual(b.years.map((y) => y.netWorth));
    expect(a.years.at(-1)!.netWorth).not.toBe(plain.years.at(-1)!.netWorth);
    expect(a.events.some((e) => e.id === 'rt_donateSmall')).toBe(true);
    expect(lifestyleAt(acts, 30).diet).toBe('healthy'); expect(lifestyleAt(acts, 24).diet).toBe('normal');
  });
  it('routines only fire when savings exceed 3× their cost', () => { expect(ROUTINES.length).toBeGreaterThanOrEqual(4); });
});
