// Browser data loader: same-origin static JSON only (precached by sw.js → works offline).
import type { CountryIndex, Demography, Iso3 } from '../engine/data/types.ts';
import { makeBundle, type DataBundle } from '../engine/life/sim.ts';
import type { HousingPension, MarketsData } from '../engine/finance/marketData.ts';

let index: CountryIndex | null = null;
const demo = new Map<Iso3, Demography>();
let markets: MarketsData | undefined;
let hp: HousingPension | undefined;

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return (await r.json()) as T;
}
export async function loadIndex(): Promise<CountryIndex> {
  index ??= await getJson<CountryIndex>('./data/countries.json');
  return index;
}
export async function preloadDemography(iso: Iso3): Promise<void> {
  if (!demo.has(iso)) demo.set(iso, await getJson<Demography>(`./data/demography/${iso}.json`));
}
/** M4/M5 layers: small static files, loaded once (precached → offline). */
export async function loadFinance(): Promise<void> {
  markets ??= await getJson<MarketsData>('./data/markets/markets.json');
  hp ??= await getJson<HousingPension>('./data/markets/housing-pension.json');
}
export function bundle(): DataBundle {
  if (!index) throw new Error('index not loaded');
  return makeBundle(index, (iso) => {
    const d = demo.get(iso);
    if (!d) throw new Error('demography not preloaded: ' + iso);
    return d;
  }, { markets, hp });
}
