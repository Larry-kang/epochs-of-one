import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { seriesAt } from '../../src/engine/data/types.ts';
import { yearReturns, btcVolFactor, btcPoolMean, LAST_DATA_YEAR } from '../../src/engine/finance/returns.ts';
import { BTC_FUTURE_DAMPENED, BTC_FUTURE_MEAN_SCALE, BTC_FUTURE_VOL_FLOOR } from '../../src/config.ts';

const data = loadBundleFromDisk(); const m = data.markets!;
const pi = (iso: string, y: number) => seriesAt(data.country(iso).series.cpi, y).v;
const ctx = (year: number, u: number) => ({ m, iso: 'TWN', year, pi, u: () => u });

describe('BTC future model (option A, 推估)', () => {
  it('is on by default and history (≤ 2025) is untouched', () => {
    expect(BTC_FUTURE_DAMPENED).toBe(true);
    const a = yearReturns(ctx(2021, 0.3));
    expect(a.real.btc).toBe(yearReturns(ctx(2021, 0.9)).real.btc); // historical year: no bootstrap, no dampening
  });
  it('volatility factor: 1 at 2025, decays, floored', () => {
    expect(btcVolFactor(LAST_DATA_YEAR)).toBe(1);
    expect(btcVolFactor(2035)).toBeLessThan(btcVolFactor(2030));
    expect(btcVolFactor(2200)).toBe(BTC_FUTURE_VOL_FLOOR);
  });
  it('mean future log return over the pool ≈ MEAN_SCALE × historical pool mean', () => {
    const y = 2026; let s = 0; const n = 1200;
    for (let i = 0; i < n; i++) s += Math.log(1 + yearReturns(ctx(y, (i + 0.5) / n)).real.btc!);
    expect(s / n).toBeCloseTo(BTC_FUTURE_MEAN_SCALE * btcPoolMean(ctx(y, 0)), 2);
    expect(yearReturns(ctx(2030, 0.5)).est.btc).toBe(true);
  });
});
