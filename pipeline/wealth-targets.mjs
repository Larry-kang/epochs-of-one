// Wealth calibration targets (P0-1): OECD Wealth Distribution Database (WDD) median household net wealth,
// expressed per adult and relative to GDP per capita in current national currency (WDI NY.GDP.PCAP.CN), so the
// ratio is currency- and price-level free and can be compared with the engine's real PPP values.
// Sources: OECD Data Explorer DSD_WEALTH@DF_WEALTH (OECD terms, attribution); World Bank WDI (CC BY 4.0).
// Output: pipeline/calibration/wealth-targets.json (committed). Raw downloads go to data-raw/ext (gitignored).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'data-raw/ext');
const URL_WDD = 'https://sdmx.oecd.org/public/rest/data/OECD.WISE.INE,DSD_WEALTH@DF_WEALTH,1.0/all?format=csvfilewithlabels';
const URL_GDP = 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CN?format=json&per_page=20000&date=2009:2023';
const COUNTRIES = ['USA', 'JPN', 'KOR', 'DEU', 'ITA', 'GBR', 'FRA', 'CAN'];
/** adults per household used to turn household wealth into per-adult wealth (design approximation; OECD average
 *  household size ≈ 2.4 persons of whom ≈ 1.9 adults) — docs/calibration-wealth.md */
const ADULTS_PER_HH = 1.9;

async function dl(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const h = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [h[i], v])));
}
await dl(URL_WDD, join(EXT, 'oecd_wealth.csv'));
await dl(URL_GDP, join(EXT, 'gdppc_lcu.json'));
const rows = parseCsv(readFileSync(join(EXT, 'oecd_wealth.csv'), 'utf8')).filter((r) => r.MEASURE === 'NW' && r.STATISTICAL_OPERATION === 'MEDIAN' && r.UNIT_MEASURE === 'XDC_HH');
const gdp = new Map();
for (const r of JSON.parse(readFileSync(join(EXT, 'gdppc_lcu.json'), 'utf8'))[1]) if (r.value != null) gdp.set(`${r.countryiso3code}|${r.date}`, r.value);
const targets = [];
for (const iso of COUNTRIES) {
  const obs = rows.filter((r) => r.REF_AREA === iso && gdp.has(`${iso}|${r.TIME_PERIOD}`)).sort((a, b) => Number(b.TIME_PERIOD) - Number(a.TIME_PERIOD));
  if (!obs.length) continue;
  const o = obs[0], y = Number(o.TIME_PERIOD), nw = Number(o.OBS_VALUE), g = gdp.get(`${iso}|${y}`);
  targets.push({ iso, year: y, medianHhNetWealthLcu: nw, gdpPcLcu: g, ratioPerAdult: Number((nw / ADULTS_PER_HH / g).toFixed(3)), status: o.OBS_STATUS });
}
mkdirSync(join(ROOT, 'pipeline/calibration'), { recursive: true });
writeFileSync(join(ROOT, 'pipeline/calibration/wealth-targets.json'), JSON.stringify({
  note: 'Median household net wealth (OECD WDD) ÷ adults per household ÷ GDP per capita (current LCU, WDI). Used only for engine calibration/tests; not shipped to the app.',
  sources: [{ id: 'oecd', dataset: 'DSD_WEALTH@DF_WEALTH', url: URL_WDD, license: 'OECD terms (attribution)' }, { id: 'wdi', indicator: 'NY.GDP.PCAP.CN', url: URL_GDP, license: 'CC-BY-4.0' }],
  retrieved: '2026-10-16', adultsPerHousehold: ADULTS_PER_HH, targets,
}, null, 1));
console.table(targets);
