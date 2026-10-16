// X1 i18n (batch 2): every string in the app is served from ONE translation table, src/content/i18n/table.json,
// keyed by a stable id, with one column per language. Missing UI cells fall back to English, then to the zh-TW
// source; content (events, decisions) falls back to zh-TW. Numbers, money and country names use the language's locale.
import table from '../content/i18n/table.json' with { type: 'json' };

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
/** batch 3: content (events/decisions) has only the zh-TW column so far; containers that show it get lang="zh-Hant"
 *  in other languages so fonts, line breaking and screen readers treat the fallback text correctly. '' = no attribute. */
export function contentLang(): string { return getLang() === 'zh-TW' ? '' : 'zh-Hant'; }
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
export function money(x: number): string {
  const sign = x < 0 ? '−' : '';
  return `${sign}$${nf.format(Math.abs(Math.round(x)))}`;
}
export const num = (x: number): string => nf.format(x);
/** compact count for thousands of births (e.g. 1.33 億 / 133M) */
export const compact = (thousands: number): string => new Intl.NumberFormat(LOCALE[lang], { notation: 'compact', maximumFractionDigits: 2 }).format(thousands * 1000);
export const pctText = (p: number) => `${Math.round(p * 100)}%`;
