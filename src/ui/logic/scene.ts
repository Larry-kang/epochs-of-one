// batch 3 #3: scene banner — a small generated SVG strip for the current era and place (own procedural art, no assets).
// Era sets the palette and what is on the street; place sets skyline vs fields; time of life sets the time of day.
import { h01 } from './epilogue.ts';

export type Era = 'postwar' | 'boom' | 'late20' | 'digital' | 'now' | 'future';
export const eraOf = (y: number): Era => (y < 1960 ? 'postwar' : y < 1980 ? 'boom' : y < 2000 ? 'late20' : y < 2015 ? 'digital' : y <= 2030 ? 'now' : 'future');
const SKY: Record<Era, [string, string]> = {
  postwar: ['#C9B99A', '#EDE3CC'], boom: ['#E7B46A', '#F6E2B8'], late20: ['#7FA7C9', '#DCE8F0'],
  digital: ['#5E8FC0', '#CFE0EE'], now: ['#4F7FB5', '#E6EEF5'], future: ['#3B4D7A', '#B9C7E6'],
};
export type Phase = 'dawn' | 'day' | 'dusk' | 'night';
export const phaseOf = (age: number): Phase => (age < 18 ? 'dawn' : age < 50 ? 'day' : age < 75 ? 'dusk' : 'night');
export interface SceneSpec { era: Era; phase: Phase; urban: boolean; sky: [string, string]; buildings: { x: number; w: number; h: number; lit: boolean }[]; props: string[] }

export function sceneSpec(year: number, age: number, urban: boolean, seed: string): SceneSpec {
  const era = eraOf(year), phase = phaseOf(age);
  let sky = SKY[era];
  if (phase === 'dusk') sky = ['#B9605A', '#F2C38F'];
  if (phase === 'night') sky = ['#1C2238', '#3C4466'];
  const n = urban ? (era === 'postwar' ? 12 : era === 'boom' ? 18 : 24) : 6;
  const maxH = urban ? (era === 'postwar' ? 24 : era === 'boom' ? 34 : era === 'future' ? 54 : 46) : 12;
  const buildings = Array.from({ length: n }, (_, i) => {
    const r = h01(`${seed}:b:${i}:${era}`);
    return { x: Math.round((i / n) * 720 + r * 8), w: Math.round(16 + r * 14), h: Math.round(8 + r * maxH), lit: phase === 'night' || phase === 'dusk' ? r > 0.3 : false };
  });
  const props = [
    ...(urban ? [] : ['field']),
    ...(era === 'postwar' ? ['bicycle'] : era === 'boom' ? ['bus', 'bicycle'] : era === 'late20' ? ['car', 'scooter'] : era === 'digital' ? ['car', 'tower'] : era === 'now' ? ['tower', 'solar'] : ['tower', 'solar', 'drone']),
    phase === 'night' ? 'moon' : 'sun',
  ];
  return { era, phase, urban, sky, buildings, props };
}

export function sceneSvg(sp: SceneSpec, label: string): string {
  const W = 720, H = 64, G = 46;
  const sun = sp.props.includes('moon')
    ? `<circle cx="600" cy="16" r="7" fill="#ECE7DC"/><circle cx="603" cy="14" r="6" fill="${sp.sky[0]}"/>`
    : `<circle cx="${sp.phase === 'dawn' ? 120 : sp.phase === 'dusk' ? 600 : 360}" cy="${sp.phase === 'day' ? 14 : 34}" r="8" fill="#F6D27A" opacity=".9"/>`;
  const bld = sp.buildings.map((b) => `<rect x="${b.x}" y="${G - b.h}" width="${b.w}" height="${b.h}" fill="${sp.phase === 'night' ? '#11141F' : '#3A4252'}" opacity="${sp.urban ? 0.85 : 0.6}"/>${b.lit ? `<rect x="${b.x + 4}" y="${G - b.h + 4}" width="3" height="3" fill="#F2C94C"/>` : ''}`).join('');
  const prop = (p: string) => ({
    field: `<rect x="0" y="${G}" width="${W}" height="${H - G}" fill="#7C9A5A"/>`,
    bicycle: `<g transform="translate(40 ${G - 6})" stroke="#2A2F3A" fill="none"><circle cx="0" cy="3" r="3"/><circle cx="10" cy="3" r="3"/><path d="M0 3 L5 -2 L10 3"/></g>`,
    bus: `<rect x="90" y="${G - 9}" width="26" height="9" rx="2" fill="#C2671D"/>`,
    car: `<rect x="120" y="${G - 6}" width="16" height="6" rx="2" fill="#8E3B5A"/>`,
    scooter: `<rect x="70" y="${G - 5}" width="9" height="4" rx="2" fill="#2F5D8A"/>`,
    tower: `<path d="M330 ${G} L334 ${G - 34} L338 ${G}" stroke="#2A2F3A" fill="none"/>`,
    solar: `<rect x="250" y="${G - 4}" width="14" height="4" fill="#2F5D8A"/>`,
    drone: `<rect x="210" y="12" width="8" height="2" fill="#2A2F3A"/>`,
  } as Record<string, string>)[p] ?? '';
  return `<svg class="scene-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sp.sky[0]}"/><stop offset="1" stop-color="${sp.sky[1]}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>${sun}${bld}<rect x="0" y="${G}" width="${W}" height="${H - G}" fill="${sp.urban ? '#5A5F6B' : '#8DA86A'}"/>${sp.props.map(prop).join('')}</svg>`;
}
