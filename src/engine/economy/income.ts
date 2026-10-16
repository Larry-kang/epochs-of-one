// Income distribution: country-year mean (WDI GDP pc PPP, 2021 intl $) × quintile shares (WDI/PIP),
// with a log-normal shape inside each quintile whose σ is implied by the Gini (σ = √2·Φ⁻¹((G+1)/2)).
import { phi, phiInv } from '../math/normal.ts';

export function sigmaFromGini(g: number): number {
  const gg = Math.min(Math.max(g, 0.01), 0.95);
  return Math.SQRT2 * phiInv((gg + 1) / 2);
}
export function giniFromSigma(s: number): number {
  return 2 * phi(s / Math.SQRT2) - 1;
}

/** Mean of the unit-mean log-normal restricted to percentile band (a,b), divided by band width. */
export function bandMean(sigma: number, a: number, b: number): number {
  const za = a <= 0 ? -Infinity : phiInv(a), zb = b >= 1 ? Infinity : phiInv(b);
  const hi = zb === Infinity ? 1 : phi(zb - sigma);
  const lo = za === -Infinity ? 0 : phi(za - sigma);
  return (hi - lo) / (b - a);
}

export interface IncomeDist { mean: number; sigma: number; shares: [number, number, number, number, number] }

/** Raw (pre-monotonisation) income: quintile means equal mean·5·share_k exactly, but may jump down at quintile edges. */
export function incomeRaw(d: IncomeDist, p: number): number {
  const pp = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  const k = Math.min(4, Math.floor(pp * 5));
  const tot = d.shares.reduce((x, y) => x + y, 0);
  const share = d.shares[k]! / tot;
  const y0 = Math.exp(d.sigma * phiInv(pp) - (d.sigma * d.sigma) / 2);
  const m0 = bandMean(d.sigma, k / 5, (k + 1) / 5);
  return d.mean * 5 * share * (y0 / m0);
}

/** Percentile (0..1) of value x in a sample (fraction strictly below + half ties). */
export function percentileOf(sample: number[], x: number): number {
  if (!sample.length) return 0.5;
  let below = 0, eq = 0;
  for (const v of sample) { if (v < x) below++; else if (v === x) eq++; }
  return (below + eq / 2) / sample.length;
}

const GRID = 1000;
const gridCache = new Map<string, Float64Array>();

/** Pool-adjacent-violators: monotone non-decreasing fit preserving block means (and the overall mean). */
export function isotonic(y: Float64Array): Float64Array {
  const val: number[] = [], wt: number[] = [];
  for (let i = 0; i < y.length; i++) {
    val.push(y[i]!); wt.push(1);
    while (val.length > 1 && val[val.length - 2]! > val[val.length - 1]!) {
      const w = wt[wt.length - 2]! + wt[wt.length - 1]!;
      const v = (val[val.length - 2]! * wt[wt.length - 2]! + val[val.length - 1]! * wt[wt.length - 1]!) / w;
      val.splice(-2, 2, v); wt.splice(-2, 2, w);
    }
  }
  const out = new Float64Array(y.length);
  let k = 0;
  for (let b = 0; b < val.length; b++) for (let j = 0; j < wt[b]!; j++) out[k++] = val[b]!;
  return out;
}

/** Income at percentile p ∈ (0,1): monotone in p; quintile means ≈ mean·5·share_k (exact up to edge pooling). */
export function incomeAt(d: IncomeDist, p: number): number {
  const key = `${d.mean}|${d.sigma}|${d.shares.join(',')}`;
  let g = gridCache.get(key);
  if (!g) {
    const raw = new Float64Array(GRID);
    for (let i = 0; i < GRID; i++) raw[i] = incomeRaw(d, (i + 0.5) / GRID);
    g = isotonic(raw);
    if (gridCache.size > 5000) gridCache.clear();
    gridCache.set(key, g);
  }
  const pp = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  const x = pp * GRID - 0.5;
  if (x <= 0) return Math.min(g[0]!, incomeRaw(d, pp));
  if (x >= GRID - 1) return Math.max(g[GRID - 1]!, incomeRaw(d, pp));
  const i = Math.floor(x), f = x - i;
  return g[i]! * (1 - f) + g[i + 1]! * f;
}
