// v0.8.0 SPEND: owned items with age + money thresholds (and selling), spending with cooldowns, situation sort,
// relationship effects, auto-habits under auto-choice — economy stays MC-calibrated, mortality untouched.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, newLife, advanceYear, applyAction, type LifeConfig } from '../../src/engine/life/sim.ts';
import { ITEMS, itemById, itemState, priceOf, sellState, situationSort, owned, SPEND_CATS, AUTO_HABITS, autoHabits, spendOpen } from '../../src/engine/life/spend.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string, auto = false): LifeConfig => ({ seed, era: { kind: 'past', year: 1970 }, nowYear: 2026, engineVersion: 't', ...(auto ? { autoFocus: true, autoSpend: true } : {}),
  constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
/** first seed variant that is alive at `age` (some lives end in infancy) */
const at = (seed: string, age: number): LifeState => {
  for (let k = 0; ; k++) { let s = newLife(data, cfg(`${seed}-${k}`)) as LifeState; while (!s.death && s.age < age) s = advanceYear(data, s, registry); if (!s.death) return s; }
};
const rich = (s: LifeState) => ({ ...s, econ: { ...s.econ, cash: 1e8 } });

describe('v0.8.0 spend catalogue', () => {
  it('has the five owned items and the eight spending kinds', () => {
    for (const id of ['phone', 'laptop', 'motorbike', 'car', 'house']) expect(itemById(id)?.kind).toBe('item');
    for (const id of ['dining', 'tripHome', 'tripAbroad', 'gift', 'allowance', 'checkup', 'onlineCourse', 'donateSmall']) { const i = itemById(id)!; expect(i.kind).toBe('spend'); expect(i.cd).toBeGreaterThan(0); }
    expect(SPEND_CATS.length).toBeGreaterThanOrEqual(5);
  });
  it('the entry opens from age 15', () => { expect(spendOpen(14)).toBe(false); expect(spendOpen(15)).toBe(true); });
  it('items need age AND a money threshold above the bare price', () => {
    const s = at('sp-a', 30); const p = priceOf(data, s, 'car');
    expect(itemState(data, at('sp-a', 16), 'car').why).toBe('age');
    expect(itemState(data, { ...s, econ: { ...s.econ, cash: p * 1.01 } }, 'car').why).toBe('cash');
    expect(itemState(data, rich(s), 'car').ok).toBe(true);
  });
  it('owned items can be sold for part of the price; selling is recorded', () => {
    const s = rich(at('sp-b', 30)); const b = applyAction(data, s, { t: 'buy', age: s.age, id: 'car' });
    expect(owned(b, 'car')).toBe(true);
    const st = sellState(data, b, 'car'); expect(st.ok).toBe(true); expect(st.value).toBeGreaterThan(0); expect(st.value).toBeLessThan(priceOf(data, b, 'car'));
    const c = applyAction(data, b, { t: 'sell', age: b.age, id: 'car' });
    expect(owned(c, 'car')).toBe(false); expect(c.econ.cash).toBeCloseTo(b.econ.cash + st.value, 6);
    expect(applyAction(data, c, { t: 'sell', age: c.age, id: 'car' }).actions.length).toBe(c.actions.length);
  });
  it('spending items have cooldowns', () => {
    const s = rich(at('sp-c', 30)); const b = applyAction(data, s, { t: 'buy', age: s.age, id: 'tripAbroad' });
    expect(itemState(data, b, 'tripAbroad').why).toBe('cooldown');
  });
  it('relationship effects: allowance and gifts raise the family bond', () => {
    const s = rich(at('sp-d', 30));
    if (s.family.parentsAlive) { const b = applyAction(data, s, { t: 'buy', age: s.age, id: 'allowance' }); expect(Number(b.flags.bond ?? 50)).toBeGreaterThan(Number(s.flags.bond ?? 50)); }
    const g = applyAction(data, s, { t: 'buy', age: s.age, id: 'gift' }); expect(Number(g.flags.bond ?? 50)).toBeGreaterThan(Number(s.flags.bond ?? 50));
  });
});

describe('v0.8.0 situation sort', () => {
  it('allowance to parents comes first when a parent is 70+', () => {
    const s = rich(at('sp-e', 30)); const old = { ...s, family: { ...s.family, parentsAlive: true, mother: { ...s.family.mother, born: s.born.year + s.age - 72 } } };
    expect(situationSort(data, old)[0]).toBe('allowance');
  });
  it('selling owned things comes first when debt is heavy; entertainment goes last', () => {
    const s0 = rich(at('sp-f', 35)); const b = applyAction(data, s0, { t: 'buy', age: s0.age, id: 'car' });
    const debt = { ...b, econ: { ...b.econ, cash: -5 * Math.max(1, b.econ.incomeReal) } };
    expect(situationSort(data, debt)[0]).toBe('sell:car');
    const order = situationSort(data, b); const fun = ITEMS.filter((i) => i.cat === 'fun').map((i) => i.id);
    const firstFun = order.findIndex((id) => fun.includes(id));
    expect(order.slice(firstFun).every((id) => fun.includes(id))).toBe(true);
  });
});

describe('v0.8.0 auto-habits and calibration', () => {
  it('auto-habits are a known list and the auto policy only picks from it', () => {
    expect(AUTO_HABITS.length).toBeGreaterThanOrEqual(5);
    const s = at('sp-g', 45); for (const id of autoHabits(s)) expect(AUTO_HABITS).toContain(id);
  });
  const N = 60;
  const off = Array.from({ length: N }, (_, i) => runLife(data, cfg(`mcs-${i}`), registry) as LifeState);
  const on = Array.from({ length: N }, (_, i) => runLife(data, cfg(`mcs-${i}`, true), registry) as LifeState);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  it('auto focus + auto spend: deaths identical, income ±8%, net worth ±25%', () => {
    expect(on.map((s) => s.death?.age)).toEqual(off.map((s) => s.death?.age));
    const ri = mean(on.map((s) => s.years.reduce((a, y) => a + y.income, 0))) / mean(off.map((s) => s.years.reduce((a, y) => a + y.income, 0)));
    const rn = mean(on.map((s) => s.years.at(-1)!.netWorth)) / mean(off.map((s) => s.years.at(-1)!.netWorth));
    expect(ri).toBeGreaterThan(0.92); expect(ri).toBeLessThan(1.08);
    expect(rn).toBeGreaterThan(0.75); expect(rn).toBeLessThan(1.25);
    expect(on.filter((s) => (s.death?.age ?? 0) >= 30).some((s) => s.events.some((e) => e.id.startsWith('rt_')))).toBe(true);
  });
});
