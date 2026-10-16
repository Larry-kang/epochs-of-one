// B1 birth roll: ~26 frames, interval easing from ~40 ms to ~250 ms (≈2.5 s), last frame = drawn country.
export function rollIntervals(n = 26, a = 40, b = 250): number[] {
  return Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * Math.pow(i / (n - 1), 2.2)));
}
/** frame sequence of ISO codes, weighted by share, ending on `final` */
export function rollSequence(weights: { iso: string; share: number }[], final: string, u: () => number, n = 26): string[] {
  const tot = weights.reduce((a, w) => a + w.share, 0);
  const pick = () => { let x = u() * tot; for (const w of weights) { x -= w.share; if (x <= 0) return w.iso; } return weights[weights.length - 1]!.iso; };
  const out: string[] = [];
  for (let i = 0; i < n - 1; i++) { let c = pick(); if (out.length && c === out[out.length - 1] && weights.length > 1) c = pick(); out.push(c); }
  out.push(final);
  return out;
}
