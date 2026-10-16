// annual real returns in the holder's home purchasing power, from annual price levels.
//   foreign (USD-priced) asset → home nominal:  R_h = (1 + r_usd) · FX_t/FX_{t−1} − 1     (FX = LCU per USD, WDI PA.NUS.FCRF)
//   real:                                        r   = (1 + R_h)/(1 + π_h) − 1              (π_h = home CPI inflation, WDI)
// Missing FX (e.g. TWN is not in WDI) → relative-PPP fallback FX_t/FX_{t−1} = (1+π_h)/(1+π_US), flagged 'fx' (推估).
// Price indices only (no dividend data in the allowed sources yet; dy proxy = TODO(param)).
// Future years (> LAST_DATA_YEAR) bootstrap a historical year from the market stream (seed, year) — same draw for
// every asset in that year (keeps cross-asset correlation); all such returns are flagged 推估.
import type { MarketsData, Priced } from './marketData.ts';
import { denseAt, lastYear } from './marketData.ts';
import type { InvestAsset } from './access.ts';
import { DRAWDOWN_SAFETY_FACTOR, BTC_FUTURE_DAMPENED, BTC_FUTURE_MEAN_SCALE, BTC_FUTURE_VOL_HALFLIFE, BTC_FUTURE_VOL_FLOOR } from '../../config.ts';

export const LAST_DATA_YEAR = 2025;
export const BOOT_FROM = 1991;      // bootstrap pool for equities/gold (world index has ≥16 countries from 1960; FX for most from 1960)
export const BTC_BOOT_FROM = 2014;  // BTC pool excludes the earliest, thinnest years
export type PriceAsset = Exclude<InvestAsset, 'levEq'>;
export const PRICE_ASSETS: PriceAsset[] = ['eqHome', 'eqUS', 'eqWorld', 'gold', 'btc'];

export interface YearReturns {
  /** real return in home purchasing power; null = not defined (no data for t−1→t) */
  real: Record<PriceAsset, number | null>;
  /** home-currency nominal return (for the leverage intra-year path) */
  nomHome: Record<PriceAsset, number | null>;
  /** max intra-year peak-to-trough drawdown (≤ 0, series currency, monthly path); null → Brownian bridge fallback */
  dd: Record<PriceAsset, number | null>;
  est: Record<PriceAsset, boolean>;
  /** 'proxy_world' when eqHome is derived from the world index */
  homeSrc: 'data' | 'proxy_world' | 'none';
  fxEst: boolean; bootYear?: number; piHome: number;
}
export interface ReturnCtx { m: MarketsData; iso: string; year: number; pi: (iso: string, y: number) => number; u: () => number }

const ddAt = (s: Priced | undefined, y: number): number | null =>
  s?.dd && y >= s.from && y - s.from < s.dd.length ? (s.dd[y - s.from] ?? null) : null;
const pr = (s: Priced | undefined, y: number): number | null => {
  const a = denseAt(s, y - 1), b = denseAt(s, y);
  return a != null && b != null && a > 0 ? b / a - 1 : null;
};

export function fxFactor(m: MarketsData, iso: string, y: number, pi: (iso: string, y: number) => number): { f: number; est: boolean } {
  if (iso === 'USA') return { f: 1, est: false };
  const a = denseAt(m.fx[iso], y - 1), b = denseAt(m.fx[iso], y);
  if (a != null && b != null && a > 0) return { f: b / a, est: false };
  return { f: (1 + pi(iso, y)) / (1 + pi('USA', y)), est: true };
}

function historical(c: ReturnCtx, y: number): YearReturns {
  const { m, iso } = c;
  const piH = c.pi(iso, y);
  const fx = fxFactor(m, iso, y, c.pi);
  const usd = { eqUS: pr(m.eq.USA, y), eqWorld: pr(m.world, y), gold: pr(m.gold, y), btc: pr(m.btc, y) };
  const toHome = (r: number | null) => (r == null ? null : (1 + r) * fx.f - 1);
  let eqHome: number | null, homeSrc: YearReturns['homeSrc'], homeEst: boolean;
  const own = m.eq[iso];
  // v0.10.0: series flagged est (US / world equity = nominal-GDP model, no open index licence) are always 推估
  if (iso === 'USA') { eqHome = usd.eqUS; homeSrc = 'data'; homeEst = !!m.eq.USA?.est; }
  else if (own) { eqHome = pr(own, y); homeSrc = eqHome == null ? 'none' : 'data'; homeEst = !!own.est || !!own.unverified?.includes(y) || !!own.unverified?.includes(y - 1); }
  else { eqHome = toHome(usd.eqWorld); homeSrc = eqHome == null ? 'none' : 'proxy_world'; homeEst = true; }
  const nomHome: YearReturns['nomHome'] = { eqHome, eqUS: toHome(usd.eqUS), eqWorld: toHome(usd.eqWorld), gold: toHome(usd.gold), btc: toHome(usd.btc) };
  const dd: YearReturns['dd'] = {
    eqHome: iso === 'USA' ? ddAt(m.eq.USA, y) : own ? ddAt(own, y) : ddAt(m.world, y),
    eqUS: ddAt(m.eq.USA, y), eqWorld: ddAt(m.world, y), gold: ddAt(m.gold, y), btc: ddAt(m.btc, y),
  };
  const real = Object.fromEntries(PRICE_ASSETS.map((a) => [a, nomHome[a] == null ? null : (1 + nomHome[a]!) / (1 + piH) - 1])) as YearReturns['real'];
  const btcEst = !!m.btc.unverified?.includes(y) || !!m.btc.unverified?.includes(y - 1);
  const est = { eqHome: homeEst || (fx.est && homeSrc === 'proxy_world'), eqUS: fx.est || !!m.eq.USA?.est, eqWorld: fx.est || !!m.world.est, gold: fx.est, btc: fx.est || btcEst };
  return { real, nomHome, dd, est, homeSrc, fxEst: fx.est, piHome: piH };
}

/** BTC future model (config BTC_FUTURE_*): volatility scale for future year t (1 at the last data year, halving every HALFLIFE years, floored). */
export const btcVolFactor = (t: number) => Math.max(BTC_FUTURE_VOL_FLOOR, Math.pow(0.5, (t - LAST_DATA_YEAR) / BTC_FUTURE_VOL_HALFLIFE));
const muCache = new Map<string, number>();
/** mean real log BTC return over the bootstrap pool, in this country's purchasing power */
export function btcPoolMean(c: ReturnCtx): number {
  const hit = muCache.get(c.iso); if (hit !== undefined) return hit;
  let s = 0, n = 0;
  for (let y = BTC_BOOT_FROM; y <= LAST_DATA_YEAR; y++) { const r = historical(c, y).real.btc; if (r != null) { s += Math.log(1 + r); n++; } }
  const mu = n ? s / n : 0; muCache.set(c.iso, mu); return mu;
}

export function yearReturns(c: ReturnCtx): YearReturns {
  if (c.year <= LAST_DATA_YEAR) return historical(c, c.year);
  // future: bootstrap one historical year (real returns of that year, home-country inflation of that year)
  const u = c.u();
  const yb = BOOT_FROM + Math.floor(u * (LAST_DATA_YEAR - BOOT_FROM + 1));
  const h = historical(c, yb);
  const own = c.m.eq[c.iso];
  if (h.real.eqHome == null && own) { // home series starts after yb → map u into its own range
    const lo = own.from + 1, yh = lo + Math.floor(u * (lastYear(own) - lo + 1));
    const hh = historical(c, yh); h.real.eqHome = hh.real.eqHome; h.nomHome.eqHome = hh.nomHome.eqHome; h.dd.eqHome = hh.dd.eqHome;
  }
  const yBtc = BTC_BOOT_FROM + Math.floor(u * (LAST_DATA_YEAR - BTC_BOOT_FROM + 1));
  const hb = historical(c, yBtc); h.real.btc = hb.real.btc; h.nomHome.btc = hb.nomHome.btc; h.dd.btc = hb.dd.btc;
  if (BTC_FUTURE_DAMPENED && hb.real.btc != null) {
    const mu = btcPoolMean(c), v = btcVolFactor(c.year);
    const l = mu * BTC_FUTURE_MEAN_SCALE + (Math.log(1 + hb.real.btc) - mu) * v;
    h.real.btc = Math.exp(l) - 1;
    h.nomHome.btc = (1 + h.real.btc) * (1 + h.piHome) - 1;
    if (h.dd.btc != null) h.dd.btc = Math.pow(1 + h.dd.btc, v) - 1;
  }
  for (const a of PRICE_ASSETS) h.est[a] = true;
  return { ...h, bootYear: yb };
}

/** step 2: minimum of a Brownian bridge (log-price) from 0 to x=log(1+r) with annual volatility σ. Returns r_min ≤ min(0, r). */
export function bridgeMinReturn(r: number, sigma: number, u: number): number {
  const x = Math.log(1 + r);
  const m = (x - Math.sqrt(x * x - 2 * sigma * sigma * Math.log(1 - u))) / 2;
  return Math.exp(Math.min(m, 0, x)) - 1;
}

/** step 2 intra-year low: the recorded monthly drawdown × DRAWDOWN_SAFETY_FACTOR (推估, ) when the series has one,
 *  else the Brownian bridge. Clamped above −99%. */
export function intraYearMin(r: number, dd: number | null | undefined, sigma: number, u: number, factor = DRAWDOWN_SAFETY_FACTOR): number {
  return dd != null ? Math.max(-0.99, Math.min(dd * factor, r, 0)) : bridgeMinReturn(r, sigma, u);
}

/** Annual-AVERAGE series understate point-to-point volatility: for a random walk, Var(Δ avg) ≈ (2/3)·Var(Δ point)
 *  (Working 1960, "Note on the correlation of first differences of averages in a random chain") → scale σ by √(3/2). */
export const AVG_SIGMA_CORR = Math.sqrt(1.5);
export function sigmaOf(m: MarketsData, a: PriceAsset, iso: string): number {
  const avg = (k: string | undefined) => (k === 'oecd_avg' || k === 'annual_avg' ? AVG_SIGMA_CORR : 1) // year-end series (dec_monthly, close, world built from year-end levels) need no correction;
  if (a === 'eqHome') {
    if (iso === 'USA') return m.sigma.eqUS * avg(m.eq.USA!.kind);
    const s = m.eq[iso];
    return s ? (m.sigma.eqHome[iso] ?? m.sigma.eqHomeMedian) * avg(s.kind) : m.sigma.eqWorld * avg(m.world.kind);
  }
  if (a === 'eqUS') return m.sigma.eqUS * avg(m.eq.USA!.kind);
  if (a === 'eqWorld') return m.sigma.eqWorld * avg(m.world.kind);
  if (a === 'gold') return m.sigma.gold * avg(m.gold.kind);
  return m.sigma.btc;
}

/** Nominal lending rate (WDI FR.INR.LEND) used for margin loans / mortgages / credit base; fallback flagged. */
export function lendingRate(m: MarketsData, iso: string, y: number, pi: (iso: string, y: number) => number): { i: number; est: boolean } {
  const yy = Math.min(y, LAST_DATA_YEAR);
  const v = denseAt(m.lend[iso], yy);
  if (v != null && y <= LAST_DATA_YEAR) return { i: v, est: false };
  const s = m.lend[iso];
  if (s) { // nearest observed year of the same country
    let best: number | null = null, bd = Infinity;
    s.v.forEach((x, k) => { if (x != null && Math.abs(s.from + k - yy) < bd) { bd = Math.abs(s.from + k - yy); best = x; } });
    if (best != null) return { i: best, est: true };
  }
  const us = lendingRate(m, 'USA', y, pi).i;
  return { i: Math.max(0, us + pi(iso, y) - pi('USA', y)), est: true };
}
