// Life engine: newLife() + advanceYear() (pure, deterministic given seed + data).
// Year systems run in fixed order: mortality draw → labor/income → events → finance → record.
import type { CountryIndex, CountryRec, Demography, Iso3 } from '../data/types.ts';
import { seriesAt } from '../data/types.ts';
import { annualTable, type AnnualTable, MAX_AGE } from '../demography/lifeTable.ts';
import { sampleBirth, sampleYear, type Birth, type BirthConstraints, NO_CONSTRAINTS, type Infeasible } from '../demography/birth.ts';
import { incomeAt, sigmaFromGini, type IncomeDist } from '../economy/income.ts';
import { stream } from '../rng/streams.ts';
import { PARAMS } from '../params.ts';
import { emptyCredit, emptyPortfolio, settleCash } from '../finance/types.ts';
import type { HousingPension, MarketsData } from '../finance/marketData.ts';
import { available, type InvestAsset } from '../finance/access.ts';
import { yearReturns, sigmaOf, lendingRate } from '../finance/returns.ts';
import { marketStep, rebalanceStep, investedValue, type Portfolio } from '../finance/portfolio.ts';
import { clampStat, type Action, type House, type LifeState, type YearRow } from './state.ts';
import type { PersonalLoan } from '../finance/types.ts';
import { pmt, creditRule, annuityPayout, houseReturn, pensionFor } from '../finance/credit.ts';
import type { EventSystem } from './events.ts';

export interface DataBundle {
  index: CountryIndex;
  country(iso: Iso3): CountryRec;
  demography(iso: Iso3): Demography;
  /** M4 market layer (optional: without it the engine runs cash-only as in M3) */
  markets?: MarketsData;
  /** M5 housing & pension layer */
  hp?: HousingPension;
}
export function makeBundle(index: CountryIndex, demo: (iso: Iso3) => Demography, extra: { markets?: MarketsData; hp?: HousingPension } = {}): DataBundle {
  const by = new Map(index.countries.map((c) => [c.iso, c]));
  const cache = new Map<Iso3, Demography>();
  return {
    index, ...extra,
    country: (iso) => { const c = by.get(iso); if (!c) throw new Error('unknown country ' + iso); return c; },
    demography: (iso) => { let d = cache.get(iso); if (!d) { d = demo(iso); cache.set(iso, d); } return d; },
  };
}

export type Era = { kind: 'now' } | { kind: 'past'; year: number | 'random' };
export interface LifeConfig { seed: string; era: Era; nowYear: number; constraints?: BirthConstraints; id?: string; engineVersion: string }

const tableCache = new Map<string, AnnualTable>();
export function tableFor(data: DataBundle, s: LifeState): AnnualTable {
  const key = `${s.born.iso}|${s.born.sex}|${s.born.lifeTableYear}`;
  let t = tableCache.get(key);
  if (!t) { t = annualTable(data.demography(s.born.iso), s.born.sex, s.born.lifeTableYear); tableCache.set(key, t); }
  return t;
}

export function incomeDist(c: CountryRec, year: number): { d: IncomeDist; est: string[] } {
  const est: string[] = [];
  const g = (k: keyof CountryRec['series']) => { const r = seriesAt(c.series[k], year); if (r.est) est.push(k); return r.v; };
  const mean = g('gdpPcPpp') * PARAMS.incomeToGdp.value;
  const gini = g('gini');
  const shares: [number, number, number, number, number] = [g('q1'), g('q2'), g('q3'), g('q4'), g('q5')];
  return { d: { mean, sigma: sigmaFromGini(gini), shares }, est: [...new Set(est.map((k) => (/^q\d$/.test(k) ? 'shares' : k)))] };
}

/** First part of the birth stream: year + birth attributes. Needs only the country index (UI uses it to preload demography). */
export function drawBirth(index: CountryIndex, cfg: LifeConfig, rng = stream(cfg.seed, 'birth')): Birth | Infeasible {
  const K = cfg.constraints ?? NO_CONSTRAINTS;
  const [b0] = index.birthYears;
  const year = cfg.era.kind === 'now' ? cfg.nowYear
    : cfg.era.year === 'random' ? sampleYear(index, b0, cfg.nowYear - 1, rng, K.country.kind === 'fixed' ? K.country.value : undefined)
    : cfg.era.year;
  return sampleBirth(index, year, K, rng);
}

export function newLife(data: DataBundle, cfg: LifeConfig): LifeState | Infeasible {
  const rng = stream(cfg.seed, 'birth');
  const b = drawBirth(data.index, cfg, rng);
  if ('infeasible' in b) return b;
  const year = b.year;
  const d = data.demography(b.iso);
  const ltYear = Math.min(Math.max(year, d.from), d.to);
  const estimated: string[] = [];
  if (ltYear !== year) estimated.push('lifeTable');
  if (b.urbanEst) estimated.push('urban');
  // initial stats: game-design content (not empirical); drawn from the birth stream
  const stats = { health: 60 + rng.int(31), happy: 50 + rng.int(31), smart: 40 + rng.int(41), social: 40 + rng.int(41) };
  const sandbox = { on: cfg.constraints !== undefined && Object.values(cfg.constraints).some((k) => k.kind === 'fixed'), reasons: [] as string[] };
  if (sandbox.on) sandbox.reasons.push('constraint');
  return {
    v: 2, id: cfg.id ?? `${cfg.seed}-${b.iso}-${year}`, seed: cfg.seed, engineVersion: cfg.engineVersion, dataVersion: data.index.dataVersion,
    mode: 'normal', sandbox, phase: 'birth',
    born: { iso: b.iso, year, urban: b.urban, quintile: b.quintile, sex: b.sex, pct: b.pct, lifeTableYear: ltYear, estimated },
    cur: b.iso, age: 0, stats, econ: { cash: 0, incomeReal: 0, pct: b.pct, employed: false, earnSum: 0, earnN: 0, annuity: 0, retired: false },
    portfolio: emptyPortfolio(), credit: emptyCredit(), loans: [], flags: {}, actions: [], years: [], events: [],
  };
}

/** Simulate the year from exact age `s.age` to `s.age+1`. Returns a new state. */
export function advanceYear(data: DataBundle, s: LifeState, events?: EventSystem): LifeState {
  if (s.death) return s;
  const age = s.age;
  const calYear = s.born.year + age;
  const c = data.country(s.cur);
  const r = stream(s.seed, 'year', age);
  // draw order is fixed: [0] death, [1] death frac, [2] unemployment
  const uDeath = r.next(), uFrac = r.next(), uUnemp = r.next();
  const t = tableFor(data, s);
  const dies = age >= MAX_AGE || uDeath < t.p[Math.min(age, MAX_AGE)]!;

  const est: string[] = [];
  let pct = s.econ.pct;
  const pen = pensionFor(data.hp, s.cur, s.born.sex);
  const retireAge = data.hp ? pen.age : PARAMS.retireAge.value;
  const inLabor = age >= PARAMS.laborEntryAge.value && age < retireAge;
  const retired = age >= retireAge;
  const { d, est: dEst } = incomeDist(c, calYear);
  const unempR = seriesAt(c.series.unemp, calYear);
  const consR = seriesAt(c.series.hhCons, calYear);
  const cpiR = seriesAt(c.series.cpi, calYear);
  const pi = cpiR.v;
  let unemployed = false, income = 0, consumption = 0, pension = 0;
  let earnSum = s.econ.earnSum, earnN = s.econ.earnN;
  let stats = { ...s.stats };
  let cash = s.econ.cash;
  const eventIds: string[] = [];
  const evs = [...s.events];
  const flags = { ...s.flags };
  const credit = { ...s.credit };
  const emit = (id: string, vars?: Record<string, number | string>) => { eventIds.push(id); evs.push({ age, id, vars }); };

  if (inLabor) {
    est.push(...dEst);
    if (unempR.est) est.push('unemp');
    if (consR.est) est.push('hhCons');
    unemployed = uUnemp < unempR.v;
    const permanent = incomeAt(d, pct);
    // nominal wages only catch up λπ of this year's inflation → real wage factor (1+λπ)/(1+π)
    const lag = pi > 0 ? (1 + PARAMS.wageLag.value * pi) / (1 + pi) : 1;
    income = unemployed ? 0 : permanent * lag;
    consumption = consR.v * permanent;
    earnSum += permanent; earnN += 1; // earnings history for the pension
  } else if (retired && data.hp) {
    // OECD gross replacement rate × average real lifetime earnings (+ any purchased annuity)
    pension = earnN > 0 ? pen.grr * (earnSum / earnN) : 0;
    if (pen.est) est.push('pension');
    income = pension + s.econ.annuity;
    consumption = consR.v * income;
    if (s.econ.annuity > 0 && !s.econ.retired) { /* annuity already flowing */ }
  }
  if (retired && data.hp && !s.econ.retired) emit('retire', { age: retireAge, pension: Math.round(pension) });
  if (events) {
    const out = events.run({ seed: s.seed, age, calYear, country: c, stats, cash, income, pct, unemployed, inLabor, flags, quintile: s.born.quintile, urban: s.born.urban, sex: s.born.sex, meanIncome: d.mean });
    stats = out.stats; cash = out.cash; income = out.income; pct = out.pct;
    for (const e of out.fired) emit(e.id, e.vars);
    Object.assign(flags, out.flags);
  }
  if (cpiR.est) est.push('cpi');
  const frac = dies ? (age === 0 ? Math.min(0.999, uFrac * 2 * t.ax0) : uFrac) : 1;

  // ---- M4 markets: positions carried from last year-end move first
  let portfolio = s.portfolio;
  let house = s.house ? { ...s.house } : undefined;
  let loans = s.loans.map((l) => ({ ...l }));
  const m = data.markets;
  const piOf = (iso: string, y: number) => seriesAt(data.country(iso).series.cpi, y).v;
  const mr = stream(s.seed, 'market', calYear); // draw order: [0] bootstrap year, [1] intra-year minimum
  const uBoot = mr.next(), uMin = mr.next();
  const active = m && (Object.keys(portfolio.target).length > 0 || investedValue(portfolio) !== 0);
  const lr = m ? lendingRate(m, s.cur, calYear, piOf) : { i: 0.05, est: true };
  if (m && active) {
    const ret = yearReturns({ m, iso: s.cur, year: calYear, pi: piOf, u: () => uBoot });
    const ms = marketStep({ p: portfolio, cash, ret, marginRate: lr.i, piHome: pi, uMin, sigmaBase: sigmaOf(m, portfolio.levBase, s.cur), calYear });
    portfolio = ms.p; cash = ms.cash;
    for (const a of ms.estAssets) est.push('mkt:' + a);
    if (ms.p.lev || ms.events.length) { if (lr.est) est.push('lendRate'); }
    for (const e of ms.events) emit(e.id, e.vars);
  }
  // ---- M5 house value (OECD real house price index; proxy = OECD median, 推估)
  if (house && data.hp) {
    const hr = houseReturn(data.hp, s.cur, calYear, uBoot);
    house.value *= 1 + hr.r;
    if (hr.est) { est.push('house'); house.est = true; }
  }
  // ---- M5 debt service due this year (floating nominal rates; balances real)
  const dues: { kind: 'mortgage' | 'loan'; i: number; rate: number; due: number }[] = [];
  if (house && house.balance > 0) {
    const rate = lr.i + PARAMS.mortgageSpread.value;
    dues.push({ kind: 'mortgage', i: -1, rate, due: pmt(house.balance, rate, house.termLeft) });
    if (lr.est) est.push('lendRate');
  }
  loans.forEach((l, i) => {
    if (l.status !== 'active') return;
    const rate = Math.min(lr.i + l.spread, creditCap(l.country, calYear) ?? Infinity);
    if (rate - l.rate > 0.02) emit('loanRateUp', { from: Math.round(l.rate * 1000) / 10, to: Math.round(rate * 1000) / 10 });
    l.rate = rate;
    l.pmt = pmt(l.balance, rate, Math.max(1, l.termYears - (calYear - l.startYear)));
    dues.push({ kind: 'loan', i, rate, due: l.pmt });
  });
  const totalDue = dues.reduce((a, x) => a + x.due, 0);
  // written-off debt: garnish a share of income
  let garnish = 0;
  if (credit.unsecuredDebt > 0 && income > 0) { garnish = Math.min(credit.unsecuredDebt, PARAMS.garnish.value * income * frac); credit.unsecuredDebt -= garnish; }
  // owner-occupier saves imputed rent (net of maintenance)
  const rentSave = house ? Math.min(consumption * 0.5, PARAMS.rentYieldNet.value * house.value) : 0;
  // a dying person's flows are pro-rated to the fraction of the year lived
  const inc = income * frac, cons = (consumption - rentSave) * frac;
  cash = settleCash({ cash, income: inc - garnish - totalDue * frac, consumption: cons, inflation: pi * frac });
  // liquidity: cover a deficit by selling investments (always, even without targets)
  if (cash < 0 && investedValue(portfolio) > 0) {
    const lq = rebalanceStep({ ...portfolio, rebalance: false }, cash, () => false);
    portfolio = { ...lq.p, rebalance: portfolio.rebalance }; cash = lq.cash;
    for (const e of lq.events) emit(e.id, e.vars);
  }
  // ---- missed payments → late fee → default; still-negative cash after selling investments = could not pay
  const shortfall = cash < 0 ? Math.min(-cash, totalDue * frac) / (1 + pi * frac) : 0;
  const payShare = totalDue > 0 ? 1 - shortfall / (totalDue * frac / (1 + pi * frac)) : 1;
  if (shortfall > 0) cash += shortfall;
  const freeze = () => { credit.frozenUntil = Math.max(credit.frozenUntil ?? 0, calYear + 1 + PARAMS.freezeYears.value); };
  for (const du of dues) {
    const paid = du.due * payShare;
    const unpaid = du.due - paid;
    if (du.kind === 'mortgage' && house) {
      house.missed = unpaid > 1e-6 ? house.missed + 1 : 0;
      house.balance = (house.balance * (1 + du.rate) - paid + (unpaid > 1e-6 ? PARAMS.lateFee.value * du.due : 0)) / (1 + pi);
      house.termLeft = Math.max(1, house.termLeft - 1);
      if (house.balance < 1e-6) { house.balance = 0; emit('mortgagePaid'); }
      else if (house.missed === 1) { emit('paymentMissed', { kind: 'mortgage' }); stats.happy -= 3; }
      else if (house.missed >= 2) {
        const proceeds = house.value * (1 - PARAMS.sellCost.value) - house.balance;
        if (proceeds >= 0) cash += proceeds; else credit.unsecuredDebt += -proceeds;
        emit('foreclosure', { amount: Math.round(proceeds) }); stats.happy -= 12; freeze(); credit.defaults += 1;
        house = undefined;
      }
    } else if (du.kind === 'loan') {
      const l = loans[du.i]!;
      l.missed = unpaid > 1e-6 ? l.missed + 1 : 0;
      l.arrears = unpaid > 1e-6 ? l.arrears + unpaid : 0;
      l.balance = (l.balance * (1 + du.rate) - paid + (unpaid > 1e-6 ? PARAMS.lateFee.value * du.due : 0)) / (1 + pi);
      if (l.balance < 1e-6) { l.balance = 0; l.status = 'paid'; emit('loanPaid'); }
      else if (l.missed === 1) { emit('paymentMissed', { kind: 'loan' }); stats.happy -= 3; }
      else if (l.missed >= 2) {
        // ① liquid assets were already sold above; ② remainder written off: kept as debt, garnished, credit frozen
        credit.unsecuredDebt += l.balance; l.status = 'writtenOff';
        emit('loanDefault', { amount: Math.round(l.balance) }); l.balance = 0;
        stats.happy -= 10; freeze(); credit.defaults += 1;
      }
    }
  }
  loans = loans.filter((l) => l.status === 'active' || calYear - l.startYear < 1);
  if (m && active && !dies) {
    const canBuy = (a: InvestAsset) => available(m, a, s.cur, calYear, age, { levBase: portfolio.levBase, cooldownUntil: portfolio.cooldownUntil, frozenUntil: credit.frozenUntil }).ok;
    const rb = rebalanceStep(portfolio, cash, canBuy);
    portfolio = rb.p; cash = rb.cash;
    for (const e of rb.events) emit(e.id, e.vars);
  }
  const invested = investedValue(portfolio);
  const houseEquity = house ? house.value - house.balance : 0;
  const debt = loans.reduce((a, l) => a + (l.status === 'active' ? l.balance : 0), 0) + credit.unsecuredDebt;
  const row: YearRow = { age, calYear, income: inc, consumption: cons, cash, invested, houseEquity, debt, netWorth: cash + invested + houseEquity - debt, pension: pension * frac,
    debtService: totalDue * frac, unemployed, inLabor, inflation: pi, est: [...new Set(est)], stats: { ...stats }, eventIds };
  const next: LifeState = {
    ...s, phase: dies ? 'dead' : 'life', age: dies ? age : age + 1, stats: { health: clampStat(stats.health), happy: clampStat(stats.happy), smart: clampStat(stats.smart), social: clampStat(stats.social) },
    econ: { cash, incomeReal: inc, pct, employed: inLabor && !unemployed, earnSum, earnN, annuity: s.econ.annuity, retired: retired && !!data.hp },
    portfolio, house, loans, credit, years: [...s.years, row], events: evs, flags,
  };
  if (dies) next.death = { age, frac, year: calYear, cause: causeLabel(age) };
  return next;
}

/** Legal interest-rate cap for personal loans where lists one (else undefined). */
function creditCap(iso: string, y: number): number | undefined {
  return ({ TWN: y >= 2021 ? 0.16 : 0.2, JPN: 0.18, KOR: 0.2, CHN: 0.15 } as Record<string, number>)[iso];
}

/** Coarse cause bucket by age (no cause-of-death data until WHO GHE is added). */
export function causeLabel(age: number): string {
  if (age < 1) return 'infant';
  if (age < 5) return 'child';
  if (age < 40) return 'young';
  if (age < 70) return 'midlife';
  return 'old';
}

export function runLife(data: DataBundle, cfg: LifeConfig, events?: EventSystem, actions: Action[] = []): LifeState | Infeasible {
  let s = newLife(data, cfg);
  if ('infeasible' in s) return s;
  while (!s.death) {
    for (const a of actions) if ('age' in a && a.age === s.age) s = applyAction(data, s, a);
    s = advanceYear(data, s, events);
  }
  return s;
}

/** Player decisions are recorded actions applied between years → deterministic replay. */
export function applyAction(_data: DataBundle, s: LifeState, a: Action): LifeState {
  const actions = [...s.actions, a];
  if (a.t === 'alloc') {
    const p: Portfolio = { ...s.portfolio, target: { ...a.target }, levBase: a.levBase ?? s.portfolio.levBase, levK: a.levK ?? s.portfolio.levK };
    return { ...s, portfolio: p, actions };
  }
  const q = decisionQuote(_data, s);
  const year = s.born.year + s.age;
  if (a.t === 'buyHouse') {
    if (!q.house.ok || s.house) return s; // invalid in this state → ignored (not recorded)
    const h: House = { value: q.house.price, price0: q.house.price, boughtYear: year, balance: q.house.loan, termLeft: PARAMS.mortgageTerm.value, missed: 0, est: q.house.est };
    return { ...s, house: h, econ: { ...s.econ, cash: s.econ.cash - q.house.down }, actions };
  }
  if (a.t === 'sellHouse') {
    if (!s.house) return s;
    const proceeds = s.house.value * (1 - PARAMS.sellCost.value) - s.house.balance;
    const credit = { ...s.credit };
    let cash = s.econ.cash;
    if (proceeds >= 0) cash += proceeds; else { cash += 0; credit.unsecuredDebt += -proceeds; }
    return { ...s, house: undefined, credit, econ: { ...s.econ, cash }, actions };
  }
  if (a.t === 'loan') {
    const amt = Math.min(a.amount, q.loan.max);
    if (!q.loan.ok || !(amt > 0)) return s;
    const term = Math.min(7, Math.max(1, Math.round(a.term)));
    const loan: PersonalLoan = { id: `L${s.loans.length + 1}-${year}`, country: s.cur, startYear: year, principal: amt, balance: amt, termYears: term, rateType: 'float',
      spread: PARAMS.creditSpread.value, rate: q.loan.rate, pmt: pmt(amt, q.loan.rate, term), purpose: a.purpose, investedLots: [], missed: 0, arrears: 0, status: 'active', src: q.loan.src };
    return { ...s, loans: [...s.loans, loan], econ: { ...s.econ, cash: s.econ.cash + amt }, actions };
  }
  if (a.t === 'annuity') {
    if (!q.annuity.ok) return s;
    const amt = Math.min(a.amount, q.annuity.max);
    if (!(amt > 0)) return s;
    const pay = annuityPayout(amt, tableFor(_data, s).p, s.age);
    return { ...s, econ: { ...s.econ, cash: s.econ.cash - amt, annuity: s.econ.annuity + pay }, actions };
  }
  return { ...s, actions };
}

export interface DecisionQuote {
  house: { ok: boolean; why?: string; price: number; down: number; loan: number; rate: number; pmt: number; est: boolean };
  loan: { ok: boolean; why?: string; max: number; rate: number; src: 'official' | 'proxy'; note: string; term: number; bridgeNeed: number };
  annuity: { ok: boolean; why?: string; max: number; per1000: number };
}
/** What the player can do right now (before the year at s.age is simulated). Pure; UI and tests use the same numbers. */
export function decisionQuote(data: DataBundle, s: LifeState): DecisionQuote {
  const year = s.born.year + s.age;
  const c = data.country(s.cur);
  const m = data.markets;
  const piOf = (iso: string, y: number) => seriesAt(data.country(iso).series.cpi, y).v;
  const lr = m ? lendingRate(m, s.cur, year, piOf) : { i: 0.05, est: true };
  const incomeY = s.econ.employed ? s.econ.incomeReal : 0;
  const frozen = s.credit.frozenUntil !== undefined && year < s.credit.frozenUntil;
  const existingService = (s.house && s.house.balance > 0 ? pmt(s.house.balance, lr.i + PARAMS.mortgageSpread.value, s.house.termLeft) : 0)
    + s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.pmt, 0);
  // house
  const { d } = incomeDist(c, Math.min(year, 2100));
  const price = PARAMS.priceToIncome.value * d.mean;
  const loanAmt = PARAMS.ltv.value * price, down = price - loanAmt;
  const mRate = lr.i + PARAMS.mortgageSpread.value;
  const mPmt = pmt(loanAmt, mRate, PARAMS.mortgageTerm.value);
  let hWhy: string | undefined;
  if (!data.hp) hWhy = 'nodata';
  else if (s.age < PARAMS.creditMinAge.value) hWhy = 'age';
  else if (s.house) hWhy = 'owned';
  else if (frozen) hWhy = 'frozen';
  else if (!s.econ.employed) hWhy = 'noincome';
  else if (s.econ.cash < down) hWhy = 'nodown';
  else if ((existingService + mPmt) > PARAMS.dsrProxy.value * incomeY) hWhy = 'dsr';
  const hEst = lr.est || !data.hp?.house[s.cur];
  // personal loan
  const unsecured = s.loans.filter((l) => l.status === 'active').reduce((a, l) => a + l.balance, 0) + s.credit.unsecuredDebt;
  const rule = m ? creditRule(m, s.cur, year, incomeY, unsecured, (y) => piOf('USA', y)) : null;
  const rate = Math.min(lr.i + PARAMS.creditSpread.value, rule?.legalCap ?? Infinity);
  const term = PARAMS.creditTerm.value;
  const dsrRoom = Math.max(0, (rule?.dsrMax ?? PARAMS.dsrProxy.value) * incomeY - existingService);
  const maxByDsr = dsrRoom > 0 ? dsrRoom / (pmt(1, rate, term)) : 0;
  const max = rule ? Math.max(0, Math.min(rule.cap, maxByDsr)) : 0;
  let lWhy: string | undefined;
  if (!rule || !rule.enabled) lWhy = 'country';
  else if (s.age < PARAMS.creditMinAge.value) lWhy = 'age';
  else if (frozen) lWhy = 'frozen';
  else if (!s.econ.employed || incomeY <= 0) lWhy = 'noincome';
  else if (!rule.minIncomeOk) lWhy = 'minincome';
  else if (max < 1) lWhy = 'cap';
  // annuity
  const aMax = Math.max(0, s.econ.cash);
  const aWhy = s.age < PARAMS.annuityMinAge.value ? 'age' : aMax <= 0 ? 'nocash' : undefined;
  const per1000 = aWhy === 'age' ? 0 : annuityPayout(1000, tableFor(data, s).p, s.age);
  return {
    house: { ok: !hWhy, why: hWhy, price, down, loan: loanAmt, rate: mRate, pmt: mPmt, est: hEst },
    loan: { ok: !lWhy, why: lWhy, max, rate, src: rule?.src ?? 'proxy', note: rule?.note ?? '', term, bridgeNeed: Math.max(0, -s.econ.cash) },
    annuity: { ok: !aWhy, why: aWhy, max: aMax, per1000 },
  };
}

/** Fast path for calibration: only birth + mortality (identical draws to advanceYear). */
export function deathAgeOnly(data: DataBundle, cfg: LifeConfig): { iso: Iso3; sex: 'M' | 'F'; ageAtDeath: number; age: number } | Infeasible {
  const s = newLife(data, cfg);
  if ('infeasible' in s) return s;
  const t = tableFor(data, s);
  for (let age = 0; ; age++) {
    const r = stream(s.seed, 'year', age);
    const uDeath = r.next(), uFrac = r.next();
    if (age >= MAX_AGE || uDeath < t.p[age]!) {
      const frac = age === 0 ? Math.min(0.999, uFrac * 2 * t.ax0) : uFrac;
      return { iso: s.born.iso, sex: s.born.sex, ageAtDeath: age + frac, age };
    }
  }
}
