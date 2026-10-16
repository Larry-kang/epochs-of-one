// Batch 2 (a)/(b): children per life follow the UN WPP 2024 cohort fertility of the birth country, and the
// "talk about another child" card has a cooldown.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { cohortTfr, CHILD_COOLDOWN } from '../../src/engine/life/fertility.ts';
import type { LifeState } from '../../src/engine/life/state.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string, iso: string, year: number): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't',
  constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const lives = (iso: string, year: number, n: number) => Array.from({ length: n }, (_, i) => runLife(data, cfg(`fert-${iso}-${i}`, iso, year)))
  .filter((s): s is LifeState => 'family' in s);

describe('B2 fertility alignment with WPP 2024', () => {
  it('cohort TFR comes from the WPP layer (Taiwan 1985 is far below 2)', () => {
    expect(data.wpp).toBeDefined();
    const t = cohortTfr(data.wpp, 'TWN', 1985)!;
    expect(t).toBeGreaterThan(0.7); expect(t).toBeLessThan(1.6);
    expect(cohortTfr(data.wpp, 'NGA', 1985)!).toBeGreaterThan(4);
  });
  // mean children among lives that reach 45 (end of the fertile span) must sit within ±0.3 (or ±12% for high TFR) of the cohort TFR
  for (const [iso, year] of [['TWN', 1985], ['USA', 1985], ['NGA', 1985], ['KOR', 1990], ['IND', 1970]] as const) {
    it(`${iso} ${year}: mean children ≈ cohort TFR over 300 seeds`, () => {
      const adults = lives(iso, year, 300).filter((s) => s.age >= 45);
      const mean = adults.reduce((a, s) => a + s.family.children.length, 0) / adults.length;
      const t = cohortTfr(data.wpp, iso, year)!;
      expect(Math.abs(mean - t)).toBeLessThanOrEqual(Math.max(0.3, 0.12 * t));
    });
  }
  it('Taiwan 1985: four or more children is rare (< 5%)', () => {
    const adults = lives('TWN', 1985, 300).filter((s) => s.age >= 45);
    expect(adults.filter((s) => s.family.children.length >= 4).length / adults.length).toBeLessThan(0.05);
  });
  it(`after "not now" the child card does not come back for ${CHILD_COOLDOWN} years`, () => {
    for (const s of lives('USA', 1985, 200)) {
      const ages = s.events.filter((e) => e.id.startsWith('ch_child_')).map((e) => ({ age: e.age, id: e.id }));
      for (const [i, e] of ages.entries()) if (e.id === 'ch_child_notnow') { const nx = ages[i + 1]; if (nx) expect(nx.age - e.age).toBeGreaterThanOrEqual(CHILD_COOLDOWN); }
    }
  });
});
