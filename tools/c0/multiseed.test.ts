// C0 guardrail spread: occ-on / occ-off mean lifetime income ratio for the 1990 cohort over many independent seed sets.
// Run: C0ISO=IND C0SETS=20 C0N=200 npx vitest run -c tools/c0/vitest.config.ts tools/c0/multiseed.test.ts → $C0OUT (default c0-multi-<iso>-<year>.json); C0YEAR=1970|1990
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
import { L2_OPTS } from '../../src/engine/life/conscription.ts';
// v0.11: L2_OFF=1 → occupation lives without conscription / institutions (the v0.10 engine), for before/after tables
if (process.env.L2_OFF) { L2_OPTS.conscription = false; L2_OPTS.institutions = false; }
it('multiseed', () => {
  const data = loadBundleFromDisk();
  const iso = process.env.C0ISO ?? 'IND', y = Number(process.env.C0YEAR ?? 1990), N = Number(process.env.C0N ?? 200), SETS = Number(process.env.C0SETS ?? 20);
  const life = (seed: string, occ: boolean) => runLife(data, { seed, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, registry) as LifeState;
  const inc = (s: LifeState) => s.years.reduce((x, r) => x + r.income, 0);
  const ratios: number[] = [], nw: number[] = [], e0: number[] = [];
  const nwOf = (s: LifeState) => s.years.at(-1)!.netWorth, e0Of = (s: LifeState) => s.death!.age + s.death!.frac;
  for (let j = 0; j < SETS; j++) {
    let on = 0, off = 0, nOn = 0, nOff = 0, eOn = 0, eOff = 0;
    for (let i = 0; i < N; i++) {
      const seed = j === 0 ? `c0-${iso}-${i}` : `c0s${j}-${iso}-${i}`; const a = life(seed, true), b = life(seed, false);
      on += inc(a); off += inc(b); nOn += nwOf(a); nOff += nwOf(b); eOn += e0Of(a); eOff += e0Of(b);
    }
    ratios.push(on / off); nw.push(nOn / nOff); e0.push(eOn / eOff);
  }
  writeFileSync(process.env.C0OUT ?? `c0-multi-${iso}-${y}.json`, JSON.stringify({ iso, year: y, N, sets: SETS, ratios, nw, e0 }));
}, 3_600_000);
