// P6 pixel portrait: an original 16×16 sprite drawn from code (age band, sex, skin tone, outfit). No external art.
export interface PortraitIn { age: number; sex: 'M' | 'F'; skin: number; outfit: number }
const SKIN = ['#F3D3B5', '#E0B48C', '#C68E62', '#9A6440', '#6B4228'];
const OUTFIT = ['#2F5D8A', '#4E7D4A', '#8E3B5A', '#B8902E', '#4A5063'];
const HAIR = (age: number) => (age >= 65 ? '#D9D4CB' : age >= 50 ? '#8A8F9C' : '#2A2320');
export const ageBand = (age: number) => (age < 3 ? 0 : age < 13 ? 1 : age < 20 ? 2 : age < 50 ? 3 : age < 65 ? 4 : 5);
/** returns 16 rows × 16 cells of colour strings ('' = transparent) */
export function portraitGrid(p: PortraitIn): string[][] {
  const g: string[][] = Array.from({ length: 16 }, () => Array<string>(16).fill(''));
  const band = ageBand(p.age), sk = SKIN[p.skin % SKIN.length]!, of = OUTFIT[p.outfit % OUTFIT.length]!, hr = HAIR(p.age);
  const small = band <= 1;
  const top = small ? 4 : 2, w = small ? 6 : 8, left = 8 - w / 2;
  const fill = (x0: number, y0: number, x1: number, y1: number, c: string) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && y < 16 && x >= 0 && x < 16) g[y]![x] = c; };
  // head
  fill(left, top, left + w - 1, top + w - 1, sk);
  // hair: cap + sides (longer for F)
  if (band > 0) { fill(left, top, left + w - 1, top + 1, hr); fill(left, top + 2, left, top + (p.sex === 'F' ? w : 3), hr); fill(left + w - 1, top + 2, left + w - 1, top + (p.sex === 'F' ? w : 3), hr); }
  // eyes + mouth
  const ey = top + Math.floor(w / 2);
  g[ey]![left + 2] = '#1F2433'; g[ey]![left + w - 3] = '#1F2433';
  fill(left + Math.floor(w / 2) - 1, ey + 2, left + Math.floor(w / 2), ey + 2, band >= 5 ? '#8A6A5A' : '#B5524A');
  if (band >= 4) { g[ey + 1]![left + 1] = '#C9A98F'; g[ey + 1]![left + w - 2] = '#C9A98F'; } // wrinkles
  // body / outfit
  const by = top + w;
  fill(left - 1, by, left + w, 15, of);
  if (band === 0) fill(left, by, left + w - 1, 15, '#FFFDF8'); // swaddle
  return g;
}
export function portraitSvg(p: PortraitIn, px = 64): string {
  const g = portraitGrid(p); const c = px / 16; let r = '';
  g.forEach((row, y) => row.forEach((col, x) => { if (col) r += `<rect x="${x * c}" y="${y * c}" width="${c}" height="${c}" fill="${col}"/>`; }));
  return `<svg class="portrait" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" shape-rendering="crispEdges" role="img" aria-hidden="true">${r}</svg>`;
}
