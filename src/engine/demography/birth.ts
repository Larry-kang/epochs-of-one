// Conditional birth sampling: country → sex → quintile → urban, all under constraints K.
import type { CountryIndex, CountryRec, Iso3, Sex } from '../data/types.ts';
import { seriesAt, simpleAt } from '../data/types.ts';
import type { Rng } from '../rng/streams.ts';
import { PARAMS } from '../params.ts';

export type Constraint<T> = { kind: 'random' } | { kind: 'fixed'; value: T };
export interface BirthConstraints { country: Constraint<Iso3>; sex: Constraint<Sex>; quintile: Constraint<1 | 2 | 3 | 4 | 5>; urban: Constraint<boolean> }
export const NO_CONSTRAINTS: BirthConstraints = { country: { kind: 'random' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } };

export interface Birth { iso: Iso3; year: number; sex: Sex; quintile: 1 | 2 | 3 | 4 | 5; pct: number; urban: boolean; urbanEst: boolean; pUncond: number }
export interface Infeasible { infeasible: true; field: 'country' | 'sex' | 'quintile' | 'urban' | 'year'; reason: string }

export const pMale = (c: CountryRec, y: number) => { const srb = simpleAt(c.srb, y); return srb / (100 + srb); };
export function pUrban(c: CountryRec, y: number, q: number): number {
  const base = seriesAt(c.series.urban, y).v;
  const g = PARAMS.urbanQuintileGradient.value;
  if (g === 0 || base <= 0 || base >= 1) return base;
  const logit = Math.log(base / (1 - base)) + g * (q - 3);
  return 1 / (1 + Math.exp(-logit));
}

function pSex(c: CountryRec, y: number, K: Constraint<Sex>): number {
  if (K.kind === 'random') return 1;
  const m = pMale(c, y);
  return K.value === 'M' ? m : 1 - m;
}
const pQ = (K: Constraint<number>) => (K.kind === 'random' ? 1 : 0.2);
function pU(c: CountryRec, y: number, Kq: Constraint<number>, Ku: Constraint<boolean>): number {
  if (Ku.kind === 'random') return 1;
  const qs = Kq.kind === 'fixed' ? [Kq.value] : [1, 2, 3, 4, 5];
  let s = 0;
  for (const q of qs) { const pu = pUrban(c, y, q); s += Ku.value ? pu : 1 - pu; }
  return s / qs.length;
}

export function birthsIn(c: CountryRec, y: number): number {
  const i = y - c.births.from;
  return i >= 0 && i < c.births.v.length ? c.births.v[i]! : 0;
}

export function sampleBirth(idx: CountryIndex, year: number, K: BirthConstraints, rng: Rng): Birth | Infeasible {
  if (year < idx.birthYears[0] || year > idx.birthYears[1]) return { infeasible: true, field: 'year', reason: `year must be within ${idx.birthYears[0]}–${idx.birthYears[1]}` };
  const cs = idx.countries;
  const w = new Float64Array(cs.length);
  let tot = 0, totB = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    const B = birthsIn(c, year);
    totB += B;
    if (K.country.kind === 'fixed' && c.iso !== K.country.value) continue;
    w[i] = B * pSex(c, year, K.sex) * pQ(K.quintile) * pU(c, year, K.quintile, K.urban);
    tot += w[i]!;
  }
  if (!(tot > 0)) {
    if (K.country.kind === 'fixed') {
      const c = cs.find((x) => x.iso === (K.country as { value: string }).value);
      if (!c) return { infeasible: true, field: 'country', reason: 'unknown country' };
      if (birthsIn(c, year) <= 0) return { infeasible: true, field: 'country', reason: 'no births data for that year' };
    }
    return { infeasible: true, field: 'urban', reason: 'constraint combination has zero probability' };
  }
  const ci = rng.weighted(w);
  const c = cs[ci]!;
  const m = pMale(c, year);
  const sex: Sex = K.sex.kind === 'fixed' ? K.sex.value : rng.next() < m ? 'M' : 'F';
  const quintile = (K.quintile.kind === 'fixed' ? K.quintile.value : 1 + rng.int(5)) as 1 | 2 | 3 | 4 | 5;
  const pct = (quintile - 1 + rng.next()) / 5;
  const pu = pUrban(c, year, quintile);
  const urban = K.urban.kind === 'fixed' ? K.urban.value : rng.next() < pu;
  return { iso: c.iso, year, sex, quintile, pct, urban, urbanEst: seriesAt(c.series.urban, year).est, pUncond: tot / totB };
}

/** past-random era: year weighted by world (or a fixed country's) births in [from, to]. */
export function sampleYear(idx: CountryIndex, from: number, to: number, rng: Rng, iso?: Iso3): number {
  const w: number[] = [];
  for (let y = from; y <= to; y++) {
    let s = 0;
    for (const c of idx.countries) if (!iso || c.iso === iso) s += birthsIn(c, y);
    w.push(s);
  }
  const i = rng.weighted(w);
  return from + Math.max(0, i);
}
