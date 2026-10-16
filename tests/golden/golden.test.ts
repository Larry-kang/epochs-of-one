import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';

// 5 golden seeds. Discrete outcomes must match exactly; money with tolerance.
// Regenerate intentionally with: UPDATE_GOLDEN=1 pnpm vitest run tests/golden
const CASES: { name: string; cfg: LifeConfig }[] = [
  { name: 'now-random', cfg: { seed: 'golden-1', era: { kind: 'now' }, nowYear: 2026, engineVersion: 'g' } },
  { name: 'past-1950', cfg: { seed: 'golden-2', era: { kind: 'past', year: 1950 }, nowYear: 2026, engineVersion: 'g' } },
  { name: 'past-1980', cfg: { seed: 'golden-3', era: { kind: 'past', year: 1980 }, nowYear: 2026, engineVersion: 'g' } },
  { name: 'past-2008', cfg: { seed: 'golden-4', era: { kind: 'past', year: 2008 }, nowYear: 2026, engineVersion: 'g' } },
  { name: 'twn-1990-constrained', cfg: { seed: 'golden-5', era: { kind: 'past', year: 1990 }, nowYear: 2026, engineVersion: 'g',
    constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'fixed', value: 3 }, urban: { kind: 'fixed', value: true } } } },
];

const data = loadBundleFromDisk();
describe('M3: golden seeds', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const s = runLife(data, c.cfg, contentEvents);
      if ('infeasible' in s) throw new Error('infeasible');
      const snap = {
        born: { iso: s.born.iso, year: s.born.year, sex: s.born.sex, quintile: s.born.quintile, urban: s.born.urban },
        death: { age: s.death!.age, cause: s.death!.cause, year: s.death!.year },
        events: s.events.map((e) => `${e.age}:${e.id}`),
        netWorthEvery10: s.years.filter((y) => y.age % 10 === 0).map((y) => Math.round(y.netWorth * 100) / 100),
      };
      const f = `tests/golden/${c.name}.json`;
      if (process.env.UPDATE_GOLDEN || !existsSync(f)) writeFileSync(f, JSON.stringify(snap, null, 1) + '\n');
      const g = JSON.parse(readFileSync(f, 'utf8')) as typeof snap;
      expect(snap.born).toEqual(g.born);
      expect(snap.death).toEqual(g.death);
      expect(snap.events).toEqual(g.events);
      expect(snap.netWorthEvery10.length).toBe(g.netWorthEvery10.length);
      snap.netWorthEvery10.forEach((v, i) => expect(Math.abs(v - g.netWorthEvery10[i]!)).toBeLessThanOrEqual(Math.max(0.01, Math.abs(g.netWorthEvery10[i]!) * 1e-9)));
    });
  }
});
