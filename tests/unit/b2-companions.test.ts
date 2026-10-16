// Batch 2 P12: "people born the same second" — deterministic world sample, live status by calendar year.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { sameSecondConfigs, sameSecond, statusAt, SAME_SECOND_N } from '../../src/engine/life/sameSecond.ts';
import type { LifeState } from '../../src/engine/life/state.ts';

const data = loadBundleFromDisk();
const me = newLife(data, { seed: 'same-sec', era: { kind: 'past', year: 1970 }, nowYear: 2026, engineVersion: 't' } as LifeConfig) as LifeState;

describe('B2 same-second companions', () => {
  it('draws the same world sample for the same life, born the same year', () => {
    const a = sameSecondConfigs(me), b = sameSecondConfigs(me);
    expect(a).toEqual(b); expect(a.length).toBe(SAME_SECOND_N);
    for (const c of a) expect(c.era).toEqual({ kind: 'past', year: 1970 });
  });
  it('status follows each peer through time: age, stage, and death', () => {
    const peers = sameSecond(data, me);
    expect(peers.length).toBe(SAME_SECOND_N);
    for (const p of peers) {
      const d = p.death!.age;
      const st0 = statusAt(p, 1970); expect(st0.alive).toBe(true); expect(st0.age).toBe(0); expect(st0.stage).toBe('baby');
      const after = statusAt(p, 1970 + d + 1); expect(after.alive).toBe(false); expect(after.stage).toBe('dead'); expect(after.age).toBe(d);
      if (d > 30) expect(['work', 'school', 'home']).toContain(statusAt(p, 1970 + 30).stage);
    }
  });
});
