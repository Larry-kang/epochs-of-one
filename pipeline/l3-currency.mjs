// v0.11.1: display currency per country. The engine keeps every amount in 2021 PPP international dollars
// (WDI NY.GDP.PCAP.PP.KD base); the UI converts for display only with WDI PA.NUS.PPP for 2021 (local currency units
// per international $, CC BY 4.0, already ingested into public/data/markets/markets.json by pipeline/markets-ext.mjs).
// Countries without a clean 2021 factor (Taiwan is not in WDI; excluded list below) are shown as labelled US$.
import { readFileSync, writeFileSync } from 'node:fs';
const m = JSON.parse(readFileSync('public/data/markets/markets.json', 'utf8'));
const cc = JSON.parse(readFileSync('pipeline/l3/currency-codes.json', 'utf8'));
const BASE = 2021, rates = {};
for (const [iso, code] of Object.entries(cc.codes)) {
  if (cc.exclude[iso]) continue;
  const s = m.ppp[iso]; const v = s ? s.v[BASE - s.from] : null;
  if (typeof v === 'number' && v > 0) rates[iso] = { c: code, r: +v.toPrecision(6) };
}
const out = { note: 'Display-only currency conversion: amount_local = amount_int$ x r (WDI PA.NUS.PPP, ' + BASE + '). Model amounts are 2021 PPP international $; missing countries show US$.',
  source: 'wdi', indicator: 'PA.NUS.PPP', year: BASE, licence: 'CC BY 4.0', retrieved: m.retrieved, excluded: cc.exclude, rates };
writeFileSync('src/content/l3-currency.json', JSON.stringify(out) + '\n');
console.log('l3-currency:', Object.keys(rates).length, 'countries');
