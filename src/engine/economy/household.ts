// P0 household economics: education → graduation age, age–earnings profile, promotions, unemployment benefit,
// personal taxes, and consumption linked to income, family size and rent. All money real PPP 2021 USD.
// Data inputs (WDI, CC BY 4.0): GDP pc PPP, quintile shares/Gini (income level), GC.TAX.TOTL.GD.ZS (tax level),
// SE.SEC.ENRR / SE.TER.ENRR (schooling odds), SE.PRM.AGES (school entry age). Shape parameters are in PARAMS
// (each with a source / TODO(param)); the consumption level `consBase` is calibrated against OECD WDD (docs/calibration-wealth.md).
import type { CountryRec } from '../data/types.ts';
import { seriesAt } from '../data/types.ts';
import { PARAMS } from '../params.ts';

export type Edu = 'none' | 'primary' | 'secondary' | 'vocational' | 'tertiary' | 'graduate';
export const EDU_YEARS: Record<Edu, number> = { none: 0, primary: 6, secondary: 12, vocational: 12, tertiary: 16, graduate: 18 };
/** relative earnings premium by education (normalised per country-year by the schooling mix) */
export const EDU_PREMIUM: Record<Edu, number> = { none: 0.6, primary: 0.75, secondary: 1, vocational: 1.05, tertiary: 1.55, graduate: 1.8 };

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const at = (c: CountryRec, k: keyof CountryRec['series'], y: number) => seriesAt(c.series[k], y);

/** school entry age (WDI SE.PRM.AGES; fallback 6) */
export const entryAge = (c: CountryRec, birthYear: number) => clamp(Math.round(at(c, 'prmAge', birthYear + 6).v || 6), 5, 8);
/** age at which full-time work can start for a given education (TW ≈ 6+16 = 22 for university) */
export const gradAge = (edu: Edu, entry: number) => (edu === 'none' ? 15 : Math.max(15, entry + EDU_YEARS[edu]));

/** Probabilities from gross enrolment (capped at 1): P(secondary) at age 15, P(tertiary | secondary) at 18. */
export function schoolingOdds(c: CountryRec, birthYear: number): { pPrimary: number; pSec: number; pTerGivenSec: number; est: boolean } {
  const s = at(c, 'secEnr', birthYear + 15), t = at(c, 'terEnr', birthYear + 19);
  const pSec = clamp(s.v, 0.02, 0.99);
  const pTer = clamp(t.v / Math.max(pSec, 0.05), 0.01, 0.95);
  const pPrimary = clamp(0.35 + pSec, 0.3, 0.995);
  return { pPrimary, pSec, pTerGivenSec: pTer, est: s.est || t.est };
}
/** country-year mean of EDU_PREMIUM over the schooling mix (so the country mean earning stays at the data level) */
export function premiumNorm(c: CountryRec, birthYear: number): number {
  const o = schoolingOdds(c, birthYear);
  const pNone = 1 - o.pPrimary, pPri = o.pPrimary - o.pSec, pSec = o.pSec * (1 - o.pTerGivenSec), pTer = o.pSec * o.pTerGivenSec;
  return pNone * EDU_PREMIUM.none + pPri * EDU_PREMIUM.primary + pSec * EDU_PREMIUM.secondary + pTer * EDU_PREMIUM.tertiary;
}

/** Mincer-style experience profile, normalised to mean 1 over 40 working years (start ≈ 0.72, peak ≈ 1.27 at ~28 years). */
export function experienceFactor(x: number): number {
  const f = (e: number) => Math.exp(PARAMS.expB1.value * e - PARAMS.expB2.value * e * e);
  let m = 0; for (let e = 0; e < 40; e++) m += f(e); m /= 40;
  return f(Math.max(0, x)) / m;
}

/** Effective personal tax + social-contribution rate. Level from WDI tax revenue %GDP scaled by income level
 *  (rich countries collect payroll contributions outside central tax revenue; poor ones have large informal sectors);
 *  mildly progressive in relative income. 推估 (TODO(param): OECD Taxing Wages would replace this for OECD members). */
export function taxRate(c: CountryRec, y: number, gross: number, mean: number): { rate: number; est: boolean } {
  const tx = at(c, 'tax', y), g = at(c, 'gdpPcPpp', y).v;
  const level = clamp(tx.v * (0.6 + 1.6 * clamp(Math.log(g / 2000) / Math.log(60000 / 2000), 0, 1)), 0.02, 0.38);
  const rel = mean > 0 ? gross / mean : 1;
  return { rate: clamp(level * Math.pow(clamp(rel, 0.15, 6), PARAMS.taxProgress.value), 0, 0.55), est: true };
}

/** Unemployment benefit as a share of the previous wage (none where social insurance is rare). 推估 TODO(param). */
export const benefitRate = (c: CountryRec, y: number) => (at(c, 'gdpPcPpp', y).v >= PARAMS.benefitGdpMin.value ? PARAMS.benefitRate.value : 0);

export interface SpendIn {
  disp: number; meanDisp: number; renter: boolean; married: boolean; kids: number; city: boolean; retired: boolean;
  wealth: number; yearsLeft: number; cash: number;
}
export interface Spend { core: number; rent: number; kids: number; drawdown: number; total: number }
/** Annual consumption. Core spending falls as a share of income when richer (MPC); rent is tied to local typical
 *  income; each dependent child costs a share of a blend of own and typical income; retirees run down savings. */
export function spending(i: SpendIn): Spend {
  const rel = i.meanDisp > 0 ? Math.max(i.disp, 1) / i.meanDisp : 1;
  const coreShare = clamp(PARAMS.consBase.value * Math.pow(rel, -PARAMS.consElastic.value), 0.4, 0.97);
  const core = Math.max(i.disp, 0) * coreShare;
  const blend = 0.5 * Math.max(i.disp, 0) + 0.5 * i.meanDisp;
  const rent = i.renter ? PARAMS.rentShare.value * blend * (i.city ? 1.4 : 1) * (i.married ? 0.6 : 1) : 0;
  const kids = i.kids * PARAMS.childCost.value * blend * (i.married ? 0.6 : 1);
  const drawdown = i.retired && i.wealth > 0 ? i.wealth / Math.max(5, i.yearsLeft) : 0;
  let total = core + rent + kids + drawdown;
  const floor = PARAMS.subsistence.value * i.meanDisp;
  // cannot spend money you do not have: above income only out of positive savings (and never below a basic floor if savings allow)
  const room = Math.max(i.disp, 0) + Math.max(0, i.cash);
  total = Math.min(total, Math.max(room, Math.min(floor, Math.max(i.disp, 0))));
  return { core, rent, kids, drawdown, total: Math.max(0, total) };
}
