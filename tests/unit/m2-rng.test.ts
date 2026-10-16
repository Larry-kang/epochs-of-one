import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sha256Hex } from '../../src/engine/rng/sha256.ts';
import { Xoshiro128 } from '../../src/engine/rng/xoshiro128.ts';
import { stream, rngFromString } from '../../src/engine/rng/streams.ts';

describe('M2: RNG', () => {
  it('SHA-256 known vectors (FIPS 180-4)', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('xoshiro128** first outputs from state (1,2,3,4) match the reference recurrence', () => {
    const x = new Xoshiro128(1, 2, 3, 4);
    expect(x.nextU32()).toBe(11520); // rotl(2*5,7)*9
    expect(x.nextU32()).toBe(0);
    expect(x.nextU32()).toBe(5927040);
    expect(x.nextU32()).toBe(70819200);
  });
  it('streams are deterministic and domain-separated', () => {
    const a = stream('s', 'year', 30), b = stream('s', 'year', 30), c = stream('s', 'year', 31), d = stream('s', 'birth');
    const va = [a.next(), a.next()], vb = [b.next(), b.next()];
    expect(va).toEqual(vb);
    expect(c.next()).not.toBe(va[0]);
    expect(d.next()).not.toBe(va[0]);
  });
  it('property: next() ∈ [0,1), int(n) ∈ [0,n)', () => {
    fc.assert(fc.property(fc.string(), fc.integer({ min: 1, max: 1000 }), (k, n) => {
      const r = rngFromString(k);
      for (let i = 0; i < 20; i++) {
        const u = r.next(); if (!(u >= 0 && u < 1)) return false;
        const j = r.int(n); if (!(j >= 0 && j < n && Number.isInteger(j))) return false;
      }
      return true;
    }), { numRuns: 2000 });
  });
  it('uniformity sanity: mean ≈ 0.5 over 1e5 draws', () => {
    const r = rngFromString('u'); let s = 0; for (let i = 0; i < 1e5; i++) s += r.next();
    expect(Math.abs(s / 1e5 - 0.5)).toBeLessThan(0.005);
  });
});
