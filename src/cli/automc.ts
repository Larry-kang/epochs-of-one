// CLI: node .cache/node/src/cli/automc.js [--n 300] [--out file.json] — auto-decide lives (auto on from 15), per country:
// final net worth ÷ lifetime income (P10/P50/P90, adults) and net worth at 65 ÷ GDP pc (median). Item 6 balance check.
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../engine/data/nodeLoader.ts';
import { runLife } from '../engine/life/sim.ts';
import { seriesAt } from '../engine/data/types.ts';
import { contentEvents } from '../engine/content/registry.ts';
import { summarize, ADULT_AGE } from '../engine/life/companions.ts';
import type { Action } from '../engine/life/state.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1]! : d; };
const n = Number(arg('--n', '300')); const out = arg('--out', '');
const data = loadBundleFromDisk();
const AUTO: Action[] = [{ t: 'life', age: 15, key: 'auto', value: 'on' }];
const q = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : NaN; };
const res: Record<string, unknown> = {};
for (const iso of ['TWN', 'USA', 'JPN', 'KOR', 'NGA', 'IND', 'DEU']) {
  const r: number[] = []; const w65: number[] = []; let investedLives = 0;
  for (let i = 0; i < n; i++) {
    const s = runLife(data, { seed: `automc-${iso}-${i}`, era: { kind: 'past', year: 1980 }, nowYear: 2026, engineVersion: 'mc', occ: true,
      constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, contentEvents, AUTO);
    if ('infeasible' in s) continue;
    const m = summarize(s);
    if (m.lifespan < ADULT_AGE || m.lifetimeIncome <= 0) continue;
    r.push(m.finalNetWorth / m.lifetimeIncome);
    if (s.years.some((y) => y.invested > 0)) investedLives++;
    const y65 = s.years.find((y) => y.age === 65);
    if (y65) w65.push(y65.netWorth / seriesAt(data.country(iso).series.gdpPcPpp, y65.calYear).v);
  }
  res[iso] = { adults: r.length, p10: q(r, 0.1), p50: q(r, 0.5), p90: q(r, 0.9), nw65med: q(w65, 0.5), n65: w65.length, investedShare: investedLives / Math.max(1, r.length) };
  console.log(iso, JSON.stringify(res[iso]));
}
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
