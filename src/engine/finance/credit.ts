// M5: consumer credit, mortgages and annuities — pure functions. Money in real PPP USD unless stated.
import type { MarketsData, HousingPension } from './marketData.ts';
import { denseAt } from './marketData.ts';
import { PARAMS } from '../params.ts';
import { LAST_DATA_YEAR, BOOT_FROM } from './returns.ts';

/** Level-payment annuity: PMT = L·r/(1−(1+r)^−n); r = 0 → L/n. */
export function pmt(L: number, r: number, n: number): number {
  if (n <= 0) return L;
  if (Math.abs(r) < 1e-12) return L / n;
  return (L * r) / -Math.expm1(-n * Math.log1p(r)); // expm1/log1p: no cancellation for small r
}

/** Convert real 2021-PPP intl$ to the local nominal currency of year y (for rules written in local money).
 *  = x · PPP(y) [LCU per current intl$, WDI PA.NUS.PPP] · P_US(y)/P_US(2021) [US CPI chain]. Missing PPP → nearest year (est). */
export function toLocalNominal(m: MarketsData, iso: string, y: number, x: number, piUS: (y: number) => number): { v: number; est: boolean } {
  const s = m.ppp[iso];
  let ppp = denseAt(s, y), est = false;
  if (ppp == null && s) {
    let bd = Infinity;
    s.v.forEach((v, k) => { if (v != null && Math.abs(s.from + k - y) < bd) { bd = Math.abs(s.from + k - y); ppp = v; } });
    est = true;
  }
  if (ppp == null) return { v: NaN, est: true };
  let idx = 1;
  if (y > 2021) for (let t = 2022; t <= y; t++) idx *= 1 + piUS(t);
  else for (let t = y + 1; t <= 2021; t++) idx /= 1 + piUS(t);
  return { v: x * ppp * idx, est: est || y > LAST_DATA_YEAR };
}

export interface CreditRule {
  enabled: boolean; src: 'official' | 'proxy';
  /** max unsecured balance (real) given annual income (real) and existing unsecured debt; Infinity = no explicit cap */
  cap: number; dsrMax: number; legalCap?: number; minIncomeOk: boolean; note: string;
}
const ENABLED = new Set(['TWN', 'USA', 'JPN', 'KOR', 'GBR', 'DEU', 'CHN', 'SGP', 'AUS']); // 9 enabled countries

/** country rules. Rules with effective dates use the proxy before that date (flagged).  */
export function creditRule(m: MarketsData, iso: string, y: number, incomeY: number, unsecured: number, piUS: (y: number) => number): CreditRule {
  const proxyCap = PARAMS.dtiProxy.value * incomeY;
  const base: CreditRule = { enabled: false, src: 'proxy', cap: 0, dsrMax: PARAMS.dsrProxy.value, minIncomeOk: true, note: 'disabled' };
  if (!ENABLED.has(iso) || y < 1970) return { ...base, note: y < 1970 ? 'pre-1970: consumer credit disabled' : 'country rules not compiled' };
  const r: CreditRule = { ...base, enabled: true, cap: Math.max(0, proxyCap - unsecured), note: 'capProxy (推估)' };
  switch (iso) {
    case 'TWN':
      // DBR22: unsecured total ≤ 22 × average monthly income (FSC; in force by 2006-09 at the latest); mortgages excluded
      if (y >= 2006) Object.assign(r, { src: 'official', cap: Math.max(0, (22 * incomeY) / 12 - unsecured), note: 'DBR22' });
      r.legalCap = y >= 2021 ? 0.16 : 0.2; // 民法 §205 (2021 修正 16%【待驗證】; 之前 20%)
      break;
    case 'JPN':
      // 総量規制 (貸金業者): total ≤ 1/3 annual income, from 2010-06-18; 利息制限法 15–20% (use 15% for ≥¥1M, 18% for ¥100k–1M, 20% below)
      if (y >= 2010) Object.assign(r, { src: 'official', cap: Math.max(0, incomeY / 3 - unsecured), note: '総量規制 1/3' });
      r.legalCap = 0.18;
      break;
    case 'KOR':
      if (y >= 2025) Object.assign(r, { src: 'official', cap: Math.max(0, incomeY - unsecured), note: 'credit ≤ 100% annual income (2025-06-28)' });
      if (y >= 2022) r.dsrMax = 0.4; // bank DSR 40% (2022-01)
      r.legalCap = 0.2;
      break;
    case 'SGP': {
      if (y >= 2015) { // MAS Notice 635 thresholds (phase-in year 【待驗證】)
        const sgd = toLocalNominal(m, 'SGP', y, incomeY, piUS).v;
        const monthly = incomeY / 12;
        // / MAS unsecured-credit rule (owner decision 2026-10-16): eligibility needs ≥ S$20k
        // annual income; S$20k–30k → limit 2 × monthly income; S$30k–120k → 4 × monthly; ≥ S$120k → no regulatory cap
        if (!(sgd >= 20000)) Object.assign(r, { src: 'official', minIncomeOk: false, cap: 0, note: 'income < S$20k: not eligible for unsecured credit (MAS)' });
        else if (sgd < 30000) Object.assign(r, { src: 'official', cap: Math.max(0, 2 * monthly - unsecured), note: '2 × monthly income' });
        else if (sgd < 120000) Object.assign(r, { src: 'official', cap: Math.max(0, 4 * monthly - unsecured), note: '4 × monthly income' });
        else Object.assign(r, { src: 'official', note: '≥ S$120k: no regulatory cap (capProxy applies)' });
      }
      break;
    }
    case 'CHN': {
      if (y >= 2020) { // 2020 互聯網貸款辦法: consumer credit line ≤ CNY 200,000 (online loans; offline 【待驗證】)
        const cnyPerReal = toLocalNominal(m, 'CHN', y, 1, piUS).v;
        const capReal = 200000 / cnyPerReal;
        Object.assign(r, { src: 'official', cap: Math.max(0, Math.min(capReal, Infinity) - unsecured), note: 'CNY 200k cap' });
      }
      r.legalCap = 0.15; // 4×LPR (≈15% in 2020) 【待驗證】
      break;
    }
    default: break; // USA/GBR/DEU/AUS: no statutory cap → capProxy (推估)
  }
  return r;
}

/** Fair life-annuity factor ä = Σ_{k≥0} S_k/(1+r)^k (payments at the start of each year while alive), from the period table p[age]. */
export function annuityFactor(p: ArrayLike<number>, age: number, r: number = PARAMS.annuityRate.value, maxAge = 120): number {
  let S = 1, a = 0;
  for (let x = age; x <= maxAge; x++) { a += S / Math.pow(1 + r, x - age); S *= 1 - Math.min(1, p[Math.min(x, p.length - 1)] ?? 1); if (S < 1e-9) break; }
  return a;
}
/** Annual real payout bought with premium P at `age`. */
export const annuityPayout = (premium: number, p: ArrayLike<number>, age: number) => premium / (annuityFactor(p, age) * (1 + PARAMS.annuityLoad.value));

/** Real house-price change (OECD RHP is already CPI-deflated). No series → OECD cross-country median of that year (proxy, 推估).
 *  Future years use the same bootstrap year draw as markets. */
export function houseReturn(hp: HousingPension, iso: string, y: number, uBoot: number): { r: number; est: boolean } {
  const at = (s: { from: number; v: number[] } | undefined, yy: number) => (s && yy - 1 >= s.from && yy - s.from < s.v.length ? s.v[yy - s.from]! / s.v[yy - 1 - s.from]! - 1 : null);
  const yy = y > LAST_DATA_YEAR ? BOOT_FROM + Math.floor(uBoot * (LAST_DATA_YEAR - BOOT_FROM + 1)) : y;
  const own = at(hp.house[iso], yy);
  if (own != null) return { r: own, est: y > LAST_DATA_YEAR };
  const xs = Object.values(hp.house).map((s) => at(s, yy)).filter((v): v is number => v != null).sort((a, b) => a - b);
  return { r: xs.length ? xs[xs.length >> 1]! : 0, est: true };
}

export function pensionFor(hp: HousingPension | undefined, iso: string, sex: 'M' | 'F'): { age: number; grr: number; est: boolean } {
  if (!hp) return { age: PARAMS.retireAge.value, grr: 0, est: true };
  const p = hp.pension[iso];
  const src = p ?? hp.pensionMedian;
  return { age: Math.round(sex === 'M' ? src.ageM : src.ageF), grr: sex === 'M' ? src.grrM : src.grrF, est: !p };
}
