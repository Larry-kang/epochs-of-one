import { describe, it, expect } from 'vitest';
import { seeOff, hobbies, visited, memorable, h01 } from '../../src/ui/logic/epilogue.ts';
import type { LifeState } from '../../src/engine/life/state.ts';

const base = (o: Partial<LifeState> = {}): LifeState => ({
  seed: 'x', born: { iso: 'TWN', year: 1950 }, cur: 'TWN', age: 70, stats: { health: 50, happy: 50, smart: 60, social: 50 },
  family: { mother: { name: 'M', born: 1925 }, father: { name: 'F', born: 1922 }, siblings: [{ name: 'S1', born: 1948 }, { name: 'S2', born: 2030 }], spouse: { name: 'P', born: 1951 }, children: [{ name: 'C', born: 1980 }], parentsAlive: true, region: 'east' },
  actions: [], events: [], years: [], ...o } as unknown as LifeState);

describe('b3 epilogue', () => {
  it('see-off: spouse, born children and siblings, no parents over 100, friends count', () => {
    const m = seeOff(base());
    expect(m.map((x) => x.rel)).toEqual(['spouse', 'child', 'sibling', 'mother', 'father', 'friends']);
    expect(seeOff(base({ age: 76 } as Partial<LifeState>)).map((x) => x.rel)).toEqual(['spouse', 'child', 'sibling', 'friends']);
    expect(m.find((x) => x.rel === 'friends')!.n).toBe(6);
  });
  it('hobbies come from purchases and focus, else the strongest stat', () => {
    expect(hobbies(base())).toEqual(['reading']);
    expect(hobbies(base({ actions: [{ t: 'buy', age: 20, id: 'instrument' }, { t: 'focus', age: 30, id: 'health' }] } as Partial<LifeState>))).toEqual(['sport', 'music']);
  });
  it('trips are deterministic and exclude lived countries', () => {
    const s = base({ actions: [{ t: 'buy', age: 30, id: 'tripAbroad' }, { t: 'buy', age: 40, id: 'tripAbroad' }] } as Partial<LifeState>);
    const a = visited(s, ['TWN', 'JPN', 'USA', 'FRA']); const b = visited(s, ['TWN', 'JPN', 'USA', 'FRA']);
    expect(a).toEqual(b); expect(a.lived).toEqual(['TWN']); expect(a.trips.length).toBeGreaterThan(0); expect(a.trips).not.toContain('TWN');
  });
  it('memorable: starred first, then milestones, capped', () => {
    const s = base({ events: [{ age: 22, id: 'graduated' }, { age: 5, id: 'ev_x' }, { age: 30, id: 'promotion' }] } as Partial<LifeState>);
    expect(memorable(s, new Set(['5:ev_x']), new Set(['graduated', 'promotion'])).map((e) => e.id)).toEqual(['ev_x', 'graduated', 'promotion']);
  });
  it('h01 in [0,1)', () => { for (const k of ['a', 'b', 'zz']) { const v = h01(k); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
});
