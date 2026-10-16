// H4/H5 "born now" odds: each country's share of births over a year range (UN WPP via countries.json).
import type { CountryIndex, CountryRec } from '../../engine/data/types.ts';

export interface OddsRow { iso: string; share: number; births: number }
export interface Odds { rows: OddsRow[]; otherN: number; otherShare: number; total: number; from: number; to: number }

export function birthsOf(c: CountryRec, y: number): number {
  const i = y - c.births.from;
  return i >= 0 && i < c.births.v.length ? c.births.v[i]! : 0;
}
/** top-N countries by births share in [from, to] (inclusive); the rest is lumped into "other". Births are in thousands. */
export function birthShares(index: CountryIndex, from: number, to: number, top = 9): Odds {
  const all = index.countries.map((c) => { let b = 0; for (let y = from; y <= to; y++) b += birthsOf(c, y); return { iso: c.iso, births: b }; }).filter((r) => r.births > 0);
  const total = all.reduce((a, r) => a + r.births, 0);
  all.sort((a, b) => b.births - a.births || a.iso.localeCompare(b.iso));
  const rows = all.slice(0, top).map((r) => ({ ...r, share: total ? r.births / total : 0 }));
  const rest = all.slice(top);
  return { rows, otherN: rest.length, otherShare: total ? rest.reduce((a, r) => a + r.births, 0) / total : 0, total, from, to };
}
/** full table (all countries, sorted by share) for the stats dialog */
export function allShares(index: CountryIndex, from: number, to: number): OddsRow[] {
  return birthShares(index, from, to, Infinity).rows;
}
/** % with 1 decimal, 2 decimals below 1 % */
export const sharePct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
