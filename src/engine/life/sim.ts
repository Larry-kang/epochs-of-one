import { healthHazard, focusStage, activeAlloc, autoAlloc, mapToStage, focusEffects, allocKey, type FocusFx } from './focus.ts';
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
import { occById, occHazard, occWageF, legacyOcc, maxRung, bizHazard, BIZ, TECH_EXIT, ILLICIT, PRISON_PENALTY, RARE_PATHS, SPACE, ENTRY_GROUPS, incomeGroup, type Biz } from './occupation.ts';
import type { Career } from './state.ts';
import { serviceAge, drawService, serviceFrac, csKey, L2_OPTS } from './conscription.ts';
import { INST, instAt, instStarts, instRef, uniRetakeP, civilAttempts, CIVIL_OCC, EXAM_COUNTRIES, usUninsuredCost, jpNonRegShare, jpRegWage, JP_NONREG_WAGE, JP_NONREG_UNEMP, JP_REG_UNEMP, JP_TO_REGULAR, JP_SPLIT_GROUPS, KR_EARLY } from './institutions.ts';

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
export interface LifeConfig { seed: string; era: Era; nowYear: number; constraints?: BirthConstraints; id?: string; engineVersion: string; /** v0.8.0: auto focus policy (comparison lives, MC) */ autoFocus?: boolean; /** v0.8.0: auto spending habits */ autoSpend?: boolean; /** C0: occupation system (v0.9.0) */ occ?: boolean; /** C0: legacy save continues in the occupation system from this age */ occFrom?: number; /** L2/L3 (v0.11.0): conscription + institutions marker for new lives */ l2?: boolean; /** L2/L3: a pre-v0.11.0 save gets conscription + institutions only from this age (replayed years stay identical) */ l2From?: number }

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
    portfolio: emptyPortfolio(), credit: emptyCredit(), loans: [], flags: { ...(cfg.autoFocus ? { autoFocus: true } : {}), ...(cfg.autoSpend ? { autoSpend: true } : {}), ...(cfg.occ ? { occ: true } : {}), ...(cfg.occFrom !== undefined ? { occFrom: cfg.occFrom } : {}), ...(cfg.l2From !== undefined ? { l2From: cfg.l2From } : {}) }, actions: [], years: [], events: [],
  };
}

/** Simulate the year from exact age `s.age` to `s.age+1`. Returns a new state. */
/** v0.8.1: the focus effect in force from last year, or undefined when none — a cleared focus ("{}"), null or a malformed value
 *  is no effect at all (it must not keep the health→hazard link or offer modifiers alive). Shared by advanceYear and pendingOffers. */
export function focusInForce(flags: LifeState['flags']): FocusFx | undefined {
  const raw = flags.fcEff;
  if (typeof raw !== 'string' || !raw) return undefined;
  let eff: unknown;
  try { eff = JSON.parse(raw); } catch { return undefined; }
  if (!eff || typeof eff !== 'object' || !Object.values(eff as Record<string, unknown>).some((v) => typeof v === 'number' && v > 0)) return undefined;
  return focusEffects(eff as Record<string, number>);
}
/** adult mortality multiplier applied to this year's draw: 1 (the calibrated baseline) unless a focus is in force */
export function hazardMult(s: LifeState): number { const fx = focusInForce(s.flags); return fx ? healthHazard(s.stats.health, s.age, fx) : 1; }
export function advanceYear(data: DataBundle, s: LifeState, events?: EventSystem): LifeState {
  if (s.death) return s;
  const age = s.age;
  const calYear = s.born.year + age;
  const c = data.country(s.cur);
  const r = stream(s.seed, 'year', age);
  // draw order is fixed: [0] death, [1] death frac, [2] unemployment
  const uDeath = r.next(), uFrac = r.next(), uUnemp = r.next(), uLuck = r.next();
  const t = tableFor(data, s);
  const fxPrev = focusInForce(s.flags);
  const hzd = hazardMult(s); // v0.8.1: only lives with a focus in force
  const occOn = s.flags.occ === true || (typeof s.flags.occFrom === 'number' && age >= s.flags.occFrom);
  const gdp0 = seriesAt(c.series.gdpPcPpp, calYear).v;
  const hzO = occOn ? occHazard(s.career.occ, gdp0, age) : 1; // C0: occupational risk, renormalised (reallocates, never shifts the table)
  const dies = age >= MAX_AGE || uDeath < Math.min(1, t.p[Math.min(age, MAX_AGE)]! * hzd * hzO);

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
  const fx0 = fxPrev;
  for (const o of offersAt({ s, c, calYear, meanIncome: d.mean, tfr: cohortTfr(data.wpp, s.born.iso, s.born.year), ...(fx0 ? { focus: fx0 } : {}) })) {
    const rec = s.actions.find((x) => x.t === 'choice' && x.age === age && x.id === o.id);
    const opt = rec && rec.t === 'choice' && o.opts.includes(rec.opt) ? rec.opt : defaultPick(s.seed, age, o);
    const draft = { career, family, stats, cash, calYear, age, meanDisp, oop, seed: s.seed, ...(o.vars?.occ ? { illicitKind: String(o.vars.occ) } : {}) };
    const vars = applyChoice(draft, o.id, opt);
    cash = draft.cash;
    if (o.id === 'career' && occById(opt)) { flags.occIg = incomeGroup(seriesAt(c.series.gdpPcPpp, calYear).v); emit('oc_enter', vars); }
    else if (o.id === 'switch') { if (vars) emit('oc_switch', vars); }
    else if (o.id === 'startup') { if (vars) emit('oc_biz_start', vars); }
    else if (o.id === 'illicit') emit(opt === 'accept' ? 'oc_illicit_join' : 'oc_illicit_refuse', { occ: String(o.vars?.occ ?? '') });
    else if (o.id === 'illicit_exit') { if (opt === 'leave') emit('oc_illicit_leave'); }
    else emit(`ch_${o.id}_${opt}`, vars);
  }

  // ---- P0-2 study / work / retirement
  const studying = age >= career.entry && age < career.studyUntil && career.plan !== 'none';
  const inLabor = age >= Math.max(15, career.studyUntil) && age < retireAge;
  const retired = age >= retireAge;
  if (occOn && career.trackSet && !career.occ) { career.occ = legacyOcc(career.track, career.plan, gdp0); career.rung = Math.min(career.promotions, maxRung(career.occ)); flags.occIg = incomeGroup(gdp0); emit('oc_map', { occ: career.occ }); }
  if (inLabor && career.workStart === undefined) {
    career.workStart = age;
    if (career.plan !== 'none' && career.plan !== 'primary') emit('graduated', { edu: career.plan });
  }
  // ---- L2 conscription (occupation lives only; own stream `cs` so legacy draws stay identical)
  let svcF = 0, svcPay = 0;
  const l2On = occOn && (typeof flags.l2From !== 'number' || age >= flags.l2From);
  if (l2On && !retired && L2_OPTS.conscription) {
    if (flags.csLeft === undefined && flags.csDone === undefined && age === serviceAge(s.born.iso, career.studyUntil)) {
      const rc = stream(s.seed, 'cs', age); const sv = drawService(s.born.iso, s.born.sex, s.born.year, calYear, career.occ, rc.next(), rc.next(), rc.next());
      if (sv?.exempt) { flags.csDone = age; emit('cs_exempt_athlete'); }
      else if (sv) { flags.csLeft = sv.months; flags.csMonths = sv.months; flags.csPay = sv.pay; if (sv.alt) flags.csAlt = true; if (sv.est) flags.csEst = true; emit((sv.alt ? 'cs_alt_' : 'cs_start_') + (sv.alt && s.born.iso === 'USA' ? 'gen' : csKey(s.born.iso)), { months: sv.months }); }
      else flags.csDone = age;
    }
    if (typeof flags.csLeft === 'number' && flags.csLeft > 0) { svcF = serviceFrac(flags.csLeft); svcPay = Number(flags.csPay ?? 0); }
  }
  // ---- L3 institutions TW/US/JP/KR (occupation lives; own stream `inst`; every parameter 推估, see institutions.ts)
  const iso0 = s.born.iso; const L3 = l2On && L2_OPTS.institutions && !!INST[iso0];
  const ri = stream(s.seed, 'inst', age); const v1 = ri.next(), v2 = ri.next(), v3 = ri.next(), v4 = ri.next();
  let jpWageF = 1, jpUnempF = 1;
  if (L3) {
    const hi = career.plan === 'tertiary' || career.plan === 'graduate';
    const hs = instAt(iso0, 'hsExam', calYear); if (age === 15 && studying && hs && career.plan !== 'none' && career.plan !== 'primary') emit('in_hsexam', { inst: instRef(iso0, 'hsExam', hs) });
    const ue = instAt(iso0, 'uniExam', calYear);
    if (age === 18 && studying && hi && ue) emit(v1 < uniRetakeP(stats.smart, (fxPrev?.schoolAdd ?? 0) > 0) ? 'in_uniexam_retake_' + (EXAM_COUNTRIES.includes(iso0) ? iso0 : 'gen') : 'in_uniexam', { inst: instRef(iso0, 'uniExam', ue) });
    if (age >= 18) for (const k of ['health', 'pension'] as const) { const r = instStarts(iso0, k, calYear); if (r && r.from > s.born.year + 18) emit(k === 'health' ? 'in_health_start' : 'in_pension_start', { inst: instRef(iso0, k, r) }); }
    if (iso0 === 'USA' && age === 65 && calYear >= 1966) emit('in_us_medicare');
    const ce = instAt(iso0, 'civilExam', calYear);
    if (EXAM_COUNTRIES.includes(iso0) && ce && career.occ && CIVIL_OCC.includes(career.occ) && career.occ !== s.career.occ && flags.civEx === undefined) { const n = civilAttempts(stats.smart, v4); flags.civEx = n; emit('in_civilexam', { inst: instRef(iso0, 'civilExam', ce), n }); }
    const g = occById(career.occ)?.group;
    if (iso0 === 'JPN' && inLabor && g && JP_SPLIT_GROUPS.includes(g)) {
      if (flags.jpReg === undefined) { const sh = jpNonRegShare(calYear); flags.jpS = sh; flags.jpReg = v2 < sh ? 'n' : 'r'; emit(flags.jpReg === 'n' ? 'in_jp_nonreg' : 'in_jp_regular'); }
      else if (flags.jpReg === 'n' && v2 < JP_TO_REGULAR) { flags.jpReg = 'r'; emit('in_jp_to_regular'); }
      const R = jpRegWage(Number(flags.jpS)); if (flags.jpReg === 'n') { jpWageF = JP_NONREG_WAGE * R; jpUnempF = JP_NONREG_UNEMP; } else { jpWageF = R; jpUnempF = JP_REG_UNEMP; }
    }
  }
  let unemployed = false, income = 0, pension = 0, partTime = false;
  let earnSum = s.econ.earnSum, earnN = s.econ.earnN;
  const base = incomeAt(d, pct);
  const eduF = EDU_PREMIUM[career.plan] / premiumNorm(c, s.born.year);
  if (inLabor) {
    est.push(...dEst, 'tax');
    if (unempR.est) est.push('unemp');
    const occ = occOn ? occById(career.occ) : undefined;
    const uMult = (occ ? (occ.group === 'startup' || occ.group === 'illicit' || occ.group === 'status' ? (occ.id === 'job_seeker' ? 99 : occ.id === 'prison' ? 99 : 0) : occ.risk.unemp) : { stable: 0.5, private: 1, startup: 1.3, informal: 0.6 }[career.track]) * (career.plan === 'tertiary' || career.plan === 'graduate' ? 0.75 : career.plan === 'none' ? 1.1 : 1);
    unemployed = svcF < 1 && uUnemp < unempR.v * uMult * jpUnempF;
    if (L3 && iso0 === 'USA' && unemployed && age < 65 && !s.years.at(-1)?.unemployed) { const amt = Math.round(usUninsuredCost(calYear) * d.mean); cash -= amt; emit('in_us_uninsured', { amount: amt }); }
    // nominal wages only catch up λπ of this year's inflation → real wage factor (1+λπ)/(1+π)
    const lag = pi > 0 ? (1 + PARAMS.wageLag.value * pi) / (1 + pi) : 1;
    const luck = career.track === 'startup' ? Math.exp(0.6 * phiInv(Math.min(0.999, Math.max(0.001, uLuck))) - 0.18) : 1;
    const trackF = occ ? occWageF(occ.id, career.rung ?? 0, gdp0, career.plan, s.born.iso) * (occ.group === 'startup' ? Math.exp(BIZ[occ.id as Biz].sigma * phiInv(Math.min(0.999, Math.max(0.001, uLuck))) - BIZ[occ.id as Biz].sigma ** 2 / 2) : 1) * (career.penalty ?? 1)
      : { stable: 0.95, private: 1, startup: luck, informal: 0.7 }[career.track];
    const careF = career.careUntil !== undefined && age < career.careUntil ? 0.7 : 1;
    const wage = base * eduF * experienceFactor(age - career.workStart!) * career.mult * trackF * (career.city ? 1.15 : 1) * careF * jpWageF;
    if (occ?.id === 'prison') { unemployed = true; income = 0; }
    else if (unemployed) { income = benefitRate(c, calYear) * career.lastWage; if (income > 0) est.push('benefit'); }
    else { income = wage * lag; career.lastWage = wage; }
    earnSum += wage; earnN += 1; // earnings history for the pension
    if (svcF > 0) income = income * (1 - svcF) + svcF * svcPay * d.mean; // L2: months in service earn conscript pay (推估 share of the mean wage)
  } else if (studying && age >= 16) {
    income = PARAMS.studentWork.value * base * experienceFactor(0) * 0.75; partTime = true;
  } else if (retired && data.hp) {
    // OECD gross replacement rate × average real lifetime earnings (+ any purchased annuity)
    pension = earnN > 0 ? pen.grr * (earnSum / earnN) : 0;
    if (pen.est) est.push('pension');
    income = pension;
  }
  if (typeof flags.csLeft === 'number') { flags.csLeft -= 12; if (flags.csLeft <= 0) { delete flags.csLeft; flags.csDone = age; emit('cs_end_' + csKey(s.born.iso), { months: Number(flags.csMonths ?? 0) }); } }
  if (L3 && iso0 === 'KOR' && inLabor && !unemployed && calYear >= KR_EARLY.from && age >= KR_EARLY.ageMin && age <= KR_EARLY.ageMax && career.occ && KR_EARLY.occ.includes(career.occ) && v3 < KR_EARLY.p) {
    career.occPrev = career.occ; career.occ = 'food_retail_su'; career.rung = 0; career.bizAge = 0; career.track = 'startup'; cash += KR_EARLY.severance * d.mean; emit('in_kr_early_exit', { from: career.occPrev, amount: Math.round(KR_EARLY.severance * d.mean) });
  }
  // ---- C0 occupation dynamics: startup survival/exits, illicit arrest, prison, job seeking, rare transitions
  if (occOn && inLabor && career.occ) {
    const ro = stream(s.seed, 'occ', 'year', age); const u1 = ro.next(), u2 = ro.next(), u3 = ro.next();
    const o = occById(career.occ)!;
    if (o.group === 'startup') {
      const b = o.id as Biz; career.bizAge = (career.bizAge ?? 0) + 1;
      if (u1 < bizHazard(b, career.bizAge)) { emit('oc_biz_fail', { occ: o.id }); stats.happy -= 6; career.occ = career.occPrev && occById(career.occPrev)?.group !== 'startup' ? career.occPrev : legacyOcc('private', career.plan, gdp0); career.rung = 0; career.bizAge = undefined; career.track = 'private'; }
      else if (b === 'tech_su' && career.bizAge <= 5) {
        let a = 0; for (const [k, [p, mult]] of Object.entries(TECH_EXIT)) { a += p; if (u2 < a) { cash += mult * d.mean; emit('oc_biz_exit', { kind: k }); stats.happy += 8; career.occ = career.occPrev ?? 'pm_mgr'; career.bizAge = undefined; career.track = 'private'; break; } }
      }
    } else if (o.group === 'illicit') {
      if (u1 < ILLICIT[o.id]!.arrest) { const yrs = 1 + Math.floor(u2 * 3); career.prisonUntil = age + yrs; career.occ = 'prison'; emit('oc_arrest', { years: yrs }); stats.happy -= 10; stats.social -= 6; }
      else { stats.happy -= 3; stats.health -= 1; }
    } else if (o.id === 'prison') {
      stats.health -= 2; stats.social -= 3;
      if (age + 1 >= (career.prisonUntil ?? age)) { career.occ = 'job_seeker'; career.penalty = PRISON_PENALTY; career.prisonUntil = undefined; emit('oc_release'); }
    } else if (o.id === 'job_seeker') {
      career.occ = career.occPrev ?? career.occLegit ?? legacyOcc('private', career.plan, gdp0); career.rung = 0; emit('oc_back', { occ: career.occ });
    } else {
      for (const rp of RARE_PATHS) {
        if (!rp.from.includes(o.id) || (rp.space && !SPACE.includes(c.iso)) || (rp.social && stats.social < rp.social)) continue;
        if (u3 < rp.p) { career.occ = rp.to; career.rung = 0; emit('oc_rare', { occ: rp.to }); stats.happy += 6; break; }
      }
    }
    if (!unemployed && ENTRY_GROUPS.includes(occById(career.occ)?.group as never)) { const oy = typeof flags.occYears === 'string' ? JSON.parse(flags.occYears) as Record<string, string> : {}; oy[age] = occById(career.occ)!.group; flags.occYears = JSON.stringify(oy); }
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
      if (!Object.values(eff).some((v) => v > 0)) delete flags.fcLast; // v0.8.1: a cleared focus has no effect and no feedback line
      else {
      const fx = focusEffects(eff); fxNow = fx;
      for (const [k, v] of Object.entries(fx.fx) as [keyof typeof stats, number][]) stats[k] += v;
      if (inLabor && !unemployed) { income *= fx.incomeMult; if (fx.learnGrowth > 0) career.mult *= 1 + fx.learnGrowth; }
      { const b = Number(flags.bond ?? 50); flags.bond = Math.round(Math.max(0, Math.min(100, b + fx.bondAdd - 0.08 * (b - 50))) * 10) / 10; } // bond drifts back toward 50 unless tended
      flags.fcLast = JSON.stringify({ inc: Math.round((fx.incomeMult - 1) * 100), grow: Math.round(fx.learnGrowth * 1000) / 10, promo: Math.round((fx.promoMult - 1) * 100), hz: Math.round((healthHazard(stats.health, age, fx) - 1) * 100), cost: Math.round(fx.costShare * 100), marry: Math.round(fx.marryAdd * 100), bond: fx.bondAdd, school: Math.round(fx.schoolAdd * 1000) / 10, part: Math.round(fx.parttime * 100) });
      if (partTime && fx.parttime > 0) income *= 1 + fx.parttime;
      focusCost = fx.costShare * Math.max(0, income);
      if (inLabor && !unemployed && age >= 22 && age <= 58 && fx.jobMult > 1 && stream(s.seed, 'focus', age).next() < 0.04 * (fx.jobMult - 1)) {
        career.mult *= 1.06; stats.happy += 2; emit('job_change', { pct: 6 });
      }
    }
      }
  }
  income += s.econ.annuity; // a purchased annuity pays for life, working or not
  if (retired && data.hp && !s.econ.retired) emit('retire', { age: retireAge, pension: Math.round(pension) });
  const married0 = !!family.spouse;
  const kids0 = family.children.filter((k) => calYear - k.born < 18).length;
  if (events) {
    const out = events.run({ seed: s.seed, age, calYear, country: c, stats, cash, income, pct, unemployed, inLabor, flags, quintile: s.born.quintile, urban: s.born.urban, sex: s.born.sex, meanIncome: d.mean,
      studying, married: married0, kids: kids0, siblings: family.siblings.length, retired, owner: !!s.house, city: career.city, careerMult: career.mult, gdp: gdpPc, oop, ...(occOn && career.occ ? { occ: career.occ, occRung: career.rung ?? 0, occMaxRung: maxRung(career.occ) } : {}),
      ...(fxNow ? { focusPromo: fxNow.promoMult, focusFamily: fxNow.familyMult, focusDivorce: fxNow.divorceMult } : {}) });
    stats = out.stats; cash = out.cash; income = out.income; pct = out.pct;
    if (out.careerMult > career.mult * 1.05) career.promotions += 1;
    if (out.flags.rungUp) { career.rung = Math.min((career.rung ?? 0) + 1, maxRung(career.occ)); career.promotions += 1; delete out.flags.rungUp; }
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
  const fx = focusInForce(s.flags); // v0.8.1: same previous-year focus effect advanceYear uses, so the offers match exactly
  return offersAt({ s, c, calYear, meanIncome: incomeDist(c, calYear).d.mean, tfr: cohortTfr(data.wpp, s.born.iso, s.born.year), ...(fx ? { focus: fx } : {}) }).filter((o) => !s.actions.some((a) => a.t === 'choice' && a.age === s.age && a.id === o.id));
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
