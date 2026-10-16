// P1 character identity: name, parents, siblings (game content seeded from the 'family' stream; never touches mortality).
import type { CountryRec } from '../data/types.ts';
import { seriesAt } from '../data/types.ts';
import { stream } from '../rng/streams.ts';
import { makeName, regionOf, type NameRegion, type PersonName } from '../content/names.ts';
import type { Family } from './state.ts';

/** Expected number of siblings: falls with income level (design proxy for fertility; WPP TFR not yet in the pipeline → 推估). */
export const siblingMean = (gdpPc: number) => Math.max(0.4, Math.min(4.5, 4.6 - 0.95 * Math.log(Math.max(gdpPc, 500) / 1000)));

/** v0.8.0: siblings from the PARENTS' fertility — WPP period TFR averaged over the mother's childbearing years (ages 20–39).
 *  A child is drawn from a family with ≥1 child, so the sibling count is size-biased: with family size N (mean T, variance ≈ T/2)
 *  E[siblings] = E[N²]/E[N] − 1 = T − 0.5. */
export function parentsTfr(tfrAt: ((year: number) => number | undefined) | undefined, motherBorn: number): number | undefined {
  if (!tfrAt) return undefined;
  let s = 0, n = 0; for (let a = 20; a <= 39; a++) { const v = tfrAt(motherBorn + a); if (v !== undefined) { s += v; n++; } }
  return n ? s / n : undefined;
}
export const siblingMeanTfr = (tfr: number) => Math.max(0.1, tfr - 0.5);
export function makeFamily(c: CountryRec, year: number, sex: 'M' | 'F', seed: string, tfrAt?: (year: number) => number | undefined): { name: PersonName; family: Family } {
  const r = stream(seed, 'family');
  const region: NameRegion = regionOf(c.iso, c.sub);
  const name = makeName(region, sex, r.next(), r.next());
  const momAge = 18 + Math.floor(r.next() * 18), dadGap = Math.floor(r.next() * 7);
  const mother = { name: makeName(region, 'F', r.next(), r.next()).full, born: year - momAge };
  const father = { name: makeName(region, 'M', 0, r.next(), name.family).full, born: year - momAge - dadGap };
  const pt = parentsTfr(tfrAt, year - momAge);
  const lam = pt !== undefined ? siblingMeanTfr(pt) : siblingMean(seriesAt(c.series.gdpPcPpp, year).v);
  // Poisson(λ) by inversion, capped at 6
  let k = 0, p = Math.exp(-lam), cum = p; const u = r.next();
  while (u > cum && k < 6) { k++; p *= lam / k; cum += p; }
  const taken = new Set([name.given]);
  const siblings = Array.from({ length: k }, () => {
    const sx = r.next() < 0.5 ? 'M' : 'F';
    const off = Math.floor(r.next() * 9) - 4 || 1;
    const u = r.next();
    let g = makeName(region, sx, 0, u, name.family).given;
    for (let j = 1; j < 12 && taken.has(g); j++) g = makeName(region, sx, 0, (u + j * 0.6180339887) % 1, name.family).given; // unique within the family
    taken.add(g);
    return { name: g, born: Math.max(year - momAge + 17, year + off) };
  });
  return { name, family: { mother, father, siblings, children: [], parentsAlive: true, region } };
}
