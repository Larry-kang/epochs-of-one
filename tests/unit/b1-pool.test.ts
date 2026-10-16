import { describe, it, expect } from 'vitest';
import pool from '../../src/content/pool/history.json';
import text from '../../src/content/zh-TW/pool.json';
import { validatePool, type Pool } from '../../src/engine/content/schema.ts';
describe('C1–C3 content pool scaffold', () => {
  it('validates (unique ids, text present, allowed fact sources, sane windows)', () => {
    expect(validatePool(pool as Pool, text)).toEqual([]);
    expect(validatePool({ events: [{ id: 'x', kind: 'good', window: { ageFrom: 5, ageTo: 1 }, weight: 0, repeatable: false, cooldown: 0, fact: { text: '', source: 'gbd' as 'own' } }], decisions: [], history: [] }, {})).toHaveLength(4);
  });
});
