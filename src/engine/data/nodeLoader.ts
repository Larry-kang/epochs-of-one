// Node-only data loader (CLI/tests). The browser uses src/ui/data.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CountryIndex, Demography } from './types.ts';
import { makeBundle, type DataBundle } from '../life/sim.ts';
import type { HousingPension, MarketsData } from '../finance/marketData.ts';
import { existsSync } from 'node:fs';

export function loadBundleFromDisk(root = process.cwd()): DataBundle {
  const dir = join(root, 'public/data');
  const index = JSON.parse(readFileSync(join(dir, 'countries.json'), 'utf8')) as CountryIndex;
  const opt = <T>(p: string): T | undefined => (existsSync(join(dir, p)) ? (JSON.parse(readFileSync(join(dir, p), 'utf8')) as T) : undefined);
  return makeBundle(index, (iso) => JSON.parse(readFileSync(join(dir, 'demography', `${iso}.json`), 'utf8')) as Demography,
    { markets: opt<MarketsData>('markets/markets.json'), hp: opt<HousingPension>('markets/housing-pension.json') });
}
