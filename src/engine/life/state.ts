import type { Iso3, Sex } from '../data/types.ts';
import type { CreditState, PersonalLoan, Portfolio } from '../finance/types.ts';
import type { Edu } from '../economy/household.ts';
import type { PersonName } from '../content/names.ts';

export interface Stats { health: number; happy: number; smart: number; social: number }
export interface YearRow {
  age: number; calYear: number; income: number; consumption: number; cash: number; invested: number; houseEquity: number; debt: number; netWorth: number; pension: number; debtService: number;
  unemployed: boolean; inLabor: boolean; inflation: number; est: string[]; stats: Stats; eventIds: string[];
  /** P0: taxes paid, rent paid, student (part-time) flag */
  tax: number; rent: number; studying: boolean;
}
export interface LifeEvent { age: number; id: string; vars?: Record<string, number | string> }
export type Phase = 'setup' | 'birth' | 'life' | 'dead';
import type { InvestAsset } from '../finance/access.ts';
import type { PriceAsset } from '../finance/returns.ts';
export type Action = { t: 'speed'; speed: number } | { t: 'pause'; paused: boolean }
  | { t: 'alloc'; age: number; target: Partial<Record<InvestAsset, number>>; levBase?: PriceAsset; levK?: number }
  | { t: 'buyHouse'; age: number; term?: number } | { t: 'sellHouse'; age: number }
  | { t: 'loan'; age: number; amount: number; term: number; purpose: 'invest' | 'cash' | 'bridge' }
  | { t: 'annuity'; age: number; amount: number }
  | { t: 'choice'; age: number; id: string; opt: string }
  | { t: 'focus'; age: number; id?: string; w?: Record<string, number> }
  | { t: 'buy'; age: number; id: string } | { t: 'sell'; age: number; id: string } | { t: 'life'; age: number; key: string; value: string };
/** M5 owner-occupied house + floating-rate mortgage (real values; nominal rate applied then deflated) */
export interface House { value: number; price0: number; boughtYear: number; balance: number; termLeft: number; missed: number; est: boolean }

export interface Person { name: string; born: number }
export interface Family { mother: Person; father: Person; siblings: Person[]; spouse?: Person; children: Person[]; parentsAlive: boolean; region: string; /** batch 2: no child card before this age (cooldown / spacing) */ childCoolUntil?: number }
export type Track = 'stable' | 'private' | 'startup' | 'informal';
export interface Career {
  /** planned / completed education and the age full-time study ends (full-time work can start then) */
  plan: Edu; studyUntil: number; entry: number; track: Track; mult: number; city: boolean; lastWage: number;
  workStart?: number; trackSet?: boolean; /** C0 occupation system */ occ?: string; rung?: number; occPrev?: string; occLegit?: string; bizAge?: number; prisonUntil?: number; penalty?: number; careUntil?: number; careCostUntil?: number; promotions: number;
}

export interface LifeState {
  v: 3; id: string; seed: string; engineVersion: string; dataVersion: string;
  mode: 'normal' | 'advanced'; sandbox: { on: boolean; reasons: string[] }; replayOf?: string;
  phase: Phase;
  born: { iso: Iso3; year: number; urban: boolean; quintile: 1 | 2 | 3 | 4 | 5; sex: Sex; pct: number; lifeTableYear: number; estimated: string[] };
  cur: Iso3; age: number;
  stats: Stats;
  name: PersonName; family: Family; career: Career;
  econ: { cash: number; incomeReal: number; pct: number; employed: boolean; earnSum: number; earnN: number; annuity: number; retired: boolean };
  house?: House;
  portfolio: Portfolio; credit: CreditState; loans: PersonalLoan[];
  flags: Record<string, number | boolean | string>;
  actions: Action[]; years: YearRow[]; events: LifeEvent[];
  death?: { age: number; frac: number; year: number; cause: string };
}

export const clampStat = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
