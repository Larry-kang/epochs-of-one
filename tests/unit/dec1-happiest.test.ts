// Item 1: the happiest year is chosen by happiness gain and major life events, never by routine spending.
import { describe, it, expect } from 'vitest';
import { pickHappiest, ending, ROUTINE_EVENT } from '../../src/engine/life/ending.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';
import type { LifeState } from '../../src/engine/life/state.ts';

const y = (age: number, happy: number, eventIds: string[]) => ({ age, calYear: 2000 + age, stats: { happy }, eventIds });

describe('pickHappiest rules', () => {
  it('prefers a wedding year over a routine year at the happiness cap', () => {
    const h = pickHappiest([y(29, 80, []), y(30, 90, ['ch_marry_marry']), y(49, 98, []), y(50, 100, ['rt_checkup', 'rt_allowance'])]);
    expect(h?.age).toBe(30);
    expect(h?.eventId).toBe('ch_marry_marry');
  });
  it('never captions a year with a routine or hardship event', () => {
    expect(pickHappiest([y(40, 50, []), y(41, 70, ['rt_checkup'])])?.eventId).toBeUndefined();
    expect(pickHappiest([y(40, 50, []), y(41, 70, ['illness', 'fl_gym'])])?.eventId).toBeUndefined();
    expect(pickHappiest([y(40, 50, []), y(41, 70, ['rt_gym', 'fl_concert'])])?.eventId).toBe('fl_concert');
  });
  it('ignores the first years of life', () => {
    expect(pickHappiest([y(1, 100, ['fl_first_steps']), y(3, 40, []), y(4, 45, ['fl_kindergarten'])])?.age).toBe(4);
  });
});

describe('weekly-playtest style sample (10 lives, auto mode)', () => {
  it('routine spending never wins the happiest year', () => {
    const data = loadBundleFromDisk();
    let n = 0;
    for (const iso of ['TWN', 'USA', 'JPN', 'KOR', 'NGA']) for (let i = 0; i < 2; i++) {
      const cfg: LifeConfig = { seed: `dec1-${iso}-${i}`, era: { kind: 'now' }, nowYear: 2026, engineVersion: 't', occ: true, autoFocus: true, autoSpend: true,
        constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } };
      const s = runLife(data, cfg, contentEvents) as LifeState;
      if ('infeasible' in s || s.death!.age < 18) continue;
      const h = ending(s, 30000).happiest!;
      n++;
      if (h.eventId) expect(h.eventId).not.toMatch(ROUTINE_EVENT);
      const row = s.years.find((r) => r.age === h.age)!;
      expect(row.eventIds.some((e) => !ROUTINE_EVENT.test(e))).toBe(true);
    }
    expect(n).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
