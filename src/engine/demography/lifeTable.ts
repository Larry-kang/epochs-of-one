// Period life table utilities (abridged WPP tables: ages 0,1,5,...,100+).
// Annual death probability within a group of width n: p = 1 − (1 − qx)^(1/n), which reproduces
// lx exactly at group boundaries. Open group 100+: p = 1 − exp(−mx).
import type { Demography, Sex } from '../data/types.ts';

export const AGE_STARTS = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100] as const;
export const MAX_AGE = 120;

export interface AnnualTable { iso: string; year: number; sex: Sex; p: Float64Array; ax0: number; e0Published: number; estimated: boolean }

export function groupIndex(age: number): number {
  for (let i = AGE_STARTS.length - 1; i >= 0; i--) if (age >= AGE_STARTS[i]!) return i;
  return 0;
}

/** Build single-year death probabilities for ages 0..MAX_AGE from the table of `year` (clamped to data range). */
export function annualTable(d: Demography, sex: Sex, year: number): AnnualTable {
  const y = Math.min(Math.max(year, d.from), d.to);
  const k = y - d.from;
  const t = d[sex];
  const qx = t.qx[k]!;
  const p = new Float64Array(MAX_AGE + 1);
  for (let a = 0; a <= MAX_AGE; a++) {
    const g = groupIndex(a);
    if (g === AGE_STARTS.length - 1) p[a] = a === MAX_AGE ? 1 : 1 - Math.exp(-t.mxLast[k]!);
    else {
      const n = AGE_STARTS[g + 1]! - AGE_STARTS[g]!;
      p[a] = 1 - Math.pow(1 - qx[g]!, 1 / n);
    }
  }
  return { iso: d.iso, year: y, sex, p, ax0: t.ax0[k]!, e0Published: d.e0[sex][k]!, estimated: y !== year };
}

/** Analytic life expectancy of a single-year table (deaths at mid-year, except infants at ax0). */
export function lifeExpectancy(t: AnnualTable): number {
  let l = 1, e = 0;
  for (let a = 0; a <= MAX_AGE; a++) {
    const d = l * t.p[a]!;
    e += (l - d) + d * (a === 0 ? t.ax0 : 0.5);
    l -= d;
  }
  return e;
}

/** Probability of dying before exact age 5. */
export function under5(t: AnnualTable): number {
  let l = 1;
  for (let a = 0; a < 5; a++) l *= 1 - t.p[a]!;
  return 1 - l;
}
