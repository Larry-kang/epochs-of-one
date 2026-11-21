// Item 6 (v0.15.0): auto-decide investing policy — a pure, deterministic year-end target (no RNG draws).
// Never invests with savings <= 0, with unsecured debt or under 18; keeps one year of spending in cash;
// equity share (110 − age)% clamped to 20–80%, scaled by risk; world stocks, else the home index.
import type { InvestAsset } from './access.ts';

const RISK = { low: 0.6, mid: 1, high: 1.2 } as const;
export const AUTO_MIN_SHARE = 0.05;

export function autoInvestTarget(o: { cash: number; invested: number; consumption: number; age: number; debt: number; risk?: keyof typeof RISK; canBuy: (a: InvestAsset) => boolean }): Partial<Record<InvestAsset, number>> {
  if (o.cash <= 0 || o.debt > 0 || o.age < 18) return {};
  const wealth = o.cash + Math.max(0, o.invested);
  const cap = Math.min(0.9, Math.min(0.8, Math.max(0.2, (110 - o.age) / 100)) * RISK[o.risk ?? 'mid']);
  const share = Math.min(cap, (wealth - Math.max(0, o.consumption)) / wealth);
  if (!(share >= AUTO_MIN_SHARE)) return {};
  const asset = (['eqWorld', 'eqHome'] as const).find((a) => o.canBuy(a));
  return asset ? { [asset]: share } : {};
}
