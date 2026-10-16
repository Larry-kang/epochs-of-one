import ui from '../content/zh-TW/ui.json';
import events from '../content/zh-TW/events.json';

type UiKey = keyof typeof ui;
export function t(k: UiKey, vars: Record<string, string | number> = {}): string {
  return fill(ui[k], vars);
}
export function eventText(id: string, vars: Record<string, string | number> = {}): string {
  const s = (events as Record<string, string>)[id];
  return s ? fill(s, vars) : id;
}
function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const dn = (() => { try { return new Intl.DisplayNames(['zh-Hant-TW', 'zh-Hant'], { type: 'region' }); } catch { return null; } })();
export function countryName(iso2: string, fallback: string): string {
  if (iso2 && dn) { try { const n = dn.of(iso2); if (n && n !== iso2) return n; } catch { /* ignore */ } }
  return fallback;
}
const nf = new Intl.NumberFormat('zh-Hant-TW', { maximumFractionDigits: 0 });
export function money(x: number): string {
  const sign = x < 0 ? '−' : '';
  return `${sign}$${nf.format(Math.abs(Math.round(x)))}`;
}
export const pctText = (p: number) => `${Math.round(p * 100)}%`;
