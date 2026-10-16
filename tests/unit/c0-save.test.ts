// C0: old (pre-v0.9.0) saves continue in the occupation system from the age they resume at; new lives & companions use it.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
import { migrateSaveCfg } from '../../src/engine/life/occupation.ts';
import { sameSecondConfigs } from '../../src/engine/life/sameSecond.ts';
const data = loadBundleFromDisk();
const base: LifeConfig = { seed: 'save-c0-1', era: { kind: 'past', year: 1975 }, nowYear: 2026, engineVersion: '0.9.1', constraints: { country: { kind: 'fixed', value: 'TWN' as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } };
const play = (cfg: LifeConfig, years: number) => { let s = newLife(data, cfg) as LifeState; for (let i = 0; i < years && !s.death; i++) s = advanceYear(data, s, registry); return s; };
describe('C0 save migration', () => {
  it('a legacy save gets occFrom = years played; new-format saves are untouched', () => {
    expect(migrateSaveCfg(base, 40)).toEqual({ ...base, occFrom: 40 });
    expect(migrateSaveCfg({ ...base, occ: true }, 40)).toEqual({ ...base, occ: true });
    expect(migrateSaveCfg({ ...base, occFrom: 30 }, 40)).toEqual({ ...base, occFrom: 30 });
  });
  it('replaying a migrated save reproduces the legacy life up to the resume point, then maps to an occupation', () => {
    const old = play(base, 40); const mig = play(migrateSaveCfg(base, 40), 40);
    expect(mig.years.map((y) => y.income)).toEqual(old.years.map((y) => y.income));
    expect(mig.age).toBe(old.age);
    let s = mig; for (let i = 0; i < 2 && !s.death; i++) s = advanceYear(data, s, registry);
    if (!s.death && s.career.trackSet) expect(s.career.occ).toBeTruthy();
  });
  it('companions inherit the occupation system', () => {
    const s = play({ ...base, occ: true }, 1);
    expect(sameSecondConfigs(s).every((c) => c.occ === true)).toBe(true);
    expect(sameSecondConfigs(play(base, 1)).every((c) => !c.occ)).toBe(true);
  });
});
