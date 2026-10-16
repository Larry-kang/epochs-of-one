// P16 cited fact boxes. Every fact is computed from data already shipped under the project's licence policy:
// UN WPP 2024 (CC BY 3.0 IGO) and World Bank WDI (CC BY 4.0). Wording is ours; the citation names the source.
import type { CountryRec, Demography } from '../../engine/data/types.ts';
import { seriesAt } from '../../engine/data/types.ts';
import { t, num } from '../i18n.ts';
import { wppAt, type WppExtra } from '../../engine/life/fertility.ts';
import pool from '../../content/pool/content.json' with { type: 'json' };

export interface Fact { text: string; cite: string; est: boolean }
const WDI = (code: string) => t('cite_wdi', { code });
const WPP_ = () => t('cite_wpp');
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** fact keys allowed for content-pool decisions (all computed from WPP 2024 / WDI data shipped with the app) */
export const FACT_KEYS = ['q5', 'e0', 'tfr', 'sec', 'ter', 'unemp', 'urban', 'gdp', 'gini'] as const;
const POOL_FACT = new Map((pool.decisions as { id: string; fact: string }[]).map((d) => [d.id, d.fact]));
const ALIAS: Record<string, string> = { q5: 'vaccine', e0: 'marry', sec: 'hs', ter: 'uni', unemp: 'career', urban: 'move' };
export function factFor(id: string, c: CountryRec, name: string, year: number, demo?: Demography, wpp?: WppExtra): Fact | null {
  const key = POOL_FACT.get(id);
  if (key) {
    if (ALIAS[key]) return factFor(ALIAS[key], c, name, year, demo, wpp);
    if (key === 'tfr') { const v = wppAt(wpp, 'tfr', c.iso, year); return v === undefined ? null : { text: t('fact_tfr', { year, name, v: v.toFixed(1) }), cite: WPP_(), est: year > 2023 }; }
    if (key === 'gdp') { const r = seriesAt(c.series.gdpPcPpp, year); return { text: t('fact_gdp', { name, v: num(Math.round(r.v)) }), cite: WDI('NY.GDP.PCAP.PP.KD'), est: r.est }; }
    if (key === 'gini') { const r = seriesAt(c.series.gini, year); return { text: t('fact_gini', { name, v: (r.v * 100).toFixed(1) }), cite: WDI('SI.POV.GINI'), est: r.est }; }
  }
  const s = (k: keyof CountryRec['series']) => seriesAt(c.series[k], year);
  const yi = demo ? Math.min(Math.max(year - demo.from, 0), demo.e0.T.length - 1) : 0;
  switch (id) {
    case 'vaccine': case 'child': {
      if (!demo) return null;
      const q5 = demo.q5.T[yi]!;
      return { text: t('fact_q5', { year, name, n: Math.round(q5 * 1000) }), cite: WPP_(), est: year > demo.to };
    }
    case 'school': case 'hs': {
      const r = s('secEnr');
      return { text: t('fact_sec', { name, p: pct(Math.min(r.v, 1.5)) }), cite: WDI('SE.SEC.ENRR'), est: r.est };
    }
    case 'uni': case 'grad': {
      const r = s('terEnr');
      return { text: t('fact_ter', { name, p: pct(r.v) }), cite: WDI('SE.TER.ENRR'), est: r.est };
    }
    case 'career': {
      const r = s('unemp');
      return { text: t('fact_unemp', { name, p: (r.v * 100).toFixed(1) + '%' }), cite: WDI('SL.UEM.TOTL.ZS'), est: r.est };
    }
    case 'move': {
      const r = s('urban');
      return { text: t('fact_urban', { name, p: pct(r.v) }), cite: WDI('SP.URB.TOTL.IN.ZS'), est: r.est };
    }
    case 'marry': case 'parents': case 'treat': {
      if (!demo) return null;
      return { text: t('fact_e0', { year, name, v: demo.e0.T[yi]!.toFixed(1) }), cite: WPP_(), est: year > demo.to };
    }
    default: return null;
  }
}
