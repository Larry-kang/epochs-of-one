import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { seriesAt } from '../../src/engine/data/types.ts';
import { settleCash } from '../../src/engine/finance/types.ts';
import { available } from '../../src/engine/finance/access.ts';
import { yearReturns, bridgeMinReturn, intraYearMin, fxFactor, LAST_DATA_YEAR, lendingRate, sigmaOf } from '../../src/engine/finance/returns.ts';
import { marketStep, rebalanceStep, emptyPortfolio, investedValue, type Portfolio } from '../../src/engine/finance/portfolio.ts';
import type { MarketsData } from '../../src/engine/finance/marketData.ts';
import { runLife, newLife, advanceYear, applyAction, type LifeConfig } from '../../src/engine/life/sim.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';
import { PARAMS } from '../../src/engine/params.ts';
import { DRAWDOWN_SAFETY_FACTOR } from '../../src/config.ts';

const data = loadBundleFromDisk();
const m = data.markets!;
const pi = (iso: string, y: number) => seriesAt(data.country(iso).series.cpi, y).v;
const R = (iso: string, year: number, u = 0.5) => yearReturns({ m, iso, year, pi, u: () => u });

describe('M4 data layer', () => {
  it('has equities, world, gold, BTC with the expected spans and no NaN', () => {
    expect(m.eq.USA!.from).toBeLessThanOrEqual(1960);
    expect(m.world.from).toBe(1960);
    expect(m.gold.from).toBe(1960);
    expect(m.btc.from).toBe(2011); // BTC 2010 stays off (owner decision)
    expect(m.eq.TWN!.src).toBe('epochs-compiled');
    for (const s of [...Object.values(m.eq), m.world, m.gold, m.btc]) for (const v of s.v) expect(Number.isFinite(v) && v > 0).toBe(true);
    expect(m.fxEuroRebased).toContain('DEU');
  });
  it('world index has no redenomination artefacts (|annual USD return| < 80%)', () => {
    const w = m.world.v; for (let i = 1; i < w.length; i++) expect(Math.abs(w[i]! / w[i - 1]! - 1)).toBeLessThan(0.8);
  });
});

describe('M4 tests', () => {
  it('(5) nominal 0% cash with π=10% → real −9.09%', () => {
    expect(settleCash({ cash: 100, income: 0, consumption: 0, inflation: 0.1 }) / 100 - 1).toBeCloseTo(-0.090909, 5);
  });
  it('(1) USA: eqHome ≡ eqUS every year', () => {
    for (let y = 1958; y <= LAST_DATA_YEAR; y++) { const r = R('USA', y); expect(r.real.eqHome).toBe(r.real.eqUS); }
  });
  it('(2) fixed FX → foreign home-currency return equals the USD return', () => {
    const fixed: MarketsData = { ...m, fx: { ...m.fx, XFX: { from: 1990, v: Array(40).fill(7.8) } } };
    const r = yearReturns({ m: fixed, iso: 'XFX', year: 2010, pi: () => 0, u: () => 0.5 });
    expect(fxFactor(fixed, 'XFX', 2010, () => 0).f).toBe(1);
    expect(r.nomHome.eqUS).toBeCloseTo(m.eq.USA!.v[2010 - m.eq.USA!.from]! / m.eq.USA!.v[2009 - m.eq.USA!.from]! - 1, 12);
  });
  it('(3) TWN resident cannot buy US/world assets before 1987 (outbound rule), can from 1987', () => {
    expect(available(m, 'eqUS', 'TWN', 1986, 30)).toMatchObject({ ok: false, why: 'outbound' });
    expect(available(m, 'eqUS', 'TWN', 1987, 30).ok).toBe(true);
    expect(available(m, 'eqHome', 'TWN', 1986, 30).ok).toBe(true);
  });
  it('(4) proxy / unverified years are flagged 推估', () => {
    expect(R('TWN', 1970).est.eqHome).toBe(true);             // TAIEX 1967–1997 single-source
    expect(R('TWN', 2015).est.eqHome).toBe(false);            // TWSE official + cross-checks
    const nga = R('NGA', 2010); expect(nga.homeSrc).toBe('proxy_world'); expect(nga.est.eqHome).toBe(true);
    expect(R('TWN', 2015).est.eqUS).toBe(true);               // TWN has no WDI FX → relative-PPP FX
  });
});

describe('M4 access rules', () => {
  it('age < 18 cannot invest; BTC from 2011 only; CHN home index only from its data start', () => {
    expect(available(m, 'eqUS', 'USA', 2000, 17).why).toBe('age');
    expect(available(m, 'btc', 'USA', 2010, 30).ok).toBe(false);
    expect(available(m, 'btc', 'USA', 2011, 30).ok).toBe(true);
    expect(available(m, 'eqHome', 'CHN', 1985, 30).ok).toBe(false);
    expect(available(m, 'gold', 'USA', 1970, 30).why).toBe('ban');
    expect(available(m, 'gold', 'USA', 1975, 30).ok).toBe(true);
  });
  it('no exchange (no index and no listed companies) → eqHome not investable (not proxied)', () => {
    const iso = data.index.countries.map((c) => c.iso).find((i) => !m.eq[i] && m.listed[i] === undefined)!;
    expect(available(m, 'eqHome', iso, 2020, 30).why).toBe('noexchange');
  });
  it('BTC 2012 real return = (close12/close11)·FX/(1+π) − 1 for USA', () => {
    const c = (y: number) => m.btc.v[y - m.btc.from]!;
    expect(R('USA', 2012).real.btc).toBeCloseTo((c(2012) / c(2011)) / (1 + pi('USA', 2012)) - 1, 10);
  });
});

describe('M4 leverage ', () => {
  const base = (): Portfolio => ({ ...emptyPortfolio(), levBase: 'eqUS', lev: { A: 2, L: 1 } });
  const fakeRet = (r: number) => ({ real: { eqHome: r, eqUS: r, eqWorld: r, gold: r, btc: r }, nomHome: { eqHome: r, eqUS: r, eqWorld: r, gold: r, btc: r },
    dd: { eqHome: null, eqUS: null, eqWorld: null, gold: null, btc: null },
    est: { eqHome: false, eqUS: false, eqWorld: false, gold: false, btc: false }, homeSrc: 'data' as const, fxEst: false, piHome: 0 });
  it('margin call exactly at the maintenance boundary (k=2, m=0.25, i=0, u→0 ⇒ r_min = min(0,r))', () => {
    // equity/asset at low = (2(1+r) − 1)/(2(1+r)) < 0.25  ⇔  r < −1/3
    const call = marketStep({ p: base(), cash: 0, ret: fakeRet(-0.34), marginRate: 0, piHome: 0, uMin: 0, sigmaBase: 0.2, calYear: 2000 });
    expect(call.events[0]?.id).toBe('marginCall'); expect(call.p.lev).toBeUndefined();
    expect(call.p.cooldownUntil).toBe(2001 + PARAMS.levCooldown.value);
    expect(call.cash).toBeCloseTo(2 * 0.66 * (1 - PARAMS.levSlippage.value) - 1, 10);
    const ok = marketStep({ p: base(), cash: 0, ret: fakeRet(-0.33), marginRate: 0, piHome: 0, uMin: 0, sigmaBase: 0.2, calYear: 2000 });
    expect(ok.events).toHaveLength(0); expect(ok.p.lev!.A).toBeCloseTo(1.34, 10);
  });
  it('an up year can still margin-call if the intra-year low is deep (Brownian bridge)', () => {
    const r = marketStep({ p: base(), cash: 0, ret: fakeRet(0.05), marginRate: 0.05, piHome: 0, uMin: 0.9999, sigmaBase: 0.6, calYear: 2000 });
    expect(r.events[0]?.id).toBe('marginCall');
  });
  it('bridge minimum ≤ min(0, r) and > −1 (property)', () => {
    fc.assert(fc.property(fc.double({ min: -0.9, max: 3, noNaN: true }), fc.double({ min: 0.01, max: 1.5, noNaN: true }), fc.double({ min: 0, max: 0.999999, noNaN: true }), (r, s, u) => {
      const x = bridgeMinReturn(r, s, u); return x <= Math.min(0, r) + 1e-12 && x > -1;
    }));
  });
  it('cooldown blocks reopening leverage', () => {
    expect(available(m, 'levEq', 'USA', 2002, 40, { levBase: 'eqUS', cooldownUntil: 2004 }).why).toBe('cooldown');
    expect(available(m, 'levEq', 'USA', 2004, 40, { levBase: 'eqUS', cooldownUntil: 2004 }).ok).toBe(true);
  });
  it('US stress-path backtest 1960–2025 (synthetic fixture), k=2, m=0.25 at u=0.5 and u=0.9: margin-call years', () => {
    const out: Record<string, number[]> = {};
    for (const u of [0.5, 0.9]) out['u' + u] = backtest(u);
    expect(out).toMatchSnapshot();
  });
  it('recorded monthly drawdown overrides the bridge (dd present → r_min = min(dd×factor, r, 0), independent of u)', () => {
    const ret = { ...fakeRet(0.05), dd: { eqHome: -0.4, eqUS: -0.4, eqWorld: -0.4, gold: -0.4, btc: null } };
    for (const u of [0, 0.5, 0.9999]) expect(marketStep({ p: base(), cash: 0, ret, marginRate: 0, piHome: 0, uMin: u, sigmaBase: 0.01, calYear: 2000 }).events[0]?.id).toBe('marginCall');
    expect(intraYearMin(0.05, -0.1, 0.2, 0.99)).toBeCloseTo(-0.1 * DRAWDOWN_SAFETY_FACTOR, 12); expect(intraYearMin(-0.2, -0.1, 0.2, 0.99)).toBe(-0.2);
    expect(DRAWDOWN_SAFETY_FACTOR).toBe(1.25); expect(intraYearMin(0, -0.9, 0.2, 0.5)).toBe(-0.99);
  });
  it('year-end series (v0.10.0): US/world equity = 推估 nominal-GDP model without an intra-year path; gold keeps Pink Sheet monthly dd', () => {
    expect(m.eq.USA!.kind).toBe('model_ngdp'); expect(m.eq.USA!.est).toBe(true); expect(m.world.kind).toBe('model_ngdp');
    expect(m.eq.USA!.dd!.every((x) => x === null)).toBe(true);  // no path → Brownian bridge with the design σ
    expect(sigmaOf(m, 'eqUS', 'USA')).toBe(0.16);
    expect(R('USA', 2008).est.eqUS).toBe(true); expect(R('DEU', 2008).est.eqWorld).toBe(true);
    expect(m.gold.kind).toBe('dec_monthly'); expect(m.gold.dd!.some((x) => x != null && x < -0.1)).toBe(true);
    expect(m.eq.TWN!.dd!.every((x) => x === null)).toBe(true); // annual closes only → bridge fallback
  });
  // Leverage acceptance on a SYNTHETIC stress path (the real US index is no longer shipped: no open licence). Crash years carry
  // a recorded monthly drawdown so the ×1.25 safety-factor rule is exercised exactly as with the former OECD monthly data.
  const STRESS: Record<number, [number, number]> = { 1974: [-0.3, -0.45], 1987: [0.02, -0.35], 2000: [-0.08, -0.1], 2001: [-0.1, -0.12], 2002: [-0.2, -0.25], 2008: [-0.38, -0.48] };
  const mS: MarketsData = (() => {
    const v: number[] = [100], dd: (number | null)[] = [null];
    for (let y = 1961; y <= 2025; y++) { const [r, d] = STRESS[y] ?? [0.07, -0.06]; v.push(v.at(-1)! * (1 + r)); dd.push(d); }
    return { ...m, eq: { ...m.eq, USA: { from: 1960, v, dd, kind: 'dec_monthly', src: 'test-fixture' } } };
  })();
  const RS = (y: number, u = 0.5) => yearReturns({ m: mS, iso: 'USA', year: y, pi, u: () => u });
  const line = (y: number) => (1 + lendingRate(m, 'USA', y, pi).i) / (2 * (1 - PARAMS.levMaint.value)) - 1; // A=2, L=1
  const scaled = (y: number) => mS.eq.USA!.dd![y - 1960]! * DRAWDOWN_SAFETY_FACTOR;
  it('backtest acceptance (×1.25 safety factor, ): fresh 2× each year is liquidated in stress years 1974, 1987 and 2008 at any bridge quantile', () => {
    for (const u of [0, 0.5, 0.9]) { const c = backtest(u); for (const y of [1974, 1987, 2008]) expect(c).toContain(y); }
    for (const y of [1974, 1987, 2008]) expect(scaled(y)).toBeLessThan(line(y));
  });
  it('backtest acceptance: 2× opened end-1999 and held without re-levering is liquidated in 2002', () => {
    let p: Portfolio = { ...emptyPortfolio(), levBase: 'eqUS', lev: { A: 2, L: 1 } };
    const hit: number[] = [];
    for (let y = 2000; y <= 2002 && p.lev; y++) {
      const out = marketStep({ p, cash: 0, ret: RS(y), marginRate: lendingRate(m, 'USA', y, pi).i, piHome: pi('USA', y), uMin: 0.5, sigmaBase: sigmaOf(mS, 'eqUS', 'USA'), calYear: y });
      if (out.events.some((e) => e.id === 'marginCall')) hit.push(y);
      p = out.p;
    }
    expect(hit).toEqual([2002]);
  });
  it('counter-examples: fresh 2× is NOT liquidated in normal years 2011, 2015, 2018', () => {
    const c = backtest(0.5);
    for (const y of [2011, 2015, 2018]) { expect(c).not.toContain(y); expect(scaled(y)).toBeGreaterThan(line(y)); }
  });
  function backtest(u: number): number[] {
    const calls: number[] = [];
    let p: Portfolio = { ...emptyPortfolio(), levBase: 'eqUS', lev: { A: 2, L: 1 } };
    for (let y = 1960; y <= 2025; y++) {
      const ret = RS(y, u);
      const out = marketStep({ p, cash: 0, ret, marginRate: lendingRate(m, 'USA', y, pi).i, piHome: pi('USA', y), uMin: u, sigmaBase: sigmaOf(mS, 'eqUS', 'USA'), calYear: y });
      if (out.events.some((e) => e.id === 'marginCall')) calls.push(y);
      p = { ...out.p, lev: { A: 2, L: 1 }, cooldownUntil: undefined }; // reopen at k=2 every year to test each year independently
    }
    return calls;
  }
});

describe('M4 rebalance & liquidity', () => {
  it('rebalances to target weights; unbuyable targeted sleeves are frozen, not sold', () => {
    const p: Portfolio = { ...emptyPortfolio(), target: { eqUS: 0.5, btc: 0.2 }, hold: { btc: 10 }, basis: { btc: 5 } };
    const r = rebalanceStep(p, 90, (a) => a !== 'btc');
    expect(r.p.hold.eqUS).toBeCloseTo(45); expect(r.p.hold.btc).toBe(10); expect(r.cash).toBeCloseTo(45);
  });
  it('negative cash is covered by selling holdings first', () => {
    const p: Portfolio = { ...emptyPortfolio(), target: {}, hold: { gold: 50 }, basis: { gold: 50 } };
    const r = rebalanceStep(p, -20, () => true);
    expect(r.events[0]?.id).toBe('forcedSale'); expect(r.cash).toBeCloseTo(30); expect(investedValue(r.p)).toBe(0);
  });
});

describe('M4 future years & wage lag', () => {
  it('future years bootstrap a historical year (deterministic, all 推估)', () => {
    const a = R('JPN', 2040, 0.31), b = R('JPN', 2040, 0.31);
    expect(a).toEqual(b); expect(a.bootYear).toBeGreaterThanOrEqual(1991); expect(Object.values(a.est).every(Boolean)).toBe(true);
    expect(a.real.btc).not.toBeNull();
  });
  it('wage lag: real labour income factor (1+λπ)/(1+π) in an inflation year', () => {
    const cfg: LifeConfig = { seed: 'wl', era: { kind: 'past', year: 1960 }, nowYear: 2026, engineVersion: 't',
      constraints: { country: { kind: 'fixed', value: 'ARG' }, sex: { kind: 'random' }, quintile: { kind: 'fixed', value: 3 }, urban: { kind: 'fixed', value: true } } };
    let s = newLife(data, cfg); if ('infeasible' in s) throw new Error();
    let found = false;
    while (!s.death && s.age < 60 && !found) {
      s = advanceYear(data, s);
      const row = s.years.at(-1)!;
      if (row.inLabor && !row.unemployed && row.inflation > 0.1 && s.career.lastWage > 0 && row.income > 0) {
        const lam = PARAMS.wageLag.value;
        // income booked this year = real wage × lag factor (lastWage holds the un-lagged wage)
        expect(row.income / s.career.lastWage).toBeCloseTo((1 + lam * row.inflation) / (1 + row.inflation), 6);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('M4 engine integration', () => {
  const cfg: LifeConfig = { seed: 'm4-int', era: { kind: 'past', year: 1960 }, nowYear: 2026, engineVersion: 't',
    constraints: { country: { kind: 'fixed', value: 'USA' }, sex: { kind: 'fixed', value: 'F' }, quintile: { kind: 'fixed', value: 4 }, urban: { kind: 'fixed', value: true } } };
  const acts = [{ t: 'alloc' as const, age: 25, target: { eqUS: 0.5, eqWorld: 0.2, gold: 0.1 } }, { t: 'alloc' as const, age: 40, target: { eqUS: 0.4, levEq: 0.2 }, levBase: 'eqUS' as const }];
  it('replay with recorded actions is deterministic and finite', () => {
    const a = runLife(data, cfg, contentEvents, acts), b = runLife(data, cfg, contentEvents, acts);
    if ('infeasible' in a || 'infeasible' in b) throw new Error();
    expect(a.years.map((y) => y.netWorth)).toEqual(b.years.map((y) => y.netWorth));
    for (const y of a.years) { expect(Number.isFinite(y.netWorth)).toBe(true); expect(y.netWorth).toBeCloseTo(y.cash + y.invested, 6); }
    expect(a.actions.filter((x) => x.t === 'alloc')).toHaveLength(acts.filter((x) => x.age <= a.death!.age).length);
  });
  it('investing changes outcomes vs cash-only but not mortality/events', () => {
    const inv = runLife(data, cfg, contentEvents, acts), cash = runLife(data, cfg, contentEvents);
    if ('infeasible' in inv || 'infeasible' in cash) throw new Error();
    expect(inv.death).toEqual(cash.death);
    expect(inv.events.filter((e) => !['marginCall', 'forcedSale', 'levClosed'].includes(e.id)).map((e) => e.id)).toEqual(cash.events.map((e) => e.id));
    expect(inv.years.at(-1)!.netWorth).not.toBeCloseTo(cash.years.at(-1)!.netWorth, 0);
  });
  it('applyAction records the action (replayable) and sets the target', () => {
    const s = newLife(data, cfg); if ('infeasible' in s) throw new Error();
    const s2 = applyAction(data, s, acts[0]!);
    expect(s2.portfolio.target).toEqual(acts[0]!.target); expect(s2.actions).toHaveLength(1);
  });
});
