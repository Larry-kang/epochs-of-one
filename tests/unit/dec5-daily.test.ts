// Item 5 P1 / v0.20.0: daily theme — one fixed seed per UTC day; the birth year is picked deterministically and
// skips (year, birth country) pairs on the self-compiled crisis list (wars, famines, major disasters, pandemics).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { utcDay, dailySeed, crisisAt, pickDaily, CRISES } from '../../src/ui/logic/daily.ts';
import { SEED_RE } from '../../src/engine/rng/streams.ts';
import { drawBirth } from '../../src/engine/life/sim.ts';
import type { CountryIndex } from '../../src/engine/data/types.ts';

const index = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryIndex;
const countryFor = (seed: string) => (year: number) => {
  const b = drawBirth(index, { seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 'x', occ: true, l2: true });
  return 'infeasible' in b ? null : b.iso;
};
const pick = (day: string) => pickDaily(day, 1950, 2025, countryFor(dailySeed(day)));

describe('daily theme', () => {
  it('uses the UTC date and a seed the seed field accepts', () => {
    expect(utcDay(new Date('2026-11-21T23:30:00+08:00'))).toBe('2026-11-21');
    expect(utcDay(new Date('2026-11-22T07:59:00+08:00'))).toBe('2026-11-21');
    expect(dailySeed('2026-11-21')).toBe('daily-20261121');
    expect(SEED_RE.test(dailySeed('2026-11-21'))).toBe(true);
  });
  it('knows crisis years per birth country, and global ones', () => {
    expect(crisisAt(1950, 'KOR')?.id).toBe('korean_war');
    expect(crisisAt(1999, 'TWN')?.id).toBe('chi_chi_earthquake');
    expect(crisisAt(2020, 'USA')?.id).toBe('covid19');
    expect(crisisAt(1990, 'TWN')).toBeUndefined();
  });
  it('every crisis entry is sourced, dated and well-formed', () => {
    expect(CRISES.length).toBeGreaterThanOrEqual(60);
    for (const c of CRISES) {
      expect(c.src).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
      expect(c.checked).toBe('2026-11-21');
      expect(c.from).toBeLessThanOrEqual(c.to);
      expect(c.from).toBeGreaterThanOrEqual(1950); expect(c.to).toBeLessThanOrEqual(2025);
      if (c.iso !== '*') for (const i of c.iso) expect(i).toMatch(/^[A-Z]{3}$/);
    }
  });
  it('is deterministic per day and changes across days', () => {
    expect(pick('2026-11-21')).toEqual(pick('2026-11-21'));
    expect(pick('2026-11-21').seed).not.toBe(pick('2026-11-22').seed);
  });
  it('never lands on a crisis (year, country) over a whole year of days', () => {
    const years = new Set<number>();
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const p = pick(day);
      expect(p.year).toBeGreaterThanOrEqual(1950); expect(p.year).toBeLessThanOrEqual(2025);
      expect(crisisAt(p.year, p.iso)).toBeUndefined();
      expect(countryFor(p.seed)(p.year)).toBe(p.iso);
      years.add(p.year);
    }
    expect(years.size).toBeGreaterThan(30);
  });
  it('falls back to a year scan when the random tries all hit crises', () => {
    expect(pickDaily('2026-11-21', 1950, 1954, () => 'KOR').year).toBe(1954);
  });
});
