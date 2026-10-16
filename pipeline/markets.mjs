// Self-compiled ANNUAL CLOSING PRICES (owner decision 2026-10-16): TAIEX + BTC/USD.
// Each year's value is cross-checked against multiple public sources; the per-year note lists
// which sources were checked and how they agreed. No single database is copied wholesale:
// we only take one number per year (the last trading-day close), and pick it by rule:
//   TAIEX: TWSE official daily history (MI_5MINS_HIST, last Dec trading day) when available;
//          cross-checked vs 勞動部 open-data yearly index table (integer) and en.wikipedia annual table.
//   BTC:   median of exchange daily closes on Dec-31 (UTC) from Bitstamp, Coinbase Exchange, Bitfinex.
// Inputs are cached in data-raw/markets (gitignored). Run after fetching: node pipeline/markets.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw/markets');
const OUT = join(ROOT, 'public/data/markets');

const num = (s) => Number(String(s).replace(/,/g, '').replace('−', '-'));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const relDiff = (a, b) => Math.abs(a - b) / b;

// --- TAIEX
const wiki = {};
for (const line of readFileSync(join(RAW, 'wiki_taiex_en.wikitext'), 'utf8').split('\n')) {
  const m = line.match(/^\|\s*(\d{4})\s*\|\|?\s*([\d,]+\.\d+)/);
  if (m) wiki[Number(m[1])] = num(m[2]);
}
// rows formatted like "|2013 |8,611.51 |..." (second style)
const wt = readFileSync(join(RAW, 'wiki_taiex_en.wikitext'), 'utf8').split('|-');
for (const blk of wt) {
  const m = blk.replace(/\n/g, ' ').match(/^\s*\|\s*(\d{4})\s*\|\|?\s*([\d,]+\.\d+)/);
  if (m) wiki[Number(m[1])] ??= num(m[2]);
}
const mol = {};
for (const line of readFileSync(join(RAW, 'mol_indices.csv'), 'utf8').split('\n').slice(1)) {
  const c = line.split(',');
  if (c[0] && /^\d{4}$/.test(c[0].trim())) mol[Number(c[0])] = num(c[1]);
}
const taiex = [];
for (let y = 1967; y <= 2025; y++) {
  let twse = null, date = null;
  try {
    const d = JSON.parse(readFileSync(join(RAW, `twse_${y}12.json`), 'utf8'));
    if (d.stat === 'OK' && d.data?.length) { const last = d.data[d.data.length - 1]; twse = num(last[4]); date = last[0].trim(); }
  } catch { /* not available before 1999 */ }
  const checks = [];
  if (twse != null) checks.push(`twse=${twse}(${date} ROC)`);
  if (mol[y] != null) checks.push(`mol=${mol[y]}`);
  if (wiki[y] != null) checks.push(`wikipedia=${wiki[y]}`);
  let close, verified, note;
  if (twse != null) {
    close = twse;
    const others = [mol[y], wiki[y]].filter((v) => v != null);
    const agree = others.filter((v) => relDiff(v, twse) <= 0.001);
    verified = agree.length >= 1;
    const bad = others.filter((v) => relDiff(v, twse) > 0.001);
    note = `official TWSE value; ${agree.length}/${others.length} cross-checks agree within 0.1%` + (bad.length ? `; disagreeing: ${bad.join(', ')} (TWSE preferred)` : '');
  } else if (wiki[y] != null) {
    close = wiki[y];
    verified = mol[y] != null && relDiff(mol[y], wiki[y]) <= 0.001;
    note = verified ? 'wikipedia value confirmed by MOL open data' : 'single public source (en.wikipedia annual table, citing CEIC); NOT independently verified — TODO cross-check with TWSE yearbook';
  } else continue;
  taiex.push({ year: y, close, verified, checked: checks, note });
}

// --- BTC
const btcRaw = JSON.parse(readFileSync(join(RAW, 'btc_yearend_raw.json'), 'utf8'));
const btc = [];
for (const [ys, row] of Object.entries(btcRaw)) {
  const vals = Object.entries(row).filter(([, v]) => typeof v === 'number');
  if (!vals.length) continue;
  const med = median(vals.map(([, v]) => v));
  const spread = Math.max(...vals.map(([, v]) => relDiff(v, med)));
  const close = med >= 100 ? Math.round(med) : Math.round(med * 100) / 100;
  btc.push({ year: Number(ys), close, verified: vals.length >= 2 && spread <= 0.05,
    checked: vals.map(([k, v]) => `${k}=${v}`),
    note: vals.length >= 2 ? `median of ${vals.length} exchange Dec-31 UTC daily closes; max deviation ${(spread * 100).toFixed(2)}%` : 'single exchange source (Bitstamp); NOT independently verified' });
}
btc.sort((a, b) => a.year - b.year);

const doc = {
  note: 'Self-compiled annual closing prices (last trading day of the year). Facts cross-checked across public sources; see per-year notes. Not investment data of record.',
  compiled: '2026-10-16',
  series: {
    TAIEX: { unit: 'index points (price index, excludes dividends)', currency: 'TWD', sourcesChecked: ['TWSE MI_5MINS_HIST (https://www.twse.com.tw/)', '勞動部開放資料 主要國家股價指數年表 (https://apiservice.mol.gov.tw/)', 'en.wikipedia.org/wiki/TAIEX annual table'], rows: taiex },
    BTC: { unit: 'USD per BTC', currency: 'USD', sourcesChecked: ['Bitstamp public OHLC API', 'Coinbase Exchange public candles API', 'Bitfinex public candles API'], rows: btc },
  },
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'annual-closes.json'), JSON.stringify(doc, null, 1));
writeFileSync(join(ROOT, 'pipeline/markets/manifest-entries.json'), JSON.stringify({
  sources: [JSON.parse(readFileSync(join(ROOT, 'pipeline/sources.json'), 'utf8')).find((s) => s.id === 'epochs-compiled')],
  files: [{ path: 'markets/annual-closes.json', sha256: '', src: ['epochs-compiled'], license: ['self-compiled facts'], retrieved: '2026-10-16',
    url: ['https://www.twse.com.tw/', 'https://apiservice.mol.gov.tw/', 'https://en.wikipedia.org/wiki/TAIEX', 'https://www.bitstamp.net/api/', 'https://api.exchange.coinbase.com/', 'https://api-pub.bitfinex.com/'],
    schema: 'annual-closes.schema.json', rows: taiex.length + btc.length }],
}, null, 1));
console.log(`TAIEX ${taiex.length} rows (${taiex.filter((r) => r.verified).length} verified); BTC ${btc.length} rows (${btc.filter((r) => r.verified).length} verified)`);
