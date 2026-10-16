// batch 3 #2: death-page epilogue derived from the finished life (pure, deterministic, game-design content —
// never touches the engine or mortality): who saw you off, hobbies, countries visited, memorable moments.
import type { LifeState } from '../../engine/life/state.ts';

import { h01s } from '../../engine/rng/hash01.ts';
/** deterministic [0,1) hash (re-exported for the UI) */
export const h01 = h01s;

export type Rel = 'spouse' | 'child' | 'sibling' | 'mother' | 'father' | 'friends';
export interface Mourner { rel: Rel; name: string; n?: number }
/** people around at the end: spouse, children, siblings, parents (if alive and plausibly so), plus a count of friends */
export function seeOff(s: LifeState): Mourner[] {
  const y = s.born.year + s.age; const f = s.family;
  const out: Mourner[] = [];
  if (f.spouse && y - f.spouse.born < 100) out.push({ rel: 'spouse', name: f.spouse.name });
  for (const c of f.children) if (c.born <= y) out.push({ rel: 'child', name: c.name });
  for (const b of f.siblings) if (b.born <= y && y - b.born < 92) out.push({ rel: 'sibling', name: b.name });
  if (f.parentsAlive) for (const [rel, p] of [['mother', f.mother], ['father', f.father]] as const) if (y - p.born < 100) out.push({ rel, name: p.name });
  const friends = Math.round((s.stats.social / 100) * 12 * (s.age < 18 ? 0.6 : 1));
  if (friends > 0) out.push({ rel: 'friends', name: '', n: friends });
  return out;
}

const HOBBY_OF: Record<string, string> = {
  musicLessons: 'music', instrument: 'music', concert: 'music', artClass: 'art', camera: 'photo', sportsClub: 'sport', gym: 'sport', bike: 'cycling', ebike: 'cycling',
  collection: 'collecting', pet: 'pets', console: 'games', library: 'reading', onlineCourse: 'learning', languageCourse: 'languages', parkWalk: 'walking',
  tripAbroad: 'travel', tripHome: 'travel', cruise: 'travel', dining: 'food', ev_dance_square: 'dance', ev_yearbook: 'reading',
};
const FOCUS_HOBBY: Record<string, string> = { hobby: 'crafts', play: 'games', health: 'sport', sport: 'sport', learn: 'learning', mind: 'reading', faith: 'volunteering', volunteer: 'volunteering', friends: 'friends', balance: 'walking' };
/** up to 3 hobbies, scored from purchases, yearly focus and events; falls back to the strongest stat */
export function hobbies(s: LifeState): string[] {
  const score = new Map<string, number>();
  const add = (k: string | undefined, w: number) => { if (k) score.set(k, (score.get(k) ?? 0) + w); };
  for (const a of s.actions) { if (a.t === 'buy') add(HOBBY_OF[a.id], 2); if (a.t === 'focus') { if (a.id) add(FOCUS_HOBBY[a.id], 3); for (const [k, v] of Object.entries(a.w ?? {})) if (v > 0) add(FOCUS_HOBBY[k], 3 * v); } }
  for (const e of s.events) add(HOBBY_OF[e.id], 1);
  const top = [...score].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k);
  if (top.length) return top;
  const st = s.stats; const best = (Object.keys(st) as (keyof typeof st)[]).sort((a, b) => st[b] - st[a])[0];
  return [{ smart: 'reading', health: 'walking', social: 'friends', happy: 'music' }[best as 'smart'] ?? 'walking'];
}

/** countries lived in, then trip destinations (one per abroad trip / work trip), picked deterministically from `pool` */
export function visited(s: LifeState, pool: readonly string[]): { lived: string[]; trips: string[] } {
  const lived = [...new Set([s.born.iso, ...s.years.map((y) => (y as { iso?: string }).iso ?? s.cur), s.cur])];
  const cand = pool.filter((c) => !lived.includes(c));
  const ages = [...s.actions.flatMap((a) => (a.t === 'buy' && (a.id === 'tripAbroad' || a.id === 'cruise') ? [a.age] : [])), ...s.events.filter((e) => e.id === 'ev_work_trip').map((e) => e.age)];
  const trips: string[] = [];
  for (const age of ages.sort((a, b) => a - b)) {
    if (!cand.length) break;
    const c = cand[Math.floor(h01(`${s.seed}:trip:${age}`) * cand.length)]!;
    if (!trips.includes(c)) trips.push(c);
  }
  return { lived, trips };
}

/** memorable moments: starred log lines first, then the big milestones, oldest first, at most `max` */
export function memorable(s: LifeState, starred: ReadonlySet<string>, big: ReadonlySet<string>, max = 8): { age: number; id: string; vars?: Record<string, unknown>; starred: boolean }[] {
  const out = s.events.filter((e) => starred.has(`${e.age}:${e.id}`)).map((e) => ({ ...e, starred: true }));
  for (const e of s.events) if (big.has(e.id) && !out.some((o) => o.age === e.age && o.id === e.id)) out.push({ ...e, starred: false });
  return out.slice(0, max).sort((a, b) => a.age - b.age) as { age: number; id: string; vars?: Record<string, unknown>; starred: boolean }[];
}
