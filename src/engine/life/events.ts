// Event system interface (content lives in src/engine/content/registry.ts; text in src/content/zh-TW).
import type { CountryRec, Sex } from '../data/types.ts';
import type { Stats } from './state.ts';

export interface EventCtx {
  seed: string; age: number; calYear: number; country: CountryRec; stats: Stats; cash: number; income: number;
  pct: number; unemployed: boolean; inLabor: boolean; flags: Record<string, number | boolean | string>;
  quintile: number; urban: boolean; sex: Sex; meanIncome: number;
}
export interface EventOut { stats: Stats; cash: number; income: number; pct: number; flags: Record<string, number | boolean | string>; fired: { id: string; vars?: Record<string, number | string> }[] }
export interface EventSystem { run(ctx: EventCtx): EventOut }
