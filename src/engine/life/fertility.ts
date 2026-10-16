// Batch 2 fertility calibration. Children per life follow the UN WPP 2024 period TFR the cohort lives through
// (mean over ages 25–34, i.e. calendar years born+25..born+34 ≈ completed cohort fertility). Each life draws an
// integer family-size target from that mean; the child card is offered so the default policy lands on it, while a
// player's own answers still decide. Source: public/data/wpp-extra.json (CC BY 3.0 IGO).
import type { Iso3 } from '../data/types.ts';

export interface WppExtra { note: string; from: number; tfr: Record<Iso3, number[]>; e0: Record<Iso3, number[]>; q5: Record<Iso3, number[]> }
/** years without the child card after answering "not now" */
export const CHILD_COOLDOWN = 3;
/** years without the child card after a birth (spacing) */
export const BIRTH_SPACING = 2;
export const FERTILE = { from: 20, to: 44 } as const;

export function wppAt(w: WppExtra | undefined, k: 'tfr' | 'e0' | 'q5', iso: Iso3, year: number): number | undefined {
  const v = w?.[k][iso]; if (!v) return undefined;
  return v[Math.min(Math.max(year - w.from, 0), v.length - 1)];
}
export function cohortTfr(w: WppExtra | undefined, iso: Iso3, born: number): number | undefined {
  if (!w?.tfr[iso]) return undefined;
  let s = 0; for (let a = 25; a <= 34; a++) s += wppAt(w, 'tfr', iso, born + a)!;
  return s / 10;
}
/** Per-life target family size. Only married lives have children here, so the mean is scaled up by the
 *  expected married share; the result is split into integer + fractional part (Bernoulli on u). */
export function familyTarget(tfr: number, u: number, marriedShare = MARRIED_SHARE): number {
  const m = tfr / marriedShare;
  return Math.floor(m) + (u < m - Math.floor(m) ? 1 : 0);
}
/** empirical share of lives reaching 45 that ever marry in this engine (calibrated with tools/b2/fert.ts) */
export const MARRIED_SHARE = 0.8;
/** probability that the child card shows this year, given the target, children so far and years left */
export function childOfferP(target: number, n: number, age: number): number {
  if (n >= target) return 0.04;
  const left = Math.max(1, (FERTILE.to - age + 1) / BIRTH_SPACING);
  return Math.min(0.95, Math.max(0.25, (target - n) / left));
}
