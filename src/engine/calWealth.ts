// P0-1 wealth calibration & guard (docs/calibration-wealth.md).
//  • crossSection: N lives of a country born across past cohorts (birth-weighted by WPP births), observed in the
//    OECD WDD survey year if alive and aged ≥ 25 → median net worth ÷ GDP pc (same year, PPP real) — compared with
//    the per-adult OECD target (pipeline/calibration/wealth-targets.json).
//  • lifetimeGuard: N comparison lives born in one year; for lives reaching adulthood, the ratio
//    final net worth ÷ lifetime (gross) income. Guard: median ≤ 1 and share above 3 ≤ 2 %.
import type { DataBundle } from './life/sim.ts';
import { runLife, newLife, advanceYear } from './life/sim.ts';
import { seriesAt } from './data/types.ts';
import { contentEvents } from './content/registry.ts';
import { summarize, ADULT_AGE } from './life/companions.ts';
import type { BirthConstraints } from './demography/birth.ts';

const K = (iso: string): BirthConstraints => ({ country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } });
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[a.length >> 1]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2) : NaN; };
const q = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))]! : NaN; };

export function crossSection(data: DataBundle, iso: string, surveyYear: number, n: number, prefix = 'calw'): { median: number; n: number } {
  const vals: number[] = [];
  const gdp = seriesAt(data.country(iso).series.gdpPcPpp, surveyYear).v;
  for (let i = 0; i < n; i++) {
    let s = newLife(data, { seed: `${prefix}-${iso}-${i}`, era: { kind: 'past', year: 'random' }, nowYear: surveyYear - 24, constraints: K(iso), engineVersion: 'cal' });
    if ('infeasible' in s) continue;
    while (!s.death && s.born.year + s.age <= surveyYear) s = advanceYear(data, s, contentEvents);
    const row = s.years.find((y) => y.calYear === surveyYear);
    if (row && row.age >= 25 && !(s.death && s.death.year === surveyYear)) vals.push(row.netWorth / gdp);
  }
  return { median: median(vals), n: vals.length };
}

export interface Guard { iso: string; year: number; adults: number; median: number; p90: number; p99: number; over3: number }
export function lifetimeGuard(data: DataBundle, iso: string, year: number, n: number, prefix = 'guard'): Guard {
  const r: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = runLife(data, { seed: `${prefix}-${iso}-${year}-${i}`, era: { kind: 'past', year }, nowYear: 2026, constraints: K(iso), engineVersion: 'cal' }, contentEvents);
    if ('infeasible' in s) continue;
    const m = summarize(s);
    if (m.lifespan < ADULT_AGE || m.lifetimeIncome <= 0) continue;
    r.push(m.finalNetWorth / m.lifetimeIncome);
  }
  return { iso, year, adults: r.length, median: median(r), p90: q(r, 0.9), p99: q(r, 0.99), over3: r.filter((x) => x > 3).length / Math.max(1, r.length) };
}
