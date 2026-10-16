import { describe, it, expect } from 'vitest';
import pool from '../../src/content/pool/history.json';
import table from '../../src/content/i18n/table.json';
const text = Object.fromEntries(Object.entries(table.strings.pool as Record<string, (string | null)[]>).map(([k, v]) => [k, v[0] ?? '']));
import { validatePool, type Pool } from '../../src/engine/content/schema.ts';
describe('C1–C3 content pool scaffold', () => {
  it('validates (unique ids, text present, allowed fact sources, sane windows)', () => {
    expect(validatePool(pool as Pool, text)).toEqual([]);
    expect(validatePool({ events: [{ id: 'x', kind: 'good', window: { ageFrom: 5, ageTo: 1 }, weight: 0, repeatable: false, cooldown: 0, fact: { text: '', source: 'gbd' as 'own' } }], decisions: [], history: [] }, {})).toHaveLength(4);
  });
});
