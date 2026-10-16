// v0.7.1 timing model: 1× year = pace ÷ expected lifespan; speeds multiply the year rate exactly; auto-choice cards
// stay readable (÷√speed, ≥ 1.2 s); an unattended ~80-year life at 16× takes about 4–5 min.
import { describe, it, expect } from 'vitest';
import { SPEEDS, autoCountdownSec, secPerYear, DEFAULT_PACE_MIN, AUTO_MIN_SEC, bornBy } from '../../src/ui/logic/play.ts';
import { PARAMS } from '../../src/engine/params.ts';

const yearSec = (pace: number, e0: number) => Math.min(Math.max((pace * 60) / Math.max(e0, 60), PARAMS.minYearSec.value), PARAMS.maxYearSec.value);
const lifeSec = (ys: number, speed: number, years: number, cards: number[]) => years * secPerYear(ys, speed) + cards.reduce((a, n) => a + autoCountdownSec(n, speed), 0);
const cards = Array.from({ length: 25 }, (_, i) => 40 + ((i * 37) % 160));   // ~25 auto-chosen cards per life

describe('v0.7.1 timing model', () => {
  it('1× at the default 60-min pace is ≈ 51 s per year for e0 ≈ 70', () => {
    expect(DEFAULT_PACE_MIN).toBe(60);
    expect(yearSec(DEFAULT_PACE_MIN, 70)).toBeCloseTo(51.4, 1);
  });
  it('year ticks scale exactly with speed: 16× is 16× faster than 1×', () => {
    for (const sp of SPEEDS) expect(secPerYear(51, 1) / secPerYear(51, sp)).toBeCloseTo(sp, 9);
  });
  it('auto-choice countdown: shorter at higher speed, never instant', () => {
    for (const n of [0, 60, 200, 900]) {
      for (let i = 1; i < SPEEDS.length; i++) expect(autoCountdownSec(n, SPEEDS[i]!)).toBeLessThanOrEqual(autoCountdownSec(n, SPEEDS[i - 1]!));
      expect(autoCountdownSec(n, 16)).toBeGreaterThanOrEqual(AUTO_MIN_SEC);
      expect(autoCountdownSec(n, 1)).toBeGreaterThanOrEqual(5);
    }
  });
  it('unattended 80-year life at 16× (default pace, auto on) takes about 4–5 min', () => {
    for (const e0 of [72, 78, 82]) { const t = lifeSec(yearSec(DEFAULT_PACE_MIN, e0), 16, 80, cards); expect(t, `e0=${e0}`).toBeGreaterThan(210); expect(t, `e0=${e0}`).toBeLessThan(330); }
  });
  it('family rows hide relatives not yet born (no "age −1" sibling)', () => {
    expect(bornBy([{ born: 1990 }, { born: 1993 }], 1992)).toEqual([{ born: 1990 }]);
  });
});
