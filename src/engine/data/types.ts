// Data contracts (mirror schemas/*.schema.json).
export type Iso3 = string;
export type Sex = 'M' | 'F';
export type ImpFlag = '' | 'interp' | 'nearest' | 'region' | 'world';
export interface Series { from: number; v: number[]; imp: ImpFlag[] }
export interface SimpleSeries { from: number; v: number[] }
export type SeriesKey = 'gdpPcPpp' | 'cpi' | 'gini' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'urban' | 'unemp' | 'hhCons';
export interface CountryRec {
  iso: Iso3; iso2: string; name: string; sub: number;
  births: SimpleSeries; srb: SimpleSeries;
  series: Record<SeriesKey, Series>;
}
export interface CountryIndex { dataVersion: string; ltYears: [number, number]; birthYears: [number, number]; countries: CountryRec[] }
export interface SexTable { qx: number[][]; mxLast: number[]; ax0: number[] }
export interface Demography {
  iso: Iso3; from: number; to: number; ages: number[];
  M: SexTable; F: SexTable;
  e0: { T: number[]; M: number[]; F: number[] };
  q5: { T: number[]; M: number[]; F: number[] };
}

/** Value lookup with year clamping; returns the value and whether it is an estimate (imputed or clamped). */
export function seriesAt(s: Series, year: number): { v: number; est: boolean } {
  const i = Math.min(Math.max(year - s.from, 0), s.v.length - 1);
  const clamped = year - s.from !== i;
  return { v: s.v[i]!, est: clamped || s.imp[i] !== '' };
}
export function simpleAt(s: SimpleSeries, year: number): number {
  const i = Math.min(Math.max(year - s.from, 0), s.v.length - 1);
  return s.v[i]!;
}
