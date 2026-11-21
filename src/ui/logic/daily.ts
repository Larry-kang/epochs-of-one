// Item 5 P1 / v0.20.0: daily theme. One fixed seed per UTC day; the birth year is picked deterministically and skips
// (year, birth country) pairs on the self-compiled crisis list src/content/daily-crises.json (facts only: years + countries,
// each checked against its English Wikipedia article on 2026-11-21). First draft: OpenCode deepseek-v4.1-flash-free.
import crises from '../../content/daily-crises.json' with { type: 'json' };
import { h01s } from '../../engine/rng/hash01.ts';

export interface Crisis {
  id: string;
  kind: 'war' | 'famine' | 'disaster' | 'pandemic' | 'genocide';
  from: number;
  to: number;
  iso: string[] | '*';
  src: string;
  checked: string;
}

export const CRISES: Crisis[] = crises.items as Crisis[];

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(day: string): string {
  return `daily-${day.replace(/-/g, '')}`;
}

export function crisisAt(year: number, iso: string): Crisis | undefined {
  return CRISES.find(
    (c) => year >= c.from && year <= c.to && (c.iso === '*' || c.iso.includes(iso)),
  );
}

export function pickDaily(
  day: string,
  y0: number,
  y1: number,
  countryFor: (year: number) => string | null | undefined,
): { day: string; seed: string; year: number; iso: string } {
  const seed = dailySeed(day);
  const span = y1 - y0 + 1;

  for (let k = 0; k < 200; k++) {
    const year = y0 + Math.floor(h01s(`${day}#${k}`) * span);
    const iso = countryFor(year);
    if (iso && !crisisAt(year, iso)) return { day, seed, year, iso };
  }

  for (let year = y0; year <= y1; year++) {
    const iso = countryFor(year);
    if (iso && !crisisAt(year, iso)) return { day, seed, year, iso };
  }

  return { day, seed, year: y1, iso: countryFor(y1) ?? '' };
}
