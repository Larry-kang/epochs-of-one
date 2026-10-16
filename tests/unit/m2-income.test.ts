import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sigmaFromGini, giniFromSigma, incomeAt, incomeRaw, bandMean } from '../../src/engine/economy/income.ts';
import { phi, phiInv } from '../../src/engine/math/normal.ts';

describe('M2: income distribution (R16)', () => {
  it('Φ / Φ⁻¹ round-trip', () => {
    for (const p of [0.001, 0.025, 0.2, 0.5, 0.8, 0.975, 0.999]) expect(phi(phiInv(p))).toBeCloseTo(p, 6);
  });
  it('Gini → σ → Gini round-trip (lognormal)', () => {
    fc.assert(fc.property(fc.double({ min: 0.05, max: 0.8, noNaN: true }), (g) => Math.abs(giniFromSigma(sigmaFromGini(g)) - g) < 1e-5), { numRuns: 1000 });
  });
  it('band means of unit-mean lognormal sum to 1', () => {
    const s = 0.8; let tot = 0; for (let k = 0; k < 5; k++) tot += bandMean(s, k / 5, (k + 1) / 5) / 5;
    expect(tot).toBeCloseTo(1, 6);
  });
  it('quintile means reproduce mean·5·share within 3% (numerical integration)', () => {
    const d = { mean: 20000, sigma: sigmaFromGini(0.4), shares: [0.06, 0.1, 0.15, 0.22, 0.47] as [number, number, number, number, number] };
    for (let k = 0; k < 5; k++) {
      let s = 0; const N = 20000;
      for (let i = 0; i < N; i++) s += incomeAt(d, (k + (i + 0.5) / N) / 5);
      expect(Math.abs(s / N / (d.mean * 5 * d.shares[k]!) - 1)).toBeLessThan(0.03);
    }
  });
  it('raw construction reproduces quintile means exactly', () => {
    const d = { mean: 20000, sigma: sigmaFromGini(0.4), shares: [0.06, 0.1, 0.15, 0.22, 0.47] as [number, number, number, number, number] };
    for (let k = 0; k < 4; k++) {
      let s = 0; const N = 20000;
      for (let i = 0; i < N; i++) s += incomeRaw(d, (k + (i + 0.5) / N) / 5);
      expect(s / N / (d.mean * 5 * d.shares[k]!)).toBeCloseTo(1, 2);
    }
  });
  it('property: income is positive, finite and non-decreasing in percentile', () => {
    fc.assert(fc.property(fc.double({ min: 0.2, max: 0.7, noNaN: true }), fc.double({ min: 0.001, max: 0.998, noNaN: true }), (g, p) => {
      const d = { mean: 10000, sigma: sigmaFromGini(g), shares: [0.07, 0.11, 0.16, 0.22, 0.44] as [number, number, number, number, number] };
      const a = incomeAt(d, p), b = incomeAt(d, Math.min(p + 0.001, 0.999));
      return Number.isFinite(a) && a > 0 && b >= a * (1 - 1e-9);
    }), { numRuns: 3000 });
  });
});
