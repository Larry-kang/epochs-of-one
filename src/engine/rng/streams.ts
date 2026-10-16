// Seeded RNG with domain sub-streams: sub-seed = SHA-256(seed ‖ ":" ‖ domain ‖ ":" ‖ keys…) → xoshiro128**.
import { sha256, utf8 } from './sha256.ts';
import { Xoshiro128 } from './xoshiro128.ts';

export type Domain = 'birth' | 'year' | 'market' | 'companions' | 'decision' | 'events';

export interface Rng {
  /** uniform [0,1) */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
  /** pick index by non-negative weights; returns -1 if all weights are 0 */
  weighted(w: ArrayLike<number>): number;
}

export function rngFromString(key: string): Rng {
  const h = sha256(utf8(key));
  const x = new Xoshiro128(h[0]!, h[1]!, h[2]!, h[3]!);
  return {
    next: () => x.next(),
    int: (n) => Math.floor(x.next() * n),
    weighted(w) {
      let tot = 0;
      for (let i = 0; i < w.length; i++) tot += w[i]!;
      if (!(tot > 0)) return -1;
      let r = x.next() * tot;
      for (let i = 0; i < w.length; i++) { r -= w[i]!; if (r < 0 && w[i]! > 0) return i; }
      for (let i = w.length - 1; i >= 0; i--) if (w[i]! > 0) return i;
      return -1;
    },
  };
}

export function stream(seed: string, domain: Domain, ...keys: (string | number)[]): Rng {
  return rngFromString([seed, domain, ...keys].join(':'));
}

export const SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Derive a fresh seed from an entropy source (UI passes crypto.getRandomValues output). */
export function seedFromBytes(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += abc[bytes[i % bytes.length]! % abc.length];
  return s;
}
