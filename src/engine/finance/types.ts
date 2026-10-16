// Finance model types (real PPP USD; negative cash = informal debt). Portfolio: ./portfolio.ts (M4).
// Consumer credit M5. Estimated inputs are flagged in YearRow.est for "推估" display.
export type { Portfolio } from './portfolio.ts';
export { emptyPortfolio } from './portfolio.ts';

/** — reserved for M5 (信貸). Not used by the M3 engine. */
export interface PersonalLoan {
  id: string; country: string; startYear: number; principal: number; balance: number;
  termYears: number; rateType: 'float' | 'fixed'; spread: number; rate: number; pmt: number;
  purpose: 'invest' | 'cash' | 'bridge'; investedLots: string[]; missed: number; arrears: number;
  status: 'active' | 'paid' | 'default' | 'writtenOff'; src: 'official' | 'proxy';
}
export interface CreditState { unsecuredDebt: number; frozenUntil?: number; defaults: number }

/** Extension point: finance systems run in order each year; M5 will register a credit system here. */
export interface FinanceYearInput { cash: number; income: number; consumption: number; inflation: number }
export function settleCash(i: FinanceYearInput): number {
  // nominal-contract cash/debt is eroded by inflation; no interest until M4/M5
  return (i.cash + i.income - i.consumption) / (1 + i.inflation);
}
export const emptyCredit = (): CreditState => ({ unsecuredDebt: 0, defaults: 0 });
