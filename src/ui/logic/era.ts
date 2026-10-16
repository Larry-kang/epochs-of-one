// H6 era selector → engine Era. 'any' picks an era first (equal odds), then a year.
import type { Era } from '../../engine/life/sim.ts';

export type EraChoice = 'past' | 'now' | 'future' | 'any';
export const ERA_CHOICES: EraChoice[] = ['past', 'now', 'future', 'any'];

export function resolveEra(choice: EraChoice, year: number | 'random', u: number): Era {
  if (choice === 'now') return { kind: 'now' };
  if (choice === 'past') return { kind: 'past', year };
  if (choice === 'future') return { kind: 'future', year: 'random' };
  const k = Math.min(2, Math.floor(u * 3));
  return k === 0 ? { kind: 'past', year: 'random' } : k === 1 ? { kind: 'now' } : { kind: 'future', year: 'random' };
}
/** year range whose births the odds card shows for a choice */
export function oddsRange(choice: EraChoice, year: number | 'random', nowYear: number, birthYears: [number, number]): [number, number] {
  const [b0, b1] = birthYears;
  if (choice === 'now') return [nowYear, nowYear];
  if (choice === 'past') return year === 'random' ? [b0, nowYear - 1] : [year, year];
  if (choice === 'future') return [Math.min(nowYear + 1, b1), b1];
  return [b0, b1];
}
