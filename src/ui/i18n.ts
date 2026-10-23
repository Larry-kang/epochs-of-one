// X1 i18n (batch 2): every string in the app is served from ONE translation table, src/content/i18n/table.json,
// keyed by a stable id, with one column per language. Missing UI cells fall back to English, then to the zh-TW
// source; content (events, decisions) falls back to zh-TW. Numbers, money and country names use the language's locale.
import table from '../content/i18n/table.json' with { type: 'json' };
import currency from '../content/l3-currency.json' with { type: 'json' };

export const LANGS = ['zh-TW', 'en', 'ja', 'ko', 'vi'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { 'zh-TW': '繁體中文', en: 'English', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt' };
const LOCALE: Record<Lang, string> = { 'zh-TW': 'zh-Hant-TW', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', vi: 'vi-VN' };
const K_LANG = 'epochs.lang.v1';
type Row = (string | null)[];
const S = table.strings as unknown as Record<'ui' | 'events' | 'decisions' | 'pool', Record<string, Row>>;
type UiKey = keyof typeof table.strings.ui;

function detect(): Lang {
  try {
    const v = globalThis.localStorage?.getItem(K_LANG);
    if (v && (LANGS as readonly string[]).includes(v)) return v as Lang;
  } catch { /* storage off */ }
  return 'zh-TW';
}
let lang: Lang = detect();
let col = LANGS.indexOf(lang);
export const getLang = (): Lang => lang;
export const locale = (): string => LOCALE[lang];
/** switch language (persisted); callers re-render */
export function setLang(l: Lang): void {
  lang = l; col = LANGS.indexOf(l);
  try { globalThis.localStorage?.setItem(K_LANG, l); } catch { /* storage off */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  nf = new Intl.NumberFormat(LOCALE[l], { maximumFractionDigits: 0 }); dn = makeDn();
}
const pickUi = (r: Row | undefined) => (r ? r[col] ?? r[1] ?? r[0] ?? undefined : undefined);
const pickContent = (r: Row | undefined) => (r ? r[col] ?? r[0] ?? undefined : undefined);

export function t(k: UiKey, vars: Record<string, string | number> = {}): string {
  return fill(pickUi(S.ui[k]) ?? pickContent(S.decisions[k]) ?? k, vars);
}
/** optional key: '' when the table has no entry (content-pool decisions have no body / sub-line keys) */
export function tMaybe(k: string, vars: Record<string, string | number> = {}): string {
  const v = pickUi(S.ui[k]) ?? pickContent(S.decisions[k]);
  return v === undefined ? '' : fill(v, vars);
}
export function eventText(id: string, vars: Record<string, string | number> = {}): string {
  const s = pickContent(S.events[id]);
  return s ? fill(s, vars) : id;
}
/** v0.11.1: content (events / decisions / pool) is translated into en, ja and ko; other languages still fall back to
 *  the zh-TW text, so containers that show it get lang="zh-Hant" (fonts, line breaking, screen readers). '' = no attribute. */
const CONTENT_ROWS = () => [...Object.values(S.events), ...Object.values(S.decisions), ...Object.values(S.pool)].filter((r) => r[0]);
const contentDone = new Map<number, boolean>();
/** every content row has the current language's own text */
export function contentTranslated(): boolean {
  if (col === 0) return true;
  if (!contentDone.has(col)) contentDone.set(col, CONTENT_ROWS().every((r) => !!r[col]));
  return contentDone.get(col)!;
}
export function contentLang(): string { return contentTranslated() ? '' : 'zh-Hant'; }
export const contentLangAttr = () => (contentLang() ? ` lang="${contentLang()}"` : '');
export function poolText(id: string): string { return pickContent(S.pool[id]) ?? id; }
/** share of the UI table translated into a language (About page / tests) */
export function coverage(l: Lang): number { const i = LANGS.indexOf(l); const rows = Object.values(S.ui).filter((r) => r[0]); return rows.filter((r) => r[i]).length / rows.length; }
function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function makeDn(): Intl.DisplayNames | null { try { return new Intl.DisplayNames([LOCALE[lang]], { type: 'region' }); } catch { return null; } }
let dn = makeDn();
export function countryName(iso2: string, fallback: string): string {
  if (iso2 && dn) { try { const n = dn.of(iso2); if (n && n !== iso2) return n; } catch { /* ignore */ } }
  return fallback;
}
let nf = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 0 });
// v0.11.1: display currency. Engine amounts are 2021 PPP international $; money() converts for display only with the
// country's 2021 PPP factor (WDI PA.NUS.PPP, CC BY 4.0 → src/content/l3-currency.json). No factor (e.g. Taiwan, not in
// WDI) → shown as labelled US$ without conversion. Never feed a converted value back into the engine.
const CUR = (currency as unknown as { rates: Record<string, { c: string; r: number }> }).rates;
const SYM: Record<string, string> = { USD: 'US$', TWD: 'NT$', JPY: '¥', KRW: '₩', CNY: 'CN¥', EUR: '€', GBP: '£', INR: '₹', HKD: 'HK$', SGD: 'S$', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', VND: '₫', PHP: '₱', THB: '฿', NGN: '₦', ILS: '₪', BRL: 'R$', MXN: 'MX$', CHF: 'CHF ', RUB: '₽', TRY: '₺', UAH: '₴', IDR: 'Rp', MYR: 'RM' };
let curIso: string | null = null;
/** set the country whose currency money() shows (the current life's birth country); null → US$ */
export function setMoneyCountry(iso: string | null): void { curIso = iso; }
export function currencyOf(iso: string | null): { code: string; sym: string; rate: number } {
  const e = iso ? CUR[iso] : undefined;
  if (!e) return { code: 'USD', sym: 'US$', rate: 1 };
  return { code: e.c, sym: SYM[e.c] ?? `${e.c} `, rate: e.r };
}
export function money(x: number, iso: string | null = curIso): string {
  const { sym, rate } = currencyOf(iso); const v = x * rate;
  const sign = v < 0 ? '−' : '';
  return `${sign}${sym}${nf.format(Math.abs(Math.round(v)))}`;
}
/** amounts the player types (loan, annuity) stay in the engine unit; this labels them */
export const moneyUsd = (x: number): string => money(x, null);
export const num = (x: number): string => nf.format(x);
/** compact count for thousands of births (e.g. 1.33 億 / 133M) */
export const compact = (thousands: number): string => new Intl.NumberFormat(LOCALE[lang], { notation: 'compact', maximumFractionDigits: 2 }).format(thousands * 1000);
export const pctText = (p: number) => `${Math.round(p * 100)}%`;
