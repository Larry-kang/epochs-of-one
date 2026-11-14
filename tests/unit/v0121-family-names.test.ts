// v0.12.1 family names: spouse sex must mirror the protagonist's (opposite pool unless sx === 'same'),
// and children must never be given the protagonist's own given name.
import { describe, it, expect } from 'vitest';
import { applyChoice, type ChoiceDraft } from '../../src/engine/life/choices.ts';
import { stream } from '../../src/engine/rng/streams.ts';
import { makeName } from '../../src/engine/content/names.ts';
import type { Career, Family, Stats } from '../../src/engine/life/state.ts';

const REGION = 'west' as const;
const AGE = 25;

const stats = (): Stats => ({ health: 80, happy: 60, smart: 60, social: 60 });
const career = (): Career => ({ plan: 'none', studyUntil: 15, entry: 6, track: 'private', mult: 1, city: false, lastWage: 0, promotions: 0 });
const family = (): Family => ({
  mother: { name: '母', born: 1970 }, father: { name: '父', born: 1968 },
  siblings: [], children: [], parentsAlive: true, region: REGION,
});
const draft = (seed: string, over: Partial<ChoiceDraft> = {}): ChoiceDraft => ({
  career: career(), family: family(), stats: stats(), cash: 0, calYear: 2000, age: AGE, meanDisp: 20000, oop: 1, seed, ...over,
});

describe('v0121 family names', () => {
  it('marry: female protagonist → spouse name sex mirrors hers (opposite = M, same = F), stream unchanged', () => {
    for (let i = 0; i < 200; i++) {
      const seed = 'v0121-m' + i;
      const d = draft(seed, { sex: 'F' });
      applyChoice(d, 'marry', 'marry');
      const r = stream(seed, 'family', 'spouse', AGE);
      const sx = r.next() < 0.97 ? 'other' : 'same';
      const expected = makeName(REGION, sx === 'other' ? 'M' : 'F', r.next(), r.next()).full;
      expect(d.family.spouse?.name).toBe(expected);
    }
  });

  it('marry: male protagonist (and absent sex) keeps legacy behaviour (opposite = F, same = M)', () => {
    for (const sex of ['M', undefined] as const) {
      for (let i = 0; i < 100; i++) {
        const seed = 'v0121-mL' + i;
        const d = draft(seed, sex ? { sex } : {});
        applyChoice(d, 'marry', 'marry');
        const r = stream(seed, 'family', 'spouse', AGE);
        const sx = r.next() < 0.97 ? 'other' : 'same';
        const expected = makeName(REGION, sx === 'other' ? 'F' : 'M', r.next(), r.next()).full;
        expect(d.family.spouse?.name).toBe(expected);
      }
    }
  });

  it('child: no child ever receives the protagonist\'s given name (self set)', () => {
    const self = '艾瑪'; // a name in the west F pool, so F children could otherwise collide with it
    for (let i = 0; i < 200; i++) {
      const seed = 'v0121-c' + i;
      const d = draft(seed, { self });
      applyChoice(d, 'child', 'have');
      expect(d.family.children).toHaveLength(1);
      expect(d.family.children[0]!.name).not.toBe(self);
      expect(d.family.childCoolUntil).toBe(AGE + 2);
    }
  });

  it('child: without self the same seeds can collide (the guard is what prevents it)', () => {
    const self = '艾瑪';
    let collisions = 0;
    for (let i = 0; i < 200; i++) {
      const d = draft('v0121-c' + i);
      applyChoice(d, 'child', 'have');
      if (d.family.children[0]!.name === self) collisions++;
    }
    expect(collisions).toBeGreaterThan(0);
  });
});
