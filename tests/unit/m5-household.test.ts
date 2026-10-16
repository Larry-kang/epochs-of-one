import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { seriesAt } from '../../src/engine/data/types.ts';
import { pmt, creditRule, toLocalNominal, annuityFactor, annuityPayout, houseReturn, pensionFor } from '../../src/engine/finance/credit.ts';
import { newLife, advanceYear, applyAction, decisionQuote, runLife, tableFor, type LifeConfig, type DataBundle } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';
import { PARAMS } from '../../src/engine/params.ts';

const data = loadBundleFromDisk();
const m = data.markets!, hp = data.hp!;
const piUS = (y: number) => seriesAt(data.country('USA').series.cpi, y).v;
const cfgFor = (iso: string, year: number, seed: string, q: 1 | 2 | 3 | 4 | 5 = 4): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't',
  constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'fixed', value: 'M' }, quintile: { kind: 'fixed', value: q }, urban: { kind: 'fixed', value: true } } });
/** First seed (base, base~1, base~2, …) whose life reaches `age` — tests need survivors, mortality is not under test here. */
function lifeTo(d: DataBundle, cfg: LifeConfig, age: number): LifeState {
  for (let k = 0; k < 50; k++) {
    let s = newLife(d, { ...cfg, seed: k ? `${cfg.seed}~${k}` : cfg.seed }); if ('infeasible' in s) throw new Error('infeasible');
    while (!s.death && s.age < age) s = advanceYear(d, s);
    if (!s.death) return s;
  }
  throw new Error('no survivor to ' + age);
}

describe('M5 tests (credit rules)', () => {
  it('TWN monthly income 40,000 → L_max = 880,000 (DBR22, no other unsecured debt)', () => {
    expect(creditRule(m, 'TWN', 2024, 480000, 0, piUS).cap).toBeCloseTo(880000, 6);
    expect(creditRule(m, 'TWN', 2024, 480000, 0, piUS).src).toBe('official');
    expect(creditRule(m, 'TWN', 2000, 480000, 0, piUS).src).toBe('proxy'); // before DBR22 → capProxy (推估)
  });
  it('JPN annual income 3,000,000 → cap 1,000,000 (総量規制, from 2010)', () => {
    expect(creditRule(m, 'JPN', 2015, 3e6, 0, piUS).cap).toBeCloseTo(1e6, 6);
  });
  it('SGP (MAS / , ): < S$20k not eligible; S$25k → 2 months ≈ S$4,167; S$60k → 4 months = S$20k', () => {
    const perReal = toLocalNominal(m, 'SGP', 2024, 1, piUS).v;
    expect(creditRule(m, 'SGP', 2024, 19000 / perReal, 0, piUS).minIncomeOk).toBe(false);
    const r25 = creditRule(m, 'SGP', 2024, 25000 / perReal, 0, piUS);
    expect(r25.minIncomeOk).not.toBe(false);
    expect(r25.cap * perReal).toBeCloseTo(25000 / 6, 3);
    const r60 = creditRule(m, 'SGP', 2024, 60000 / perReal, 0, piUS);
    expect(r60.cap * perReal).toBeCloseTo(20000, 3);
  });
  it('disabled countries and pre-1970 years cannot borrow', () => {
    expect(creditRule(m, 'HKG', 2020, 1e5, 0, piUS).enabled).toBe(false);
    expect(creditRule(m, 'USA', 1965, 1e5, 0, piUS).enabled).toBe(false);
    expect(creditRule(m, 'USA', 1990, 1e5, 0, piUS)).toMatchObject({ enabled: true, src: 'proxy' });
  });
  it('property: higher rate → payment never decreases; PMT·n ≥ principal for r ≥ 0', () => {
    fc.assert(fc.property(fc.double({ min: 1, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 0.5, noNaN: true }), fc.double({ min: 0, max: 0.2, noNaN: true }), fc.integer({ min: 1, max: 30 }), (L, r, dr, n) =>
      pmt(L, r + dr, n) >= pmt(L, r, n) - 1e-9 && pmt(L, r, n) * n >= L - 1e-6));
  });
});

describe('M5 pension & annuity', () => {
  it('retirement age and replacement rate come from OECD PaG; others use the OECD median (推估)', () => {
    const jp = pensionFor(hp, 'JPN', 'M'); expect(jp.est).toBe(false); expect(jp.age).toBe(Math.round(hp.pension.JPN!.ageM));
    const ng = pensionFor(hp, 'NGA', 'F'); expect(ng.est).toBe(true); expect(ng.grr).toBe(hp.pensionMedian.grrF);
  });
  it('retired person receives GRR × average lifetime earnings', () => {
    const s = lifeTo(data, cfgFor('DEU', 1950, 'pen-1'), 75);
    const row = s.years.find((y) => y.age === pensionFor(hp, 'DEU', 'M').age + 2)!;
    expect(row.inLabor).toBe(false);
    expect(row.pension).toBeCloseTo(hp.pension.DEU!.grrM * (s.econ.earnSum / s.econ.earnN), 6);
    expect(s.events.some((e) => e.id === 'retire')).toBe(true);
  });
  it('annuity factor: r=0 and no mortality → remaining years; fair premium buys ä⁻¹ per unit', () => {
    const p = new Array(121).fill(0); p[120] = 1;
    expect(annuityFactor(p, 60, 0)).toBeCloseTo(61, 9);
    const s = lifeTo(data, cfgFor('USA', 1950, 'ann-1'), 66);
    const t = tableFor(data, s).p;
    expect(annuityPayout(1000, t, 66) * annuityFactor(t, 66) * (1 + PARAMS.annuityLoad.value)).toBeCloseTo(1000, 6);
  });
  it('buying an annuity moves cash into a lifelong payout, recorded as an action', () => {
    const s = lifeTo(data, cfgFor('USA', 1950, 'ann-1'), 66);
    const q = decisionQuote(data, s);
    expect(q.annuity.ok).toBe(true);
    const amt = Math.floor(q.annuity.max / 2);
    const s2 = applyAction(data, s, { t: 'annuity', age: s.age, amount: amt });
    expect(s2.econ.cash).toBeCloseTo(s.econ.cash - amt, 6);
    expect(s2.econ.annuity).toBeCloseTo(q.annuity.per1000 * amt / 1000, 6);
    const s3 = advanceYear(data, s2);
    expect(s3.years.at(-1)!.income).toBeCloseTo(advanceYear(data, s).years.at(-1)!.income + s2.econ.annuity, 6);
  });
});

describe('M5 house & mortgage', () => {
  it('house value follows the OECD real house price index; no series → OECD median (推估)', () => {
    const us = hp.house.USA!; const i = 2010 - us.from;
    expect(houseReturn(hp, 'USA', 2010, 0.5)).toEqual({ r: us.v[i]! / us.v[i - 1]! - 1, est: false });
    expect(houseReturn(hp, 'NGA', 2010, 0.5).est).toBe(true);
    expect(houseReturn(hp, 'USA', 2050, 0.5).est).toBe(true);
  });
  it('buy → down payment from cash, mortgage amortises to 0 by the end of the term (if paid)', () => {
    let s = lifeTo(data, cfgFor('USA', 1960, 'house-1', 5), 35);
    const q = decisionQuote(data, s);
    if (!q.house.ok) throw new Error('cannot buy: ' + q.house.why);
    s = applyAction(data, s, { t: 'buyHouse', age: s.age });
    expect(s.house!.balance).toBeCloseTo(PARAMS.ltv.value * q.house.price, 6);
    for (let k = 0; k < PARAMS.mortgageTerm.value && !s.death; k++) s = advanceYear(data, s);
    if (!s.death && s.house) { expect(s.house.balance).toBeLessThan(1e-6); expect(s.events.some((e) => e.id === 'mortgagePaid')).toBe(true); }
  });
  it('cannot buy without a down payment / job; actions that are invalid are ignored (not recorded)', () => {
    const s = lifeTo(data, cfgFor('USA', 1990, 'house-2', 1), 20);
    const s2 = { ...s, econ: { ...s.econ, cash: 0 } };
    expect(decisionQuote(data, s2).house.ok).toBe(false);
    expect(applyAction(data, s2, { t: 'buyHouse', age: s2.age })).toBe(s2);
  });
});

describe('M5 credit loans: normal mode, bridging, default', () => {
  it('normal-mode loan: cash up by principal, PMT per , floating rate recomputed yearly', () => {
    let s = lifeTo(data, cfgFor('TWN', 1980, 'loan-1', 4), 30);
    const q = decisionQuote(data, s);
    expect(q.loan.ok).toBe(true);
    const amt = Math.floor(q.loan.max / 2);
    const s2 = applyAction(data, s, { t: 'loan', age: s.age, amount: amt, term: 5, purpose: 'cash' });
    expect(s2.econ.cash).toBeCloseTo(s.econ.cash + amt, 6);
    expect(s2.loans[0]!.pmt).toBeCloseTo(pmt(amt, q.loan.rate, 5), 6);
    expect(q.loan.rate).toBeLessThanOrEqual(0.2); // TWN legal cap
    s = s2;
    for (let k = 0; k < 6 && !s.death; k++) s = advanceYear(data, s);
    expect(s.years.slice(-6).some((y) => y.debtService > 0)).toBe(true);
  });
  it('requested amount is clipped to the cap; ineligible (age/unemployed/frozen) loans are ignored', () => {
    const s = lifeTo(data, cfgFor('TWN', 1980, 'loan-1', 4), 30);
    const q = decisionQuote(data, s);
    const s2 = applyAction(data, s, { t: 'loan', age: s.age, amount: q.loan.max * 10, term: 5, purpose: 'invest' });
    expect(s2.loans[0]!.principal).toBeCloseTo(q.loan.max, 6);
    const frozen = { ...s, credit: { ...s.credit, frozenUntil: s.born.year + s.age + 3 } };
    expect(decisionQuote(data, frozen).loan.why).toBe('frozen');
    expect(applyAction(data, frozen, { t: 'loan', age: s.age, amount: 100, term: 5, purpose: 'cash' })).toBe(frozen);
  });
  it('default path: two missed payments → written off, garnished, credit frozen (job loss + crash)', () => {
    let s = lifeTo(data, cfgFor('USA', 1970, 'def-1', 3), 30);
    const q = decisionQuote(data, s);
    s = applyAction(data, s, { t: 'loan', age: s.age, amount: q.loan.max, term: 3, purpose: 'cash' });
    // force distress: zero cash, no income for a few years (simulate by hacking state after the loan)
    s = { ...s, econ: { ...s.econ, cash: -1e6 } };
    for (let k = 0; k < 3 && !s.death; k++) s = advanceYear(data, { ...s, econ: { ...s.econ, cash: Math.min(s.econ.cash, -1e6) } });
    const ids = s.events.map((e) => e.id);
    expect(ids).toContain('paymentMissed');
    expect(ids).toContain('loanDefault');
    expect(s.credit.defaults).toBeGreaterThanOrEqual(1);
    expect(s.credit.unsecuredDebt).toBeGreaterThan(0);
    expect(s.credit.frozenUntil).toBeGreaterThan(s.born.year + s.age);
    expect(decisionQuote(data, s).loan.why).toBe('frozen');
  });
  it('property: leveraged + borrowed + job loss → default occurs with P > 0 (200 low-income US lives)', () => {
    let defaults = 0;
    for (let i = 0; i < 200; i++) {
      let s = newLife(data, cfgFor('USA', 1945 + (i % 40), 'dp-' + i, 1)); if ('infeasible' in s) continue;
      while (!s.death && s.age < 25) s = advanceYear(data, s);
      if (s.death) continue;
      s = applyAction(data, s, { t: 'alloc', age: 25, target: { levEq: 1 }, levBase: 'eqUS' });
      for (let k = 0; k < 40 && !s.death; k++) {
        const q = decisionQuote(data, s);
        if (q.loan.ok && !s.loans.some((l) => l.status === 'active')) s = applyAction(data, s, { t: 'loan', age: s.age, amount: q.loan.max, term: 1, purpose: 'invest' });
        s = advanceYear(data, s, contentEvents);
      }
      defaults += s.events.filter((e) => e.id === 'loanDefault').length;
    }
    expect(defaults).toBeGreaterThan(0);
  });
  it('bridging: when cash is negative the quote offers a bridge amount; accepting restores cash', () => {
    let s = lifeTo(data, cfgFor('USA', 1980, 'br-1', 3), 30);
    s = { ...s, econ: { ...s.econ, cash: -5000 } };
    const q = decisionQuote(data, s);
    expect(q.loan.bridgeNeed).toBe(5000);
    if (q.loan.ok) {
      const s2 = applyAction(data, s, { t: 'loan', age: s.age, amount: Math.min(q.loan.max, q.loan.bridgeNeed), term: 3, purpose: 'bridge' });
      expect(s2.loans[0]!.purpose).toBe('bridge');
      expect(s2.econ.cash).toBeGreaterThan(s.econ.cash);
    }
  });
});

describe('M5 integration', () => {
  it('replay with house/loan/annuity actions is deterministic; net worth identity holds; no NaN', () => {
    const cfg = cfgFor('JPN', 1955, 'm5-int', 4);
    const acts = [
      { t: 'alloc' as const, age: 25, target: { eqHome: 0.3, eqWorld: 0.3 } },
      { t: 'buyHouse' as const, age: 35 },
      { t: 'loan' as const, age: 40, amount: 1e9, term: 5, purpose: 'invest' as const },
      { t: 'annuity' as const, age: 66, amount: 20000 },
    ];
    const a = runLife(data, cfg, contentEvents, acts), b = runLife(data, cfg, contentEvents, acts);
    if ('infeasible' in a || 'infeasible' in b) throw new Error();
    expect(a.years).toEqual(b.years);
    for (const y of a.years) {
      expect(Number.isFinite(y.netWorth)).toBe(true);
      expect(y.netWorth).toBeCloseTo(y.cash + y.invested + y.houseEquity - y.debt, 6);
    }
  });
  it('household systems never change mortality', () => {
    const cfg = cfgFor('KOR', 1960, 'm5-mort', 2);
    const a = runLife(data, cfg, contentEvents, [{ t: 'buyHouse', age: 30 }, { t: 'loan', age: 31, amount: 1e9, term: 7, purpose: 'cash' }]);
    const b = runLife(data, cfg, contentEvents);
    if ('infeasible' in a || 'infeasible' in b) throw new Error();
    expect(a.death).toEqual(b.death);
  });
});
