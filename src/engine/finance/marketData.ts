// Contracts for public/data/markets/markets.json (schemas/markets.schema.json) and housing-pension.json.
export interface Dense { from: number; v: (number | null)[] }
export interface Priced { from: number; v: number[]; kind: 'dec_monthly' | 'oecd_avg' | 'close' | 'annual_avg' | 'synthetic_gdp_weighted'; src: string; dd?: (number | null)[]; unverified?: number[]; n?: number[] }
export interface MarketsData {
  note: string; retrieved: string;
  eq: Record<string, Priced>; fxEuroRebased: string[]; world: Priced; gold: Priced; btc: Priced;
  fx: Record<string, Dense>; lend: Record<string, Dense>; ppp: Record<string, Dense>; listed: Record<string, number>;
  sigma: { eqUS: number; eqWorld: number; gold: number; btc: number; eqHomeMedian: number; eqHome: Record<string, number> };
}
export interface Pension { grrM: number; grrF: number; ageM: number; ageF: number }
export interface HousingPension { note: string; retrieved: string; house: Record<string, { from: number; v: number[] }>; pension: Record<string, Pension>; pensionMedian: Pension }

export const denseAt = (s: Dense | Priced | undefined, y: number): number | null =>
  s && y >= s.from && y - s.from < s.v.length ? (s.v[y - s.from] ?? null) : null;
export const lastYear = (s: { from: number; v: unknown[] }) => s.from + s.v.length - 1;
