import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { sampleBirth, NO_CONSTRAINTS, type BirthConstraints } from '../../src/engine/demography/birth.ts';
import { runLife, newLife } from '../../src/engine/life/sim.ts';
import { rngFromString } from '../../src/engine/rng/streams.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string, extra: Partial<Parameters<typeof runLife>[1]> = {}) => ({ seed, era: { kind: 'now' as const }, nowYear: 2026, engineVersion: 't', ...extra });

describe('M2: engine', () => {
  it('same seed → bit-identical life (twice in-process)', () => {
    const a = runLife(data, cfg('repeat-me')), b = runLife(data, cfg('repeat-me'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('CLI `pnpm sim` digest is identical across two processes', () => {
    const run = () => execFileSync('node', ['.cache/node/src/cli/sim.js', '--seed', 'X', '--n', '300'], { encoding: 'utf8' }).trim().split('\n').pop()!;
    execFileSync('npx', ['tsc', '-p', 'tsconfig.node.json']);
    const a = JSON.parse(run()), b = JSON.parse(run());
    expect(a.digest).toBe(b.digest);
  });
  it('property: conditional sampling always satisfies constraints', () => {
    const isos = ['TWN', 'USA', 'IND', 'NGA', 'SGP', 'MAC'];
    fc.assert(fc.property(
      fc.string(), fc.integer({ min: 1950, max: 2026 }),
      fc.option(fc.constantFrom(...isos)), fc.option(fc.constantFrom('M' as const, 'F' as const)),
      fc.option(fc.constantFrom(1 as const, 2 as const, 3 as const, 4 as const, 5 as const)), fc.option(fc.boolean()),
      (seed, year, c, s, q, u) => {
        const K: BirthConstraints = {
          country: c ? { kind: 'fixed', value: c } : { kind: 'random' }, sex: s ? { kind: 'fixed', value: s } : { kind: 'random' },
          quintile: q ? { kind: 'fixed', value: q } : { kind: 'random' }, urban: u !== null ? { kind: 'fixed', value: u } : { kind: 'random' },
        };
        const b = sampleBirth(data.index, year, K, rngFromString(seed));
        if ('infeasible' in b) return u !== null; // only urban/rural can be infeasible (100%-urban places)
        return (!c || b.iso === c) && (!s || b.sex === s) && (!q || b.quintile === q) && (u === null || b.urban === u) && b.pct >= (b.quintile - 1) / 5 && b.pct < b.quintile / 5;
      }), { numRuns: 3000 });
  });
  it('infeasible: 100%-urban country + rural; unknown year', () => {
    const r = sampleBirth(data.index, 2020, { ...NO_CONSTRAINTS, country: { kind: 'fixed', value: 'SGP' }, urban: { kind: 'fixed', value: false } }, rngFromString('x'));
    expect('infeasible' in r).toBe(true);
    const y = sampleBirth(data.index, 1900, NO_CONSTRAINTS, rngFromString('x'));
    expect('infeasible' in y && y.field).toBe('year');
  });
  it('χ² golden: conditional sampling ≈ rejection sampling (country distribution, sex=F & q=1 & urban)', () => {
    const K: BirthConstraints = { country: { kind: 'random' }, sex: { kind: 'fixed', value: 'F' }, quintile: { kind: 'fixed', value: 1 }, urban: { kind: 'fixed', value: true } };
    const N = 20000;
    const cond = new Map<string, number>(), rej = new Map<string, number>();
    const r1 = rngFromString('cond'), r2 = rngFromString('rej');
    for (let i = 0; i < N; i++) { const b = sampleBirth(data.index, 2000, K, r1); if (!('infeasible' in b)) cond.set(b.iso, (cond.get(b.iso) ?? 0) + 1); }
    let got = 0;
    while (got < N) {
      const b = sampleBirth(data.index, 2000, NO_CONSTRAINTS, r2);
      if ('infeasible' in b) continue;
      if (b.sex === 'F' && b.quintile === 1 && b.urban) { rej.set(b.iso, (rej.get(b.iso) ?? 0) + 1); got++; }
    }
    // two-sample χ² over countries with expected ≥ 5 in pooled data (others pooled)
    const keys = [...new Set([...cond.keys(), ...rej.keys()])];
    let chi = 0, df = -1, oa = 0, ob = 0;
    for (const k of keys) {
      const a = cond.get(k) ?? 0, b = rej.get(k) ?? 0;
      if (a + b < 10) { oa += a; ob += b; continue; }
      chi += (a - b) ** 2 / (a + b); df++;
    }
    if (oa + ob > 0) { chi += (oa - ob) ** 2 / (oa + ob); df++; }
    // p > 0.01 ⇔ χ² below the 0.99 quantile; Wilson–Hilferty approximation
    const z = 2.326;
    const crit = df * Math.pow(1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df)), 3);
    expect(chi).toBeLessThan(crit);
  }, 120000);
  it('life invariants: net worth = cash; no NaN; death recorded; years contiguous', () => {
    for (let i = 0; i < 200; i++) {
      const s = runLife(data, cfg('inv' + i, { era: { kind: 'past', year: 'random' } }));
      if ('infeasible' in s) throw new Error('unexpected');
      expect(s.death).toBeTruthy();
      s.years.forEach((y, k) => {
        expect(y.age).toBe(k);
        expect(Number.isFinite(y.cash) && Number.isFinite(y.income) && Number.isFinite(y.consumption)).toBe(true);
        expect(y.netWorth).toBe(y.cash);
        expect(y.income).toBeGreaterThanOrEqual(0);
        if (y.age < 15) expect(y.income).toBe(0);
      });
    }
  });
  it('NOW era uses configured NOW_YEAR and flags clamped life table as estimate', () => {
    const s = newLife(data, cfg('now'));
    if ('infeasible' in s) throw new Error();
    expect(s.born.year).toBe(2026);
    expect(s.born.lifeTableYear).toBe(2023);
    expect(s.born.estimated).toContain('lifeTable');
  });
});
