// availability rules, data-driven. Every rule carries its source; rules marked 【待驗證】 are unverified examples.
import type { MarketsData } from './marketData.ts';
import { denseAt } from './marketData.ts';

export type InvestAsset = 'eqHome' | 'eqUS' | 'eqWorld' | 'gold' | 'btc' | 'levEq';
export const INVEST_ASSETS: InvestAsset[] = ['eqHome', 'eqUS', 'eqWorld', 'gold', 'btc', 'levEq'];
export interface AccessRule { asset: InvestAsset | 'foreign'; iso: string; from?: number; to?: number; kind: 'outbound' | 'ban'; src: string }

export const ACCESS_RULES: AccessRule[] = [
  { asset: 'foreign', iso: 'TWN', from: 1987, kind: 'outbound', src: 'example: 台灣 1987 外匯管制大幅放寬 (【待驗證】)' },
  { asset: 'foreign', iso: 'JPN', from: 1980, kind: 'outbound', src: 'example: 日本 1980 外匯法修正 (【待驗證】)' },
  { asset: 'foreign', iso: 'CHN', from: 2006, kind: 'outbound', src: 'example: 中國 2006 QDII (有額度；額度未建模) (【待驗證】)' },
  { asset: 'gold', iso: 'USA', from: 1933, to: 1974, kind: 'ban', src: 'example: 美國私人持有黃金禁令 1933–1974 (【待驗證】)' },
  { asset: 'btc', iso: 'CHN', from: 2021, kind: 'ban', src: 'example: 中國 2021 全面禁止交易 (【待驗證】)' },
];
export const MIN_INVEST_AGE = 18; // minimum age 18

export interface Avail { ok: boolean; why?: 'age' | 'nodata' | 'noexchange' | 'outbound' | 'ban' | 'cooldown' | 'frozen'; est?: boolean }

const FOREIGN: InvestAsset[] = ['eqUS', 'eqWorld', 'btc'];

/** Can a resident of `iso` aged `age` buy `asset` at the end of calendar year `year`? */
export function available(m: MarketsData, asset: InvestAsset, iso: string, year: number, age: number, opts: { levBase?: InvestAsset; cooldownUntil?: number; frozenUntil?: number } = {}): Avail {
  if (age < MIN_INVEST_AGE) return { ok: false, why: 'age' };
  for (const r of ACCESS_RULES) {
    if (r.iso !== iso) continue;
    const inRange = (r.from === undefined || year >= r.from) && (r.to === undefined || year <= r.to);
    if (r.kind === 'ban' && r.asset === asset && inRange) return { ok: false, why: 'ban' };
    if (r.kind === 'outbound' && r.asset === 'foreign' && FOREIGN.includes(asset) && iso !== 'USA' && r.from !== undefined && year < r.from) return { ok: false, why: 'outbound' };
  }
  switch (asset) {
    case 'eqHome': {
      const s = m.eq[iso];
      if (s) return year >= s.from ? { ok: true, est: s.unverified?.includes(year) } : { ok: false, why: 'nodata' };
      // no index data: exchange must exist (WDI CM.MKT.LDOM.NO > 0 some year ≤ now) → proxy from world index (推估)
      const first = m.listed[iso];
      if (first !== undefined && year >= first && year >= m.world.from) return { ok: true, est: true };
      return { ok: false, why: 'noexchange' };
    }
    case 'eqUS': return year >= m.eq.USA!.from ? { ok: true } : { ok: false, why: 'nodata' };
    case 'eqWorld': return year >= m.world.from ? { ok: true } : { ok: false, why: 'nodata' };
    case 'gold': return year >= m.gold.from ? { ok: true } : { ok: false, why: 'nodata' };
    case 'btc': return year >= m.btc.from ? { ok: true, est: m.btc.unverified?.includes(year) } : { ok: false, why: 'nodata' };
    case 'levEq': {
      if (opts.frozenUntil !== undefined && year < opts.frozenUntil) return { ok: false, why: 'frozen' };
      if (opts.cooldownUntil !== undefined && year < opts.cooldownUntil) return { ok: false, why: 'cooldown' };
      return available(m, opts.levBase ?? 'eqHome', iso, year, age);
    }
  }
}
export const hasFx = (m: MarketsData, iso: string, y: number) => denseAt(m.fx[iso], y) != null && denseAt(m.fx[iso], y - 1) != null;
