// L2 conscription guardrail (owner decision, v0.11.0 rc2): conscription is a real, law-based loss for men, so the v0.11 engine is
// measured against "occupations without conscription" (same seeds, L2_OPTS.conscription = false) — not only against the
// pre-occupation engine. KOR/TWN/USA × born 1970/1990, 4 seed sets × N=200: mean lifetime income ±8%, net worth ±20%, e0 ±1%.
// The delta is logged (docs/l2-l3.md §3a). KOR 1970 vs the pre-occupation engine (0.915) is accepted as the conscription effect.
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { L2_OPTS } from '../../src/engine/life/conscription.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';

const N = 200, SETS = 4;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const cfg = (seed: string, iso: string, year: number): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't', occ: true,
  constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const data = loadBundleFromDisk();
describe('L2 guardrail: v0.11 vs occupations without conscription', () => {
  for (const iso of ['KOR', 'TWN', 'USA']) for (const year of [1970, 1990]) {
    it(`${iso} ${year}: income ±8%, net worth ±20%, e0 ±1%`, () => {
      const rI: number[] = [], rN: number[] = [], rE: number[] = [], rM: number[] = [];
      for (let j = 0; j < SETS; j++) {
        const sd = (i: number) => (j === 0 ? `c0-${iso}-${i}` : `c0s${j}-${iso}-${i}`);
        const on = Array.from({ length: N }, (_, i) => runLife(data, cfg(sd(i), iso, year), registry) as LifeState);
        L2_OPTS.conscription = false;
        const no = Array.from({ length: N }, (_, i) => runLife(data, cfg(sd(i), iso, year), registry) as LifeState);
        L2_OPTS.conscription = true;
        const inc = (a: LifeState[]) => mean(a.map((s) => s.years.reduce((x, y) => x + y.income, 0)));
        rI.push(inc(on) / inc(no)); rN.push(mean(on.map((s) => s.years.at(-1)!.netWorth)) / mean(no.map((s) => s.years.at(-1)!.netWorth)));
        rE.push(mean(on.map((s) => s.death!.age + s.death!.frac)) / mean(no.map((s) => s.death!.age + s.death!.frac)));
        const m = on.map((s, i) => [s, no[i]!] as const).filter(([s]) => s.born.sex === 'M');
        rM.push(mean(m.map(([s]) => s.years.reduce((x, y) => x + y.income, 0))) / mean(m.map(([, t]) => t.years.reduce((x, y) => x + y.income, 0))));
      }
      const line = JSON.stringify({ iso, year, inc: +mean(rI).toFixed(4), men: +mean(rM).toFixed(4), nw: +mean(rN).toFixed(4), e0: +mean(rE).toFixed(4) });
      console.log(line); if (process.env.L2CS_OUT) appendFileSync(process.env.L2CS_OUT, line + '\n');
      expect(Math.abs(mean(rI) - 1)).toBeLessThan(0.08); expect(Math.abs(mean(rN) - 1)).toBeLessThan(0.2); expect(Math.abs(mean(rE) - 1)).toBeLessThan(0.01);
    }, 900_000);
  }
});
