// Item 5 P1 / v0.21.0 (B2): client-side QR for the share card. uqr (MIT, unjs, no dependencies) — see NOTICE.md.
import { encode } from 'uqr';

export function qrModules(text: string): { size: number; on: (x: number, y: number) => boolean } {
  const q = encode(text, { ecc: 'L', border: 0 });
  return { size: q.size, on: (x, y) => !!q.data[y]?.[x] };
}
