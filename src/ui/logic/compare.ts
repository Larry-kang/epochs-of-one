// v0.13.0: pure helpers for the death-record "compare with my country" card.
import type { CountryIndex, Iso3 } from '../../engine/data/types.ts';
import { seriesAt } from '../../engine/data/types.ts';
import { wppAt, type WppExtra } from '../../engine/life/fertility.ts';

export const DEFAULT_MY_COUNTRY: Record<'zh-TW' | 'en' | 'ja' | 'ko' | 'vi', string> = { 'zh-TW': 'TWN', en: 'USA', ja: 'JPN', ko: 'KOR', vi: 'VNM' };
export interface CompareRow { key: 'e0' | 'q5' | 'gdp'; born: number | null; mine: number | null }

export function compareRows(index: CountryIndex, wpp: WppExtra | undefined, bornIso: Iso3, myIso: Iso3, year: number): CompareRow[] {
  const wppVal = (k: 'e0' | 'q5', iso: Iso3): number | null => wppAt(wpp, k, iso, year) ?? null;
  const gdp = (iso: Iso3): number | null => {
    const c = index.countries.find((x) => x.iso === iso);
    return c ? seriesAt(c.series.gdpPcPpp, year).v : null;
  };
  return [
    { key: 'e0', born: wppVal('e0', bornIso), mine: wppVal('e0', myIso) },
    { key: 'q5', born: wppVal('q5', bornIso), mine: wppVal('q5', myIso) },
    { key: 'gdp', born: gdp(bornIso), mine: gdp(myIso) },
  ];
}

export function e0Diff(rows: CompareRow[]): number | null {
  const r = rows.find((x) => x.key === 'e0');
  if (!r || r.born === null || r.mine === null) return null;
  return Math.round((r.mine - r.born) * 10) / 10;
}
