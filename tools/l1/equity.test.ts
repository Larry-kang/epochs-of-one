// L1 equity check (localization-plan / careers-draft ): per country × sex, occupation system on vs the pre-occupation
// engine (same seeds → same people), with ILOSTAT sex weights ('ilo') and with no sex weight at all ('neutral').
// A sex/country is "disadvantaged beyond the data" if its on/off income ratio leaves the ±8% band with neutral weights, or if
// the ILOSTAT weights move the F/M income ratio far beyond what the observed occupational sex mix implies.
// Run: npx vitest run -c tools/c0/vitest.config.ts tools/l1/equity.test.ts  → $EQ_OUT (default /tmp/l1-equity.json)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife } from '../../src/engine/life/sim.ts';
import { OCC_OPTS } from '../../src/engine/life/occupation.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
it('equity', () => {
  const data = loadBundleFromDisk();
  const isos = (process.env.EQ_ISO ?? 'TWN,USA,CHN,IND,JPN,KOR,DEU,GBR,FRA,BRA,IDN,NGA,MEX,ETH').split(',');
  const Y = Number(process.env.EQ_YEAR ?? 1990), N = Number(process.env.EQ_N ?? 200), SETS = Number(process.env.EQ_SETS ?? 4);
  const life = (seed: string, iso: string, occ: boolean) => runLife(data, { seed, era: { kind: 'past', year: Y }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, registry) as LifeState;
  const inc = (s: LifeState) => s.years.reduce((x, r) => x + r.income, 0);
  const out: Record<string, unknown> = {};
  for (const iso of isos) {
    const acc: Record<string, Record<string, number>> = { M: {}, F: {} };
    const add = (sx: string, k: string, v: number) => { acc[sx]![k] = (acc[sx]![k] ?? 0) + v; };
    for (let j = 0; j < SETS; j++) for (let i = 0; i < N; i++) {
      const seed = j === 0 ? `c0-${iso}-${i}` : `c0s${j}-${iso}-${i}`;
      const off = life(seed, iso, false); OCC_OPTS.sexMode = 'ilo'; const on = life(seed, iso, true); OCC_OPTS.sexMode = 'neutral'; const neu = life(seed, iso, true); OCC_OPTS.sexMode = 'ilo';
      const sx = off.born.sex; add(sx, 'n', 1); add(sx, 'off', inc(off)); add(sx, 'on', inc(on)); add(sx, 'neu', inc(neu));
      add(sx, 'nwOff', off.years.at(-1)!.netWorth); add(sx, 'nwOn', on.years.at(-1)!.netWorth);
      add(sx, 'e0Off', off.death!.age + off.death!.frac); add(sx, 'e0On', on.death!.age + on.death!.frac);
      const yrs = typeof on.flags.occYears === 'string' ? JSON.parse(on.flags.occYears) as Record<string, string> : {};
      for (const [a, g] of Object.entries(yrs)) if (+a >= 25 && +a <= 64) { add(sx, 'g_' + g, 1); add(sx, 'gTot', 1); }
    }
    const r = (sx: string) => { const a = acc[sx]!; return { n: a.n, incOnOff: +(a.on! / a.off!).toFixed(4), incNeutralOff: +(a.neu! / a.off!).toFixed(4), nwOnOff: +(a.nwOn! / a.nwOff!).toFixed(3), e0OnOff: +(a.e0On! / a.e0Off!).toFixed(4),
      mix: Object.fromEntries(Object.entries(a).filter(([k]) => k.startsWith('g_')).map(([k, v]) => [k.slice(2), +(v / a.gTot!).toFixed(3)])), meanOff: Math.round(a.off! / a.n!), meanOn: Math.round(a.on! / a.n!) }; };
    const M = r('M'), F = r('F');
    const fm = (k: 'off' | 'on' | 'neu') => +((acc.F![k]! / acc.F!.n!) / (acc.M![k]! / acc.M!.n!)).toFixed(4);
    out[iso] = { M, F, fmOff: fm('off'), fmOn: fm('on'), fmNeutral: fm('neu'), allOnOff: +((acc.M!.on! + acc.F!.on!) / (acc.M!.off! + acc.F!.off!)).toFixed(4) };
    console.log(iso, JSON.stringify(out[iso]));
  }
  writeFileSync(process.env.EQ_OUT ?? '/tmp/l1-equity.json', JSON.stringify({ year: Y, N, sets: SETS, out }, null, 1));
}, 3_600_000);
