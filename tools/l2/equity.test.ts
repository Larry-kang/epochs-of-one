// L2/L3 equity check: per country × sex × cohort, lifetime income with the full v0.11 engine ("on")
// vs the pre-occupation engine ("off"), plus counterfactuals on the same seeds: without conscription ("noCS") and without the
// L3 institution hooks ("noInst"). For men: income in the first 10 working years, rung at 40, share who served, months served.
// Run: npx vitest run -c tools/l2/vitest.config.ts tools/l2/equity.test.ts → $EQ_OUT (default /tmp/l2-equity.json)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife } from '../../src/engine/life/sim.ts';
import { L2_OPTS } from '../../src/engine/life/conscription.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
it('equity', () => {
  const data = loadBundleFromDisk();
  const isos = (process.env.EQ_ISO ?? 'TWN,KOR,USA,JPN').split(',');
  const YS = (process.env.EQ_YEARS ?? '1950,1970,1990,2005').split(',').map(Number), N = Number(process.env.EQ_N ?? 200), SETS = Number(process.env.EQ_SETS ?? 4);
  const life = (seed: string, iso: string, y: number, occ: boolean) => runLife(data, { seed, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, registry) as LifeState;
  const inc = (s: LifeState) => s.years.reduce((x, r) => x + r.income, 0);
  const early = (s: LifeState) => { const w = s.career.workStart; return w === undefined ? 0 : s.years.filter((r) => r.age >= w && r.age < w + 10).reduce((x, r) => x + r.income, 0); };
  const out: Record<string, unknown> = {};
  for (const iso of isos) for (const Y of YS) {
    const acc: Record<string, Record<string, number>> = { M: {}, F: {} };
    const add = (sx: string, k: string, v: number) => { acc[sx]![k] = (acc[sx]![k] ?? 0) + v; };
    for (let j = 0; j < SETS; j++) for (let i = 0; i < N; i++) {
      const seed = j === 0 ? `c0-${iso}-${i}` : `c0s${j}-${iso}-${i}`;
      const off = life(seed, iso, Y, false); const on = life(seed, iso, Y, true);
      L2_OPTS.conscription = false; const ncs = life(seed, iso, Y, true); L2_OPTS.conscription = true;
      L2_OPTS.institutions = false; const nin = life(seed, iso, Y, true); L2_OPTS.institutions = true;
      const sx = off.born.sex; add(sx, 'n', 1); add(sx, 'off', inc(off)); add(sx, 'on', inc(on)); add(sx, 'ncs', inc(ncs)); add(sx, 'nin', inc(nin));
      add(sx, 'early', early(on)); add(sx, 'earlyNcs', early(ncs)); add(sx, 'nwOn', on.years.at(-1)!.netWorth); add(sx, 'nwOff', off.years.at(-1)!.netWorth);
      if (on.flags.csMonths !== undefined) { add(sx, 'served', 1); add(sx, 'months', Number(on.flags.csMonths)); }
    }
    const r = (sx: string) => { const a = acc[sx]!; return { n: a.n, onOff: +(a.on! / a.off!).toFixed(4), noCsOff: +(a.ncs! / a.off!).toFixed(4), csEffect: +(a.on! / a.ncs!).toFixed(4), instEffect: +(a.on! / a.nin!).toFixed(4),
      early10csEffect: a.earlyNcs ? +(a.early! / a.earlyNcs!).toFixed(4) : null, nwOnOff: +(a.nwOn! / a.nwOff!).toFixed(3), served: +((a.served ?? 0) / a.n!).toFixed(3), meanMonths: a.served ? +(a.months! / a.served).toFixed(1) : 0 }; };
    const fm = (k: string) => +((acc.F![k]! / acc.F!.n!) / (acc.M![k]! / acc.M!.n!)).toFixed(4);
    out[`${iso}-${Y}`] = { M: r('M'), F: r('F'), fmOff: fm('off'), fmOn: fm('on'), fmNoCs: fm('ncs') };
    console.log(iso, Y, JSON.stringify(out[`${iso}-${Y}`]));
  }
  writeFileSync(process.env.EQ_OUT ?? '/tmp/l2-equity.json', JSON.stringify({ N, sets: SETS, out }, null, 1));
}, 7_200_000);
