import { focusStage, activeAlloc, autoAlloc, mapToStage, focusEffects, allocKey, type FocusFx } from './focus.ts';
import { buy, sell, autoHabits, bondAdd, LIFESTYLE, lifestyleAt, lifestyleYear, routineOn, ROUTINES, itemById } from './spend.ts';
import { cohortTfr, wppAt, type WppExtra } from './fertility.ts';
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
import { phiInv } from '../math/normal.ts';
import { EDU_PREMIUM, benefitRate, entryAge, experienceFactor, gradAge, premiumNorm, schoolingOdds, spending, taxRate } from '../economy/household.ts';
import { makeFamily } from './family.ts';
import { applyChoice, defaultPick, offersAt } from './choices.ts';
import type { Career } from './state.ts';

export interface DataBundle {
  index: CountryIndex;
  country(iso: Iso3): CountryRec;
  demography(iso: Iso3): Demography;
  /** M4 market layer (optional: without it the engine runs cash-only as in M3) */
  markets?: MarketsData;
  /** M5 housing & pension layer */
  hp?: HousingPension;
  /** batch 2 WPP extra layer (TFR, e0, q5) */
  wpp?: WppExtra;
}
export function makeBundle(index: CountryIndex, demo: (iso: Iso3) => Demography, extra: { markets?: MarketsData; hp?: HousingPension; wpp?: WppExtra } = {}): DataBundle {
  const by = new Map(index.countries.map((c) => [c.iso, c]));
  const cache = new Map<Iso3, Demography>();
  return {
    index, ...extra,
    country: (iso) => { const c = by.get(iso); if (!c) throw new Error('unknown country ' + iso); return c; },
    demography: (iso) => { let d = cache.get(iso); if (!d) { d = demo(iso); cache.set(iso, d); } return d; },
  };
}

/** 'future' (batch 1): births after nowYear up to the last projected WPP year (UN medium variant → 推估). */
export type Era = { kind: 'now' } | { kind: 'past'; year: number | 'random' } | { kind: 'future'; year: number | 'random' };
export interface LifeConfig { seed: string; era: Era; nowYear: number; constraints?: BirthConstraints; id?: string; engineVersion: string; /** v0.8.0: auto focus policy (comparison lives, MC) */ autoFocus?: boolean; /** v0.8.0: auto spending habits */ autoSpend?: boolean }

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
  const [b0, b1] = index.birthYears;
  const fixed = K.country.kind === 'fixed' ? K.country.value : undefined;
  const year = cfg.era.kind === 'now' ? cfg.nowYear
    : cfg.era.year !== 'random' ? cfg.era.year
    : cfg.era.kind === 'past' ? sampleYear(index, b0, cfg.nowYear - 1, rng, fixed)
    : sampleYear(index, Math.min(cfg.nowYear + 1, b1), b1, rng, fixed);
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
  const fam = makeFamily(data.country(b.iso), year, b.sex, cfg.seed, data.wpp?.tfr[b.iso] ? (y: number) => wppAt(data.wpp, 'tfr', b.iso, y) : undefined);
  const entry = entryAge(data.country(b.iso), year);
  const plan = schoolingOdds(data.country(b.iso), year).pPrimary >= 0.97 ? 'primary' as const : 'none' as const;
  const career: Career = { plan, studyUntil: gradAge(plan, entry), entry, track: 'private', mult: 1, city: false, lastWage: 0, promotions: 0 };
  const sandbox = { on: cfg.constraints !== undefined && Object.values(cfg.constraints).some((k) => k.kind === 'fixed'), reasons: [] as string[] };
  if (sandbox.on) sandbox.reasons.push('constraint');
  return {
    v: 3, id: cfg.id ?? `${cfg.seed}-${b.iso}-${year}`, seed: cfg.seed, engineVersion: cfg.engineVersion, dataVersion: data.index.dataVersion,
    mode: 'normal', sandbox, phase: 'birth',
    born: { iso: b.iso, year, urban: b.urban, quintile: b.quintile, sex: b.sex, pct: b.pct, lifeTableYear: ltYear, estimated },
    cur: b.iso, age: 0, stats, name: fam.name, family: fam.family, career, econ: { cash: 0, incomeReal: 0, pct: b.pct, employed: false, earnSum: 0, earnN: 0, annuity: 0, retired: false },
    portfolio: emptyPortfolio(), credit: emptyCredit(), loans: [], flags: { ...(cfg.autoFocus ? { autoFocus: true } : {}), ...(cfg.autoSpend ? { autoSpend: true } : {}) }, actions: [], years: [], events: [],
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
  const uDeath = r.next(), uFrac = r.next(), uUnemp = r.next(), uLuck = r.next();
  const t = tableFor(data, s);
  const dies = age >= MAX_AGE || uDeath < t.p[Math.min(age, MAX_AGE)]!;

  const est: string[] = [];
  let pct = s.econ.pct;
  const pen = pensionFor(data.hp, s.cur, s.born.sex);
  const retireAge = data.hp ? pen.age : PARAMS.retireAge.value;
  const { d, est: dEst } = incomeDist(c, calYear);
  const unempR = seriesAt(c.series.unemp, calYear);
  const consR = seriesAt(c.series.hhCons, calYear);
  const cpiR = seriesAt(c.series.cpi, calYear);
  const pi = cpiR.v;
  const gdpPc = seriesAt(c.series.gdpPcPpp, calYear).v;
  const meanTax = taxRate(c, calYear, d.mean, d.mean).rate;
  const meanDisp = d.mean * (1 - meanTax);
  // batch 2 P14 lifestyle (recorded; defaults neutral)
  const ls = lifestyleAt(s.actions, age); const lsy = lifestyleYear(ls);
  const oop = (gdpPc >= 15000 ? PARAMS.medicalOop.value : 1) * lsy.oopMult;
  let stats = { ...s.stats };
  let cash = s.econ.cash;
  const eventIds: string[] = [];
  const evs = [...s.events];
  const flags = { ...s.flags };
  const credit = { ...s.credit };
  const emit = (id: string, vars?: Record<string, number | string>) => { eventIds.push(id); evs.push({ age, id, vars }); };

  // ---- P0-3 life choices at the start of the year (recorded answer, else default policy)
  const career: Career = { ...s.career };
  const family = { ...s.family, siblings: [...s.family.siblings], children: [...s.family.children] };
  // v0.8.0 focus in force last year shapes this year's offers (marriage, schooling)
  const fx0: FocusFx | undefined = typeof s.flags.fcEff === 'string' ? focusEffects(JSON.parse(s.flags.fcEff) as Record<string, number>) : undefined;
  for (const o of offersAt({ s, c, calYear, meanIncome: d.mean, tfr: cohortTfr(data.wpp, s.born.iso, s.born.year), ...(fx0 ? { focus: fx0 } : {}) })) {
    const rec = s.actions.find((x) => x.t === 'choice' && x.age === age && x.id === o.id);
    const opt = rec && rec.t === 'choice' && o.opts.includes(rec.opt) ? rec.opt : defaultPick(s.seed, age, o);
    const draft = { career, family, stats, cash, calYear, age, meanDisp, oop, seed: s.seed };
    const vars = applyChoice(draft, o.id, opt);
    cash = draft.cash;
    emit(`ch_${o.id}_${opt}`, vars);
  }

  // ---- P0-2 study / work / retirement
  const studying = age >= career.entry && age < career.studyUntil && career.plan !== 'none';
  const inLabor = age >= Math.max(15, career.studyUntil) && age < retireAge;
  const retired = age >= retireAge;
  if (inLabor && career.workStart === undefined) {
    career.workStart = age;
    if (career.plan !== 'none' && career.plan !== 'primary') emit('graduated', { edu: career.plan });
  }
  let unemployed = false, income = 0, pension = 0, partTime = false;
  let earnSum = s.econ.earnSum, earnN = s.econ.earnN;
  const base = incomeAt(d, pct);
  const eduF = EDU_PREMIUM[career.plan] / premiumNorm(c, s.born.year);
  if (inLabor) {
    est.push(...dEst, 'tax');
    if (unempR.est) est.push('unemp');
    const uMult = { stable: 0.5, private: 1, startup: 1.3, informal: 0.6 }[career.track] * (career.plan === 'tertiary' || career.plan === 'graduate' ? 0.75 : career.plan === 'none' ? 1.1 : 1);
    unemployed = uUnemp < unempR.v * uMult;
    // nominal wages only catch up λπ of this year's inflation → real wage factor (1+λπ)/(1+π)
    const lag = pi > 0 ? (1 + PARAMS.wageLag.value * pi) / (1 + pi) : 1;
    const luck = career.track === 'startup' ? Math.exp(0.6 * phiInv(Math.min(0.999, Math.max(0.001, uLuck))) - 0.18) : 1;
    const trackF = { stable: 0.95, private: 1, startup: luck, informal: 0.7 }[career.track];
    const careF = career.careUntil !== undefined && age < career.careUntil ? 0.7 : 1;
    const wage = base * eduF * experienceFactor(age - career.workStart!) * career.mult * trackF * (career.city ? 1.15 : 1) * careF;
    if (unemployed) { income = benefitRate(c, calYear) * career.lastWage; if (income > 0) est.push('benefit'); }
    else { income = wage * lag; career.lastWage = wage; }
    earnSum += wage; earnN += 1; // earnings history for the pension
  } else if (studying && age >= 16) {
    income = PARAMS.studentWork.value * base * experienceFactor(0) * 0.75; partTime = true;
  } else if (retired && data.hp) {
    // OECD gross replacement rate × average real lifetime earnings (+ any purchased annuity)
    pension = earnN > 0 ? pen.grr * (earnSum / earnN) : 0;
    if (pen.est) est.push('pension');
    income = pension;
  }
  // ---- v0.8.0 yearly focus: recorded allocation (or the auto policy), mapped onto this life stage
  let focusCost = 0, fxNow: FocusFx | undefined;
  {
    const stage = focusStage({ age, studying, uni: studying && (career.plan === 'tertiary' || career.plan === 'graduate'), inLabor, unemployed, retired });
    let intended: Record<string, number> = activeAlloc(s.actions, age);
    if (!Object.keys(intended).length && flags.autoFocus && stage !== 'none') {
      if (flags.fcStage !== stage || typeof flags.fcAuto !== 'string') { flags.fcAuto = JSON.stringify(autoAlloc(stage, stats, s.seed, age)); emit('fc_auto', { stage }); }
      intended = JSON.parse(flags.fcAuto as string) as Record<string, number>;
    }
    if (Object.keys(intended).length || flags.fcEff !== undefined) {
      const eff = mapToStage(intended, stage);
      const prev = typeof flags.fcEff === 'string' ? JSON.parse(flags.fcEff) as Record<string, number> : {};
      if (flags.fcStage !== undefined && flags.fcStage !== stage && Object.keys(intended).length && allocKey(eff) !== allocKey(prev)) emit('fc_switch', { from: allocKey(prev) || '-', to: allocKey(eff) || '-', stage });
      flags.fcStage = stage; flags.fcEff = JSON.stringify(eff);
      const fx = focusEffects(eff); fxNow = fx;
      for (const [k, v] of Object.entries(fx.fx) as [keyof typeof stats, number][]) stats[k] += v;
      if (inLabor && !unemployed) income *= fx.incomeMult;
      if (partTime && fx.parttime > 0) income *= 1 + fx.parttime;
      focusCost = fx.costShare * Math.max(0, income);
      if (inLabor && !unemployed && age >= 22 && age <= 58 && fx.jobMult > 1 && stream(s.seed, 'focus', age).next() < 0.04 * (fx.jobMult - 1)) {
        career.mult *= 1.06; stats.happy += 2; emit('job_change', { pct: 6 });
      }
    }
  }
  income += s.econ.annuity; // a purchased annuity pays for life, working or not
  if (retired && data.hp && !s.econ.retired) emit('retire', { age: retireAge, pension: Math.round(pension) });
  const married0 = !!family.spouse;
  const kids0 = family.children.filter((k) => calYear - k.born < 18).length;
  if (events) {
    const out = events.run({ seed: s.seed, age, calYear, country: c, stats, cash, income, pct, unemployed, inLabor, flags, quintile: s.born.quintile, urban: s.born.urban, sex: s.born.sex, meanIncome: d.mean,
      studying, married: married0, kids: kids0, siblings: family.siblings.length, retired, owner: !!s.house, city: career.city, careerMult: career.mult, gdp: gdpPc, oop,
      ...(fxNow ? { focusPromo: fxNow.promoMult, focusFamily: fxNow.familyMult } : {}) });
    stats = out.stats; cash = out.cash; income = out.income; pct = out.pct;
    if (out.careerMult > career.mult * 1.05) career.promotions += 1;
    career.mult = out.careerMult;
    if (out.married === false && family.spouse) { family.spouse = undefined; flags.divorced = age; }
    for (const e of out.fired) emit(e.id, e.vars);
    Object.assign(flags, out.flags);
  }
  // ---- P0-1 taxes and consumption (income-, family- and rent-linked); children/students living at home are covered by the family
  const tax = income * taxRate(c, calYear, income, d.mean).rate * (retired ? 0.5 : 1);
  const disp = income - tax;
  const independent = inLabor || retired;
  let consumption = 0, rent = 0;
  if (independent) {
    const liquid = Math.max(0, cash) + investedValue(s.portfolio);
    let yl = 0, l = 1; for (let a2 = age; a2 <= MAX_AGE; a2++) { l *= 1 - t.p[a2]!; yl += l; }
    const sp = spending({ disp, meanDisp, renter: !s.house, married: !!family.spouse, kids: family.children.filter((k) => calYear - k.born < 18).length, city: career.city, retired, wealth: retired ? liquid : 0, yearsLeft: yl, cash });
    consumption = sp.total; rent = Math.min(sp.rent, sp.total);
    if (career.careCostUntil !== undefined && age < career.careCostUntil) consumption += 0.3 * meanDisp;
    if (consR.est) est.push('hhCons');
  } else if (partTime) consumption = 0.5 * disp;
  consumption += focusCost;
  if (independent) {
    consumption = Math.max(0, consumption + lsy.cost * d.mean);
    for (const [k, v] of Object.entries(lsy.fx) as [keyof typeof stats, number][]) stats[k] += v;
    const auto = flags.autoSpend || ls.auto === 'on' ? autoHabits(s) : [];
    for (const id of ROUTINES) {
      const it = itemById(id)!;
      if (!(routineOn(ls, id) || auto.includes(id)) || age < it.from || age > it.to || (it.needs.includes('parents') && !family.parentsAlive)) continue;
      const price = it.price * d.mean;
      if (cash - consumption > 3 * price) { consumption += price; for (const [k, v] of Object.entries(it.fx) as [keyof typeof stats, number][]) stats[k] += v; if (it.bond) flags.bond = bondAdd({ ...s, flags }, it.bond); emit('rt_' + id, { amount: Math.round(price) }); }
    }
  }
  void consR;
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
  // a dying person's flows are pro-rated to the fraction of the year lived
  const inc = income * frac, cons = consumption * frac, taxF = tax * frac;
  cash = settleCash({ cash, income: inc - taxF - garnish - totalDue * frac, consumption: cons, inflation: pi * frac });
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
  // v0.8.0: a minor's savings never go negative — parents cover any gap
  if (age < 18 && cash < 0) cash = 0;
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
    debtService: totalDue * frac, unemployed, inLabor, inflation: pi, est: [...new Set(est)], stats: { ...stats }, eventIds, tax: taxF, rent: rent * frac, studying };
  const next: LifeState = {
    ...s, phase: dies ? 'dead' : 'life', age: dies ? age : age + 1, stats: { health: clampStat(stats.health), happy: clampStat(stats.happy), smart: clampStat(stats.smart), social: clampStat(stats.social) },
    econ: { cash, incomeReal: inc, pct, employed: inLabor && !unemployed, earnSum, earnN, annuity: s.econ.annuity, retired: retired && !!data.hp },
    career, family, portfolio, house, loans, credit, years: [...s.years, row], events: evs, flags,
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
  if (a.t === 'buy') {
    const b = buy(_data, s, a.id); if (!b) return s;
    const flags = { ...s.flags, ...(b.bond !== Number(s.flags.bond ?? 50) ? { bond: b.bond } : {}), ...(b.allow ? { ['allow:' + s.age]: Number(s.flags['allow:' + s.age] ?? 0) + b.allow } : {}) };
    return { ...s, stats: b.stats, econ: { ...s.econ, cash: b.cash }, flags, actions };
  }
  if (a.t === 'sell') { const b = sell(_data, s, a.id); return b ? { ...s, stats: b.stats, econ: { ...s.econ, cash: b.cash }, actions } : s; }
  if (a.t === 'life') { const def = LIFESTYLE.find((l) => l.key === a.key); const okKey = def ? def.opts.includes(a.value) : (a.key.startsWith('rt:') || a.key === 'auto') && ['on', 'off'].includes(a.value);
    return okKey ? { ...s, actions } : s; }
  const q = decisionQuote(_data, s);
  const year = s.born.year + s.age;
  if (a.t === 'buyHouse') {
    const qq = a.term ? decisionQuote(_data, s, a.term) : q;
    if (!qq.house.ok || s.house) return s; // invalid in this state → ignored (not recorded)
    const h: House = { value: qq.house.price, price0: qq.house.price, boughtYear: year, balance: qq.house.loan, termLeft: qq.house.term, missed: 0, est: qq.house.est };
    return { ...s, house: h, econ: { ...s.econ, cash: s.econ.cash - qq.house.down }, actions };
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
  house: { ok: boolean; why?: string; price: number; down: number; loan: number; rate: number; pmt: number; est: boolean; term: number;
    /** income needed for this payment under the debt-service limit, and cash needed for the down payment */
    needIncome: number; needDown: number; dsrMax: number };
  loan: { ok: boolean; why?: string; max: number; rate: number; src: 'official' | 'proxy'; note: string; noteKey: string; term: number; bridgeNeed: number };
  annuity: { ok: boolean; why?: string; max: number; per1000: number };
}
/** What the player can do right now (before the year at s.age is simulated). Pure; UI and tests use the same numbers. */
export const MORTGAGE_TERMS = [20, 30, 40] as const;
/** Choices offered at the start of the current year that the player has not answered yet (UI pauses on these). */
export function pendingOffers(data: DataBundle, s: LifeState) {
  if (s.death) return [];
  const c = data.country(s.cur), calYear = s.born.year + s.age;
  return offersAt({ s, c, calYear, meanIncome: incomeDist(c, calYear).d.mean, tfr: cohortTfr(data.wpp, s.born.iso, s.born.year) }).filter((o) => !s.actions.some((a) => a.t === 'choice' && a.age === s.age && a.id === o.id));
}
export function decisionQuote(data: DataBundle, s: LifeState, term: number = PARAMS.mortgageTerm.value): DecisionQuote {
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
  const mTerm = Math.min(40, Math.max(5, Math.round(term)));
  const mPmt = pmt(loanAmt, mRate, mTerm);
  const needIncome = (existingService + mPmt) / PARAMS.dsrProxy.value;
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
  const cTerm = PARAMS.creditTerm.value;
  const dsrRoom = Math.max(0, (rule?.dsrMax ?? PARAMS.dsrProxy.value) * incomeY - existingService);
  const maxByDsr = dsrRoom > 0 ? dsrRoom / (pmt(1, rate, cTerm)) : 0;
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
    house: { ok: !hWhy, why: hWhy, price, down, loan: loanAmt, rate: mRate, pmt: mPmt, est: hEst, term: mTerm, needIncome, needDown: down, dsrMax: PARAMS.dsrProxy.value },
    loan: { ok: !lWhy, why: lWhy, max, rate, src: rule?.src ?? 'proxy', note: rule?.note ?? '', noteKey: rule?.noteKey ?? 'none', term: cTerm, bridgeNeed: Math.max(0, -s.econ.cash) },
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
