// M4 portfolio year step. All stocks are real PPP USD.
import type { InvestAsset } from './access.ts';
import type { PriceAsset, YearReturns } from './returns.ts';
import { intraYearMin } from './returns.ts';
import { PARAMS } from '../params.ts';

export interface LevPos { A: number; L: number }
export interface Portfolio {
  /** real value held per asset (average-cost basis tracked in `basis`) */
  hold: Partial<Record<PriceAsset, number>>;
  basis: Partial<Record<PriceAsset, number>>;
  /** target weights of total investable wealth (remainder stays cash) */
  target: Partial<Record<InvestAsset, number>>;
  rebalance: boolean;
  levBase: PriceAsset; levK: number; lev?: LevPos; cooldownUntil?: number;
}
export const emptyPortfolio = (): Portfolio => ({ hold: {}, basis: {}, target: {}, rebalance: true, levBase: 'eqHome', levK: PARAMS.levK.value });

export interface FinEvent { id: 'marginCall' | 'forcedSale' | 'levClosed'; vars?: Record<string, number | string> }
export interface FinStepIn {
  p: Portfolio; cash: number; ret: YearReturns | null; marginRate: number; piHome: number;
  /** uniform draw for the intra-year Brownian-bridge minimum */
  uMin: number; sigmaBase: number; calYear: number;
  canBuy: (a: InvestAsset) => boolean;
}
export interface FinStepOut { p: Portfolio; cash: number; events: FinEvent[]; estAssets: PriceAsset[] }

export const sumHold = (p: Portfolio) => Object.values(p.hold).reduce<number>((a, b) => a + (b ?? 0), 0);
export const levEquity = (p: Portfolio) => (p.lev ? p.lev.A - p.lev.L : 0);
export const investedValue = (p: Portfolio) => sumHold(p) + levEquity(p);

/** Step 1–2: market moves on positions carried from the previous year-end (+ leverage interest / margin check). */
export function marketStep(i: Omit<FinStepIn, 'canBuy'>): FinStepOut {
  const p: Portfolio = { ...i.p, hold: { ...i.p.hold }, basis: { ...i.p.basis }, lev: i.p.lev ? { ...i.p.lev } : undefined };
  let cash = i.cash;
  const events: FinEvent[] = [], estAssets: PriceAsset[] = [];
  if (i.ret) {
    for (const [a, v] of Object.entries(p.hold) as [PriceAsset, number][]) {
      const r = i.ret.real[a];
      if (!v) continue;
      if (i.ret.est[a]) estAssets.push(a);
      p.hold[a] = v * (1 + (r ?? 0));
    }
    if (p.lev && p.lev.A > 0) {
      const R = i.ret.nomHome[p.levBase] ?? 0;
      if (i.ret.est[p.levBase]) estAssets.push(p.levBase);
      const { A, L } = p.lev;
      const rMin = intraYearMin(R, i.ret.dd?.[p.levBase], i.sigmaBase, i.uMin);
      const Amin = A * (1 + rMin);
      const Lacc = L * (1 + i.marginRate); // interest capitalised (cash-poor holders) — step 1 simplification
      if (Amin - Lacc < PARAMS.levMaint.value * Amin) {
        // step 3: liquidation at the intra-year low with slippage; residual equity (may be < 0) to cash
        const proceeds = Amin * (1 - PARAMS.levSlippage.value);
        const residual = (proceeds - Lacc) / (1 + i.piHome);
        cash += residual;
        events.push({ id: 'marginCall', vars: { loss: Math.round(A - L - residual), rMin: Math.round(rMin * 1000) / 10 } });
        p.lev = undefined;
        p.cooldownUntil = i.calYear + 1 + PARAMS.levCooldown.value;
      } else {
        p.lev = { A: (A * (1 + R)) / (1 + i.piHome), L: Lacc / (1 + i.piHome) };
      }
    }
  }
  return { p, cash, events, estAssets: [...new Set(estAssets)] };
}

/** Step 3: liquidity (sell to cover negative cash) and year-end rebalance to target weights. */
export function rebalanceStep(p0: Portfolio, cash0: number, canBuy: (a: InvestAsset) => boolean): { p: Portfolio; cash: number; events: FinEvent[] } {
  const p: Portfolio = { ...p0, hold: { ...p0.hold }, basis: { ...p0.basis }, lev: p0.lev ? { ...p0.lev } : undefined };
  let cash = cash0;
  const events: FinEvent[] = [];
  // liquidity: cover a cash deficit from holdings (pro rata), then from leveraged equity
  if (cash < 0) {
    const h = sumHold(p);
    if (h > 0) {
      const take = Math.min(h, -cash);
      for (const a of Object.keys(p.hold) as PriceAsset[]) { const share = (p.hold[a] ?? 0) / h; p.hold[a] = (p.hold[a] ?? 0) - take * share; p.basis[a] = (p.basis[a] ?? 0) * (1 - take / h); }
      cash += take;
      events.push({ id: 'forcedSale', vars: { amount: Math.round(take) } });
    }
    if (cash < 0 && p.lev && levEquity(p) > 0) {
      const e = levEquity(p); const take = Math.min(e, -cash);
      if (take >= e - 1e-9) { cash += e; p.lev = undefined; events.push({ id: 'levClosed' }); }
      else { const f = 1 - take / e; p.lev = { A: p.lev.A * f, L: p.lev.L * f }; cash += take; }
    }
  }
  if (!p.rebalance) return { p, cash, events };
  // rebalance: wealth in buyable sleeves is re-targeted; a sleeve that is targeted but no longer buyable
  // (ban, cooldown, credit freeze) is frozen as-is (it can still be sold for liquidity above)
  const tgt = (a: InvestAsset) => Math.max(0, p.target[a] ?? 0);
  const frozen = (a: InvestAsset) => tgt(a) > 0 && !canBuy(a);
  const buyable = (Object.keys(p.target) as InvestAsset[]).filter((a) => tgt(a) > 0 && canBuy(a));
  const wsum = buyable.reduce((x, a) => x + tgt(a), 0);
  const norm = wsum > 1 ? 1 / wsum : 1;
  let pool = Math.max(0, cash);
  for (const a of Object.keys(p.hold) as PriceAsset[]) if (!frozen(a)) { pool += p.hold[a] ?? 0; delete p.hold[a]; }
  if (!frozen('levEq')) { pool += levEquity(p); p.lev = undefined; }
  const negCash = Math.min(0, cash);
  const basis0 = { ...p0.basis };
  let spent = 0;
  for (const a of buyable) {
    const want = tgt(a) * norm * pool;
    if (a === 'levEq') p.lev = { A: p.levK * want, L: (p.levK - 1) * want };
    else {
      const old = p0.hold[a] ?? 0;
      p.hold[a] = want;
      p.basis[a] = want >= old ? (basis0[a] ?? 0) + (want - old) : (basis0[a] ?? 0) * (old > 0 ? want / old : 0);
    }
    spent += want;
  }
  for (const a of Object.keys(p.basis) as PriceAsset[]) if (p.hold[a] === undefined) delete p.basis[a];
  cash = pool - spent + negCash;
  return { p, cash, events };
}
