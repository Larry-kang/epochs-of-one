// Batch 2 music (pure part): a soft pentatonic melody over a four-chord loop, generated in code from a seed.
// No audio files are shipped; see licences/ASSETS.md.
/** C major pentatonic pitch classes: C D E G A */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;
/** I – vi – IV – V in C as MIDI triads (low register pad) */
export const CHORDS: number[][] = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
export interface Note { midi: number | null; beats: number; vel: number }
export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
/** tiny deterministic generator (xorshift32) so the melody is reproducible and Math.random-free */
function rng(seed: number) { let x = (seed | 0) || 0x9e3779b9; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1_000_000) / 1_000_000; }; }
export function phrase(seed: number, n: number): Note[] {
  const r = rng(seed); const out: Note[] = []; let step = 2;
  for (let i = 0; i < n; i++) {
    if (r() < 0.22) { out.push({ midi: null, beats: 1, vel: 0 }); continue; }
    step = Math.max(0, Math.min(9, step + Math.round((r() - 0.5) * 3)));
    const pc = PENTATONIC[step % 5]!, oct = step < 5 ? 72 : 84;
    out.push({ midi: oct + pc, beats: r() < 0.3 ? 2 : 1, vel: 0.08 + r() * 0.12 });
  }
  return out;
}
