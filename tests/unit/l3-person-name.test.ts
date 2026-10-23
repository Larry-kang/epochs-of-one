import { describe, it, expect } from 'vitest';
import { POOLS, makeName, type NameRegion } from '../../src/engine/content/names.ts';
import tab from '../../src/content/l3-person-names.json';
import { personName } from '../../src/ui/logic/person-name.ts';

const T = tab as Record<string, Record<string, string[]>>;
const HAN = /[\u4e00-\u9fff]/;

describe('v0.11.1 person names (display only)', () => {
  it('every pool token has en/ja/ko renderings', () => {
    for (const r of Object.keys(POOLS) as NameRegion[]) for (const x of [...POOLS[r].family, ...POOLS[r].M, ...POOLS[r].F]) expect(T[r]?.[x]?.length, `${r} ${x}`).toBe(3);
  });
  it('drawn names map to local scripts; en has no Han, ko is hangul', () => {
    for (const r of Object.keys(POOLS) as NameRegion[]) for (let i = 0; i < 40; i++) {
      const n = makeName(r, i % 2 ? 'M' : 'F', (i * 0.137) % 1, (i * 0.618) % 1);
      const en = personName(n.full, r, 'en'), ko = personName(n.full, r, 'ko'), ja = personName(n.full, r, 'ja');
      expect(HAN.test(en), `${r} ${n.full} -> ${en}`).toBe(false);
      expect(HAN.test(ko), `${r} ${n.full} -> ${ko}`).toBe(false);
      if (r !== 'zh' && r !== 'ja') expect(HAN.test(ja), `${r} ${n.full} -> ${ja}`).toBe(false);
      expect(HAN.test(personName(n.given, r, 'en'))).toBe(false);
      expect(personName(n.full, r, 'zh-TW')).toBe(n.full);
    }
  });
  it('conventions', () => {
    expect(personName(makeName('west', 'M', 0, 0).full, 'west', 'en')).toMatch(/^[A-Z]\S+ [A-Z]/);
    expect(personName('不在池裡', 'zh', 'en')).toBe('不在池裡');
  });
});
describe('v0.11.1 name order', () => {
  it('zh en given-first, ko hangul joined', () => {
    const n = makeName('zh', 'M', 0, 0), k = makeName('ko', 'M', 0, 0);
    expect(personName(n.full, 'zh', 'en').split(' ')[1]).toBe(personName(n.family, 'zh', 'en') === n.family ? T.zh![n.family]![0] : T.zh![n.family]![0]);
    expect(personName(k.full, 'ko', 'ko')).toBe(T.ko![k.family]![2]! + T.ko![k.given]![2]!);
  });
});
