// C0 guardrail spread: occ-on / occ-off mean lifetime income ratio for the 1990 cohort over many independent seed sets.
// Run: C0ISO=IND C0SETS=20 C0N=200 npx vitest run -c tools/c0/vitest.config.ts tools/c0/multiseed.test.ts → $C0OUT (default c0-multi-<iso>.json)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
it('multiseed', () => {
  const data = loadBundleFromDisk();
  const iso = process.env.C0ISO ?? 'IND', y = Number(process.env.C0YEAR ?? 1990), N = Number(process.env.C0N ?? 200), SETS = Number(process.env.C0SETS ?? 20);
  const life = (seed: string, occ: boolean) => runLife(data, { seed, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, registry) as LifeState;
  const inc = (s: LifeState) => s.years.reduce((x, r) => x + r.income, 0);
  const ratios: number[] = [];
  for (let j = 0; j < SETS; j++) {
    let on = 0, off = 0;
    for (let i = 0; i < N; i++) { const seed = j === 0 ? `c0-${iso}-${i}` : `c0s${j}-${iso}-${i}`; on += inc(life(seed, true)); off += inc(life(seed, false)); }
    ratios.push(on / off);
  }
  writeFileSync(process.env.C0OUT ?? `c0-multi-${iso}.json`, JSON.stringify({ iso, year: y, N, sets: SETS, ratios }));
}, 3_600_000);
