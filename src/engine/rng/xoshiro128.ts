// xoshiro128** 1.1 (Blackman & Vigna, public-domain reference algorithm), 32-bit state words.
export class Xoshiro128 {
  private s0: number; private s1: number; private s2: number; private s3: number;
  constructor(s0: number, s1: number, s2: number, s3: number) {
    if ((s0 | s1 | s2 | s3) === 0) s3 = 1; // all-zero state is invalid
    this.s0 = s0 >>> 0; this.s1 = s1 >>> 0; this.s2 = s2 >>> 0; this.s3 = s3 >>> 0;
  }
  /** next uint32 */
  nextU32(): number {
    const r = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0; this.s3 ^= this.s1; this.s1 ^= this.s2; this.s0 ^= this.s3;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    this.s0 >>>= 0; this.s1 >>>= 0; this.s2 >>>= 0;
    return r;
  }
  /** uniform double in [0,1) with 53 random bits */
  next(): number {
    const a = this.nextU32() >>> 5, b = this.nextU32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
}
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
