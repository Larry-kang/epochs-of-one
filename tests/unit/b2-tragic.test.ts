import { describe, it, expect } from 'vitest';
import { TRAGIC_EVENTS } from '../../src/ui/logic/play.ts';
import pool from '../../src/content/pool/content.json' with { type: 'json' };

const poolIds = new Set((pool.events as unknown[][]).map((e) => e[0] as string));

describe('b2 tragic set', () => {
  it('covers the new deaths, injuries and disasters', () => {
    for (const id of ['ev_grandparent_dies', 'ev_car_accident', 'ev_earthquake', 'ev_depression']) expect(TRAGIC_EVENTS.has(id)).toBe(true);
  });
  it('every ev_* tragic id exists in the content pool', () => {
    for (const id of TRAGIC_EVENTS) if (id.startsWith('ev_')) expect(poolIds.has(id), id).toBe(true);
  });
  it('does not mark happy events as tragic', () => {
    expect(TRAGIC_EVENTS.has('ev_kid_award')).toBe(false);
    expect(TRAGIC_EVENTS.has('ev_lost_tooth')).toBe(false);
  });
});
