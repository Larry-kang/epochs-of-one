// Small FNV-1a string hash → [0,1) for deterministic, non-calibrated picks (game content only; never mortality).
export function h01s(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 2 ** 32;
}
