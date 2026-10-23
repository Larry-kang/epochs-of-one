// L2/L3 save migration: a v0.10 occupation save (no l2 marker) replays identically up to the resume age; new lives carry l2.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
import { migrateSaveCfgL2 } from '../../src/engine/life/occupation.ts';
import { L2_OPTS } from '../../src/engine/life/conscription.ts';
const data = loadBundleFromDisk();
const base: LifeConfig = { seed: 'save-l2-3', era: { kind: 'past', year: 1985 }, nowYear: 2026, engineVersion: '0.9.1', occ: true, constraints: { country: { kind: 'fixed', value: 'TWN' as never }, sex: { kind: 'fixed', value: 'M' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } };
const play = (cfg: LifeConfig, years: number) => { let s = newLife(data, cfg) as LifeState; for (let i = 0; i < years && !s.death; i++) s = advanceYear(data, s, registry); return s; };
describe('L2 save migration', () => {
  it('pre-v0.11 saves get l2From = years played; l2 / l2From saves are untouched', () => {
    expect(migrateSaveCfgL2(base, 30)).toEqual({ ...base, l2From: 30 });
    expect(migrateSaveCfgL2({ ...base, l2: true }, 30)).toEqual({ ...base, l2: true });
  });
  it('a migrated v0.10 save replays exactly like the v0.10 engine (no conscription in the past)', () => {
    L2_OPTS.conscription = false; L2_OPTS.institutions = false; const old = play(base, 35); L2_OPTS.conscription = true; L2_OPTS.institutions = true;
    const mig = play(migrateSaveCfgL2(base, 35), 35);
    expect(mig.years.map((y) => y.income)).toEqual(old.years.map((y) => y.income));
    expect(mig.events.some((e) => e.id.startsWith('cs_'))).toBe(false);
    const fresh = play({ ...base, l2: true }, 35);
    expect(fresh.events.some((e) => e.id.startsWith('cs_'))).toBe(true);
  });
});
