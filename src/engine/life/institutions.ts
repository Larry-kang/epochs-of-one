// L3 (v0.11.0): T1 wave A — TW / US / JP / KR institutions.
// Facts (scheme names, start years, exam names) come from public/data/l2/institutions.json (pipeline/l2.mjs, licence
// L-facts, cited statutes; wording is our own). Mechanics are small and every parameter below is a design estimate (推估):
//   US  — health insurance tied to the job: an unemployment spell before 65 costs a share of the mean income (lower after ACA, 2014)
//   JP  — regular (正社員) vs non-regular (非正規) employment at entry: wage and job-loss factors, mean-neutral at the era's share
//   KR  — honourable early retirement (명예퇴직) around 50 from large-firm white-collar jobs → self-employment, with severance
//   TW/JP/KR — exam and scheme events (narrative; no probability uses anything but stats, education and era)
// Equity: no ethnicity, religion, region or name enters anything here; sex is NOT used (JP non-regular work is strongly
// female-skewed in reality, but we have no shipped ILOSTAT-equivalent series for it, so the share is sex-neutral — documented).
import instJson from '../../../public/data/l2/institutions.json' with { type: 'json' };

export interface InstRow { from: number; zh: string; en: string; ja?: string; ko?: string; kind?: string }
export type InstKey = 'school' | 'hsExam' | 'uniExam' | 'civilExam' | 'health' | 'pension';
export interface InstCountry { src: string[]; school: InstRow[]; hsExam: InstRow[]; uniExam: InstRow[]; civilExam: InstRow[]; health: InstRow[]; pension: InstRow[]; labour: { zh: string; en: string; ja?: string; ko?: string } }
export const INST: Record<string, InstCountry> = (instJson as unknown as { countries: Record<string, InstCountry> }).countries;
export const L3_COUNTRIES = Object.keys(INST);
/** the row in force in `year` (undefined before the first row) */
export function instAt(iso: string, key: InstKey, year: number): InstRow | undefined {
  const c = INST[iso]; if (!c) return undefined; let hit: InstRow | undefined;
  for (const r of c[key]) if (r.from <= year) hit = r;
  return hit;
}
/** the row that STARTS in `year` (scheme launch events) */
export const instStarts = (iso: string, key: InstKey, year: number) => INST[iso]?.[key].find((r) => r.from === year);
/** reference packed into event vars ("ISO|key|from") so the UI can name it in any language */
export const instRef = (iso: string, key: InstKey, r: InstRow) => `${iso}|${key}|${r.from}`;
export function instName(ref: string, lang: string): string {
  const [iso, key, from] = ref.split('|'); const r = INST[iso!]?.[key as InstKey]?.find((x) => String(x.from) === from); if (!r) return '';
  return lang === 'zh-TW' ? r.zh : lang === 'ja' ? r.ja ?? r.en : lang === 'ko' ? r.ko ?? r.en : r.en;
}
export const labourNote = (iso: string, lang: string) => { const l = INST[iso]?.labour; return !l ? '' : lang === 'zh-TW' ? l.zh : lang === 'ja' ? l.ja ?? l.en : lang === 'ko' ? l.ko ?? l.en : l.en; };

// ---- US: job-tied health insurance (推估)
/** one-off cost of an unemployment spell before 65, as a share of the mean income (COBRA / uninsured spells) */
export const usUninsuredCost = (year: number) => (year >= 2014 ? 0.015 : year >= 1986 ? 0.04 : 0.03);

// ---- JP: regular vs non-regular (推估 shares, shaped on the published Labour Force Survey trend; not ingested from e-Stat)
export const JP_NONREG: [number, number][] = [[1950, 0.12], [1985, 0.16], [1995, 0.21], [2005, 0.33], [2015, 0.375]];
export const jpNonRegShare = (y: number) => { let v = JP_NONREG[0]![1]; for (const [f, x] of JP_NONREG) if (y >= f) v = x; return v; };
export const JP_NONREG_WAGE = 0.7, JP_NONREG_UNEMP = 1.5, JP_REG_UNEMP = 0.75, JP_TO_REGULAR = 0.03;
/** expected non-regular share over a 40-year career for an entry share s, given yearly conversion to regular staff */
export const jpLifeShare = (s: number) => s * (1 - (1 - JP_TO_REGULAR) ** 40) / (40 * JP_TO_REGULAR);
/** regular wage factor R so the career-average wage is unchanged: R·(1 − s̄·(1 − 0.7)) = 1; non-regular earns 0.7·R */
export const jpRegWage = (s: number) => 1 / (1 - jpLifeShare(s) * (1 - JP_NONREG_WAGE));
/** groups where the regular / non-regular split applies (private employees; not public, startups, status roles) */
export const JP_SPLIT_GROUPS = ['trades', 'services', 'professional', 'special'];

// ---- KR: honourable early retirement (推估)
export const KR_EARLY = { from: 1998, ageMin: 50, ageMax: 56, p: 0.04, severance: 1.0, occ: ['pm_mgr', 'office_clerk', 'finance', 'sales_rep', 'hw_eng', 'sw_eng', 'semi_process_eng', 'accountant'] };

// ---- exams (pass draws: smart stat + study focus; rates 推估, no official pass-rate data shipped yet)
export const uniRetakeP = (smart: number, study: boolean) => Math.max(0.05, Math.min(0.5, 0.45 - smart / 250 - (study ? 0.08 : 0)));
export const civilAttempts = (smart: number, u: number) => (u < 0.25 + smart / 250 ? 1 : u < 0.7 + smart / 500 ? 2 : 3);
export const CIVIL_OCC = ['civil_servant', 'judge_prosecutor'];
export const EXAM_COUNTRIES = ['TWN', 'JPN', 'KOR'];

export const INST_EVENT_IDS = ['in_hsexam', 'in_uniexam', 'in_uniexam_retake_TWN', 'in_uniexam_retake_JPN', 'in_uniexam_retake_KOR', 'in_uniexam_retake_gen',
  'in_civilexam', 'in_health_start', 'in_pension_start', 'in_us_uninsured', 'in_us_medicare', 'in_jp_nonreg', 'in_jp_regular', 'in_jp_to_regular', 'in_kr_early_exit'];
