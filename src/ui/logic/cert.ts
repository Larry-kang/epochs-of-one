// Birth/death record identifiers and the ID card's ledger code lines (our own format, not a passport MRZ).
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
export const registryNo = (iso: string, year: number, seed: string, kind: 'B' | 'D' = 'B') =>
  `${kind}-${iso}-${year}-${String(hash(seed + kind) % 1_000_000).padStart(6, '0')}`;

/** two monospace "ledger folio" lines: LEDGER/ISO/YEAR/SEX + romanised name hash, padded to 30 chars with '·' */
export function folioLines(nameLatin: string, iso: string, year: number, sex: 'M' | 'F', seed: string): [string, string] {
  const pad = (s: string) => (s + '·'.repeat(30)).slice(0, 30);
  const nm = nameLatin.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 14) || 'X';
  const chk = String(hash(seed) % 97).padStart(2, '0');
  return [pad(`EO·${iso}·${nm}`), pad(`${year}${sex}·${String(hash(seed + iso) % 1e8).padStart(8, '0')}·${chk}`)];
}
