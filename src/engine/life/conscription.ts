// L2 conscription v1 (conscription is in v1).
// Terms are statutory facts (licence class L-facts: we encode parameters, never law text) and cite the statute or the
// official notice in CONSCRIPTION_SOURCES. Anything that is not a statutory fact — the share drafted under a lottery,
// branch mix, conscript pay as a share of the mean wage — is a design estimate and flagged 推估 (`est: true`).
// Equity: the ONLY person attribute used is sex, and only because the law itself defines who is called up.
import type { Sex } from '../data/types.ts';
import csJson from '../../../public/data/l2/conscription.json' with { type: 'json' };

export interface Term {
  /** first calendar year of service this row applies to (inclusive) */ from: number;
  /** months of service (army / main branch) */ months: number;
  /** probability that an eligible man is called up (1 = universal; < 1 = lottery / selective, 推估) */ p: number;
  /** only cohorts born in [bornFrom, bornTo] (TW 2013–2023 four-month rule and 2024 one-year rule are cohort based) */ bornFrom?: number; bornTo?: number;
  /** months for women where the law conscripts women (ISR) */ monthsF?: number;
  est?: boolean;
}
export interface Regime {
  /** service starts at this age, or right after full-time study (deferment), whichever is later; capped at maxAge */ age: number; maxAge: number;
  /** conscript pay as a share of the national mean wage while serving (推估) */ pay: (year: number) => number;
  terms: Term[];
  /** alternative service share (TW 替代役 2000+, DE Zivildienst, KR 사회복무요원; label only, 推估) */ alt?: { from: number; to?: number; p: number };
  /** KR: athletes can earn an exemption (Olympic medal / Asian Games gold); the share of conscript-age pro athletes who do is 推估 */ athleteExempt?: number;
  /** T1 = era history; T2 = current-law flag + term only */ tier: 1 | 2;
}
/** Era tables: public/data/l2/conscription.json (pipeline/l2.mjs, licence L-facts; est rows = 推估). Rows sorted by `from`;
 *  the last row whose `from` ≤ service year (and whose cohort bounds match) applies. */
type RegimeJson = Omit<Regime, 'pay'> & { pay: [number, number][]; src: string[]; note: string };
const RAW = (csJson as unknown as { regimes: Record<string, RegimeJson> }).regimes;
const payFn = (rows: [number, number][]) => (y: number) => { let v = rows[0]?.[1] ?? 0; for (const [f, x] of rows) if (y >= f) v = x; return v; };
export const CONSCRIPTION: Record<string, Regime & { src: string[]; note: string }> = Object.fromEntries(Object.entries(RAW).map(([k, r]) => [k, { ...r, pay: payFn(r.pay) }]));
/** statute / official-notice citations (facts only; cited, not copied). Licences: TW/KR/US gov facts → L-facts. */
export const CONSCRIPTION_SOURCES: Record<string, { law: string; url: string }[]> = {
  TWN: [{ law: '兵役法、兵役法施行法（全國法規資料庫）', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=F0040001' },
    { law: '國防部「兵役制度」常見問答（113年1月1日起回復1年役期）', url: 'https://www.mnd.gov.tw/CitizenServices/FAQ/cate/561368' },
    { law: '內政部役政署公告：97年1月1日起常備兵役期調整為1年', url: 'https://rdss.moi.gov.tw/MND_NCA/systemNewsAction.do?actionType=read&init=N&sn=50' }],
  KOR: [{ law: '병역법 (국가법령정보센터)', url: 'https://www.law.go.kr/법령/병역법' },
    { law: 'Ministry of National Defense: Improvement of the Military Service System (2020 terms)', url: 'https://mnd.go.kr/mndEN/368/subview.do' },
    { law: '국방부 병 복무기간 단축 조정 (2018–2021)', url: 'https://mnd.go.kr/mnd/269/subview.do' }],
  USA: [{ law: 'Military Selective Service Act, 50 U.S.C. §3801 et seq.', url: 'https://uscode.house.gov/view.xhtml?path=/prelim@title50/chapter49&edition=prelim' },
    { law: 'Selective Service System: induction statistics / history (US federal, public domain)', url: 'https://www.sss.gov/history-and-records/' }],
  JPN: [{ law: '自衛隊法 (volunteer force; no conscription law after 1945)', url: 'https://laws.e-gov.go.jp/law/329AC0000000165' }],
};

/** analysis switches for the equity check only (tools/l2/equity.test.ts); always on in the game */
export const L2_OPTS: { conscription: boolean; institutions: boolean } = { conscription: true, institutions: true };
export interface Service { months: number; est: boolean; alt: boolean; exempt?: 'athlete'; pay: number }
/** term row for a man (or a woman where the law conscripts women) entering service in `year`, born `born` */
export function termFor(iso: string, sex: Sex, born: number, year: number): Term | undefined {
  const r = CONSCRIPTION[iso]; if (!r) return undefined;
  let hit: Term | undefined;
  for (const t of r.terms) {
    if (t.from > year) continue;
    if (t.bornFrom !== undefined && born < t.bornFrom) continue;
    if (t.bornTo !== undefined && born > t.bornTo) continue;
    hit = t;
  }
  if (!hit) return undefined;
  if (sex === 'F') return hit.monthsF ? { ...hit, months: hit.monthsF } : undefined;
  return hit;
}
/** service age for this person: the regime's call-up age or the end of full-time study, whichever is later (deferment) */
export function serviceAge(iso: string, studyUntil: number): number | undefined {
  const r = CONSCRIPTION[iso]; if (!r) return undefined;
  const a = Math.max(r.age, studyUntil);
  return a <= r.maxAge ? a : undefined;
}
/** draw the service for one person (u1: call-up, u2: alternative service, u3: athlete exemption); undefined = no service */
export function drawService(iso: string, sex: Sex, born: number, year: number, occ: string | undefined, u1: number, u2: number, u3: number): Service | undefined {
  const r = CONSCRIPTION[iso]; const t = termFor(iso, sex, born, year);
  if (!r || !t || t.months <= 0 || u1 >= t.p) return undefined;
  const est = !!t.est || t.p < 1;
  if (occ === 'athlete' && r.athleteExempt && u3 < r.athleteExempt) return { months: 0, est: true, alt: false, exempt: 'athlete', pay: 0 };
  const alt = !!r.alt && year >= r.alt.from && (r.alt.to === undefined || year < r.alt.to) && u2 < r.alt.p;
  return { months: t.months, est, alt, pay: r.pay(year) };
}
/** share of the year spent in service given months still to serve */
export const serviceFrac = (left: number) => Math.min(12, Math.max(0, left)) / 12;
/** event ids: country-specific text for the L3 countries, generic text elsewhere */
export const CS_LOCAL = ['TWN', 'KOR', 'USA'] as const;
export const csKey = (iso: string) => ((CS_LOCAL as readonly string[]).includes(iso) ? iso : 'gen');
export const CS_EVENT_IDS = [...[...CS_LOCAL, 'gen'].flatMap((k) => ['cs_start_' + k, 'cs_end_' + k]), 'cs_alt_TWN', 'cs_alt_KOR', 'cs_alt_gen', 'cs_exempt_athlete'];
