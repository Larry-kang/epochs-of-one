// P2–P4 play controls: speeds, keyboard, auto-choice countdown, skip-to-next-decision.
export const SPEEDS = [1, 2, 4, 8, 12, 16] as const;
export type Speed = (typeof SPEEDS)[number];
export const SKIP_SPEED = 24;
/** keys "1".."6" → speed */
export const speedForKey = (k: string): Speed | null => { const i = Number(k) - 1; return Number.isInteger(i) && i >= 0 && i < SPEEDS.length ? SPEEDS[i]! : null; };
/** v0.7.1 auto-choice reading time (s): clamp(textLength / 9, 5, 14) ÷ √speed, never under 1.2 s — a card stays
 *  readable (5–14 s at 1×, ~1.3–3.5 s at 16×) and is never instant. */
export const AUTO_MIN_SEC = 1.2;
export const autoCountdownSec = (textLen: number, speed: number) => Math.max(AUTO_MIN_SEC, Math.min(14, Math.max(5, textLen / 9)) / Math.sqrt(Math.max(1, speed)));
/** default life length at 1× (minutes); a year at 1× = pace ÷ expected lifespan (≈ 51 s at e0 ≈ 70) */
export const DEFAULT_PACE_MIN = 60;
/** family rows: hide relatives not born yet (younger siblings used to show at age −1) */
export const bornBy = <T extends { born: number }>(people: readonly T[], year: number): T[] => people.filter((p) => p.born <= year);
/** real seconds per sim year at a given speed (the play loop accrues dt·speed/yearSec) */
export const secPerYear = (yearSec: number, speed: number) => yearSec / Math.max(1, speed);
/** events that stop "skip to next decision" */
export const TRAGIC_EVENTS = new Set(['fl_parent_dies', 'illness', 'divorce', 'jobless_year', 'foreclosure', 'loanDefault', 'marginCall', 'fl_pet_dies',
  // batch 2 pool events: a death, serious injury/illness, or disaster loss halts skip-to-end
  'ev_grandparent_dies', 'ev_old_classmate_dies', 'ev_car_accident', 'ev_robbery', 'ev_chronic', 'ev_disability', 'ev_depression', 'ev_spouse_hospital', 'ev_flood_damage', 'ev_earthquake']);

/** "Show earlier N years" button state for the life log; N is clamped so it can never go negative. */
export const logMore = (years: number, limit: number, expanded: boolean) => {
  const earlier = Math.max(0, years - limit);
  return { hidden: earlier === 0, earlier, expanded: expanded && earlier > 0 };
};

/** batch 3 #7: staged birth-card reveal — delay between fields follows the chosen speed (600 ms at 1×, ≥ 60 ms) */
export const revealStepMs = (speed: number) => Math.max(60, 600 / Math.max(1, speed));
