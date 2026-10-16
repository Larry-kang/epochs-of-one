// M4/M5 market & macro layer (build-time only; the game never calls an API at runtime).
// Inputs (cached in data-raw/ext, gitignored):
//   OECD Share prices (MONTHLY, price index 2015=100; December = year-end)          — OECD terms: data reusable w/ attribution (pipeline/licenses)
//   OECD Analytical house prices, real (RHP, annual)            — same (M5)
//   OECD Pensions at a Glance (GPRR100, CRPLF22, 2024)          — same (M5)
//   World Bank Pink Sheet MONTHLY nominal gold USD/troy oz (December = year-end)        — CC BY 4.0 (WB data catalog)
//   WDI PA.NUS.FCRF (FX), FR.INR.LEND (lending rate), NY.GDP.MKTP.CD (GDP USD), CM.MKT.LDOM.NO (listed cos.), PA.NUS.PPP
//   self-compiled TAIEX/BTC annual closes (public/data/markets/annual-closes.json)
// Output: public/data/markets/markets.json, public/data/markets/housing-pension.json + pipeline/markets/ext.entries.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const EXT = join(RAW, 'ext');
const OUT = join(ROOT, 'public/data/markets');
const RETRIEVED = '2026-10-16';
const W_FROM = 1960, W_TO = 2025;
export const OECD_URLS = {
  share: 'https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/.M.SHARE.......?startPeriod=1950-01&format=csv',
  house: 'https://sdmx.oecd.org/public/rest/data/OECD.ECO.MPD,DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES,1.0/.A.RHP.?startPeriod=1950&format=csv',
  pag: 'https://sdmx.oecd.org/public/rest/data/OECD.ELS.SPD,DSD_PAG@DF_PAG,1.0/all?format=csvfilewithlabels',
};
export const PINK_URL = 'https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx';
const WDI_EXTRA = { fx: 'PA.NUS.FCRF', lend: 'FR.INR.LEND', gdpUsd: 'NY.GDP.MKTP.CD', listed: 'CM.MKT.LDOM.NO', ppp: 'PA.NUS.PPP' };

async function dl(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}
async function wdi(code) {
  const dest = join(RAW, 'wdi', `${code}.json`);
  if (!existsSync(dest)) {
    const rows = [];
    for (let page = 1; ; page++) {
      const res = await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=${W_FROM}:${W_TO}&page=${page}`);
      if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
      const [meta, data] = await res.json();
      rows.push(...(data ?? []));
      if (page >= Number(meta.pages)) break;
    }
    writeFileSync(dest, JSON.stringify(rows));
  }
  const m = new Map();
  for (const r of JSON.parse(readFileSync(dest, 'utf8'))) {
    if (r.value == null || !r.countryiso3code) continue;
    if (!m.has(r.countryiso3code)) m.set(r.countryiso3code, new Map());
    m.get(r.countryiso3code).set(Number(r.date), Number(r.value));
  }
  return m;
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}
const sig = (x, d = 6) => (x === 0 ? 0 : Number(x.toPrecision(d)));
/** dense {from, v[]} from a year map (null for gaps) */
function dense(map, lo = -Infinity, hi = Infinity) {
  const ys = [...map.keys()].filter((y) => y >= lo && y <= hi).sort((a, b) => a - b);
  if (!ys.length) return null;
  const v = [];
  for (let y = ys[0]; y <= ys[ys.length - 1]; y++) v.push(map.has(y) ? sig(map.get(y)) : null);
  return { from: ys[0], v };
}
const at = (s, y) => (s && y >= s.from && y - s.from < s.v.length ? s.v[y - s.from] : null);

async function main() {
  await dl(OECD_URLS.share, join(EXT, 'oecd_share_m.csv'));
  await dl(OECD_URLS.house, join(EXT, 'oecd_house.csv'));
  await dl(OECD_URLS.pag, join(EXT, 'pag_DF_PAG.csv'));
  await dl(PINK_URL, join(EXT, 'cmo_m.xlsx'));
  const W = {};
  for (const [k, c] of Object.entries(WDI_EXTRA)) W[k] = await wdi(c);
  const countries = JSON.parse(readFileSync(join(ROOT, 'public/data/countries.json'), 'utf8')).countries;
  const isos = new Set(countries.map((c) => c.iso));

  // ---- equities (home index): OECD MONTHLY share prices → YEAR-END value = December observation (acceptance 2026-10-16).
  // OECD monthly share prices are monthly averages of daily index values (price index, 2015=100), so "December" is the
  // closest year-end level available under an allowed license. Intra-year drawdown `dd[y]` = deepest peak-to-trough fall
  // within year y on the monthly path [Dec(y−1), Jan(y) … Dec(y)] (peak starts at the previous year-end).
  const eq = {};
  const monthly = (rows) => { // iso -> Map(year -> number[12])
    const out = new Map();
    for (const r of rows) {
      const [ys, ms] = String(r.TIME_PERIOD).split('-'); const y = Number(ys), mo = Number(ms) - 1;
      if (!(mo >= 0 && mo < 12) || r.OBS_VALUE === '' || r.OBS_VALUE == null) continue;
      if (!out.has(r.REF_AREA)) out.set(r.REF_AREA, new Map());
      const mm = out.get(r.REF_AREA); if (!mm.has(y)) mm.set(y, new Array(12).fill(null));
      mm.get(y)[mo] = Number(r.OBS_VALUE);
    }
    return out;
  };
  /** year-end series + intra-year max drawdown from a Map(year -> 12 monthly values) */
  const yearEndAndDd = (mm, lo, hi) => {
    const dec = new Map();
    for (const [y, arr] of mm) if (y >= lo && y <= hi && arr[11] != null) dec.set(y, arr[11]);
    const d = dense(dec, lo, hi); if (!d) return null;
    const dd = d.v.map((_, i) => {
      const y = d.from + i, prev = mm.get(y - 1)?.[11], arr = mm.get(y);
      if (prev == null || !arr || arr.some((x) => x == null)) return null;
      let peak = prev, worst = 0;
      for (const x of arr) { peak = Math.max(peak, x); worst = Math.min(worst, x / peak - 1); }
      return sig(worst, 4);
    });
    return { ...d, dd };
  };
  const shareM = monthly(parseCsv(readFileSync(join(EXT, 'oecd_share_m.csv'), 'utf8')));
  const shareMonthly = new Map();
  for (const [iso, mm] of shareM) {
    if (!isos.has(iso)) continue; // drops EA20 aggregate
    mm.delete(Number(RETRIEVED.slice(0, 4)));
    // 2 decimals on a 2015=100 base: hyperinflation-era values round toward 0 → start after the last year with any value < 0.5
    const bad = [...mm].filter(([, arr]) => arr.some((v) => v != null && !(v >= 0.5))).map(([y]) => y);
    const lo = bad.length ? Math.max(...bad) + 1 : 1950;
    const d = yearEndAndDd(mm, Math.max(lo, 1950), 2025);
    if (d && !d.v.includes(null)) { eq[iso] = { ...d, kind: 'dec_monthly', src: 'oecd' }; shareMonthly.set(iso, mm); }
  }
  // TWN: self-compiled TAIEX year-end closes (unverified years flagged); no monthly series under an allowed license → dd = null (engine uses the Brownian bridge)
  const closes = JSON.parse(readFileSync(join(OUT, 'annual-closes.json'), 'utf8')).series;
  const tx = closes.TAIEX.rows;
  eq.TWN = { from: tx[0].year, v: tx.map((r) => r.close), dd: tx.map(() => null), kind: 'close', src: 'epochs-compiled', unverified: tx.filter((r) => !r.verified).map((r) => r.year) };
  for (const s of Object.values(eq)) {
    const gaps = s.v.filter((x) => x == null).length; if (gaps) throw new Error('gap in equity series');
  }
  // ---- gold: Pink Sheet MONTHLY nominal USD/toz (monthly average) → December = year-end; dd from the monthly path
  const goldJson = execFileSync('python3', ['-c', `
import openpyxl, json
wb = openpyxl.load_workbook(${JSON.stringify(join(EXT, 'cmo_m.xlsx'))}, read_only=True, data_only=True)
ws = wb['Monthly Prices']
rows = list(ws.iter_rows(values_only=True))
hdr = None
for i, r in enumerate(rows[:12]):
    for j, c in enumerate(r):
        if isinstance(c, str) and c.strip().lower() == 'gold': hdr = (i, j)
i, j = hdr
out = {}
for r in rows[i+1:]:
    k = str(r[0] or '').strip()
    if len(k) != 7 or k[4] != 'M': continue
    v = r[j]
    if isinstance(v, (int, float)): out[k] = v
print(json.dumps(out))
`]).toString();
  const goldMM = new Map();
  for (const [k, v] of Object.entries(JSON.parse(goldJson))) {
    const y = Number(k.slice(0, 4)), mo = Number(k.slice(5)) - 1;
    if (!goldMM.has(y)) goldMM.set(y, new Array(12).fill(null));
    goldMM.get(y)[mo] = v;
  }
  const gold = { ...yearEndAndDd(goldMM, 1960, 2025), kind: 'dec_monthly', src: 'wb-pinksheet' };
  // ---- BTC (self-compiled year-end closes; 2010 off); no monthly lows compiled → dd = null (Brownian bridge)
  const bt = closes.BTC.rows.filter((r) => r.year >= 2011);
  const btc = { from: bt[0].year, v: bt.map((r) => r.close), dd: bt.map(() => null), kind: 'close', src: 'epochs-compiled', unverified: bt.filter((r) => !r.verified).map((r) => r.year) };

  // ---- FX, lending rate, listed companies (all countries; nulls kept → engine fallback, flagged)
  // WDI PA.NUS.FCRF reports euro-area members in the legacy currency before adoption and in EUR after.
  // Re-express pre-adoption years in EUR using the irrevocable conversion rates (EU Council regulations; public facts).
  // Applied only where the series shows the redenomination break (|Δlog| > 0.5 in the adoption year).
  const EURO = { AUT: [1999, 13.7603], BEL: [1999, 40.3399], DEU: [1999, 1.95583], ESP: [1999, 166.386], FIN: [1999, 5.94573], FRA: [1999, 6.55957],
    IRL: [1999, 0.787564], ITA: [1999, 1936.27], LUX: [1999, 40.3399], NLD: [1999, 2.20371], PRT: [1999, 200.482], GRC: [2001, 340.75],
    SVN: [2007, 239.64], CYP: [2008, 0.585274], MLT: [2008, 0.4293], SVK: [2009, 30.126], EST: [2011, 15.6466], LVA: [2014, 0.702804], LTU: [2015, 3.4528], HRV: [2023, 7.5345] };
  const fxFixed = [];
  for (const [iso, [y0, rate]] of Object.entries(EURO)) {
    const f = W.fx.get(iso); if (!f || !f.has(y0) || !f.has(y0 - 1)) continue;
    if (Math.abs(Math.log(f.get(y0) / f.get(y0 - 1))) <= 0.5) continue;
    for (const [y, v] of f) if (y < y0) f.set(y, v / rate);
    fxFixed.push(iso);
  }
  const fx = {}, lend = {}, listed = {}, ppp = {};
  for (const iso of isos) {
    const f = W.fx.get(iso); if (f) { const d = dense(f); if (d) fx[iso] = d; }
    const l = W.lend.get(iso); if (l) { const d = dense(new Map([...l].map(([y, v]) => [y, v / 100]))); if (d) lend[iso] = d; }
    const c = W.listed.get(iso); if (c) { const ys = [...c].filter(([, v]) => v > 0).map(([y]) => y); if (ys.length) listed[iso] = Math.min(...ys); }
    const p = W.ppp.get(iso); if (p) { const d = dense(p); if (d) ppp[iso] = d; }
  }
  // ---- world index: GDP(USD)-weighted USD price returns of countries with OECD/compiled equity + FX
  const world = { from: 0, v: [], n: [], dd: [] };
  const usdRet = (iso, y) => {
    const s = eq[iso]; const a = at(s, y - 1), b = at(s, y);
    if (a == null || b == null) return null;
    const f0 = at(fx[iso], y - 1), f1 = at(fx[iso], y);
    if (iso !== 'USA' && (f0 == null || f1 == null)) return null;
    return iso === 'USA' ? b / a - 1 : (b / a) * (f0 / f1) - 1;
  };
  // year-end (December) levels; FX = WDI annual average (no year-end FX under an allowed license — documented).
  // World intra-year drawdown: GDP-weighted monthly path of local-currency index ratios vs the previous December (FX held fixed within the year).
  let level = 100, started = false;
  world.dd = [];
  for (let y = 1958; y <= 2025; y++) {
    let wsum = 0, rsum = 0, n = 0;
    const path = new Array(12).fill(0); let pw = 0;
    for (const iso of Object.keys(eq)) {
      const r = usdRet(iso, y); const g = W.gdpUsd.get(iso)?.get(y - 1);
      if (r == null || !g) continue; wsum += g; rsum += g * r; n++;
      const mm = shareMonthly.get(iso), prev = mm?.get(y - 1)?.[11], arr = mm?.get(y);
      if (prev != null && arr && !arr.some((x) => x == null)) { arr.forEach((x, k) => { path[k] += g * (x / prev); }); pw += g; }
    }
    if (n < 3) continue;
    let dd = null;
    if (pw > 0) { let peak = 1, worst = 0; for (const x of path) { const v = x / pw; peak = Math.max(peak, v); worst = Math.min(worst, v / peak - 1); } dd = sig(worst, 4); }
    if (!started) { world.from = y - 1; world.v.push(100); world.n.push(n); world.dd.push(null); started = true; }
    level *= 1 + rsum / wsum; world.v.push(sig(level)); world.n.push(n); world.dd.push(dd);
  }
  world.n[0] = world.n[1];
  // ---- historical annual sigma of real-ish log returns (for Brownian-bridge intra-year minimum, )
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
  const logr = (s) => s.v.slice(1).map((x, i) => Math.log(x / s.v[i]));
  const sigma = { eqUS: sig(sd(logr(eq.USA)), 4), eqWorld: sig(sd(logr(world)), 4), gold: sig(sd(logr({ v: gold.v.slice(1972 - gold.from) })), 4), btc: sig(sd(logr(btc)), 4), eqHomeMedian: 0 };
  const homeS = Object.entries(eq).map(([iso, s]) => [iso, sig(sd(logr(s)), 4)]);
  sigma.eqHome = Object.fromEntries(homeS);
  sigma.eqHomeMedian = homeS.map(([, v]) => v).sort((a, b) => a - b)[homeS.length >> 1];

  const markets = {
    note: 'Annual market/macro layer for the game engine. Equities are PRICE indices (no dividends). All levels are YEAR-END: OECD monthly share prices and Pink Sheet monthly gold take the December observation (a December monthly average); TAIEX/BTC are self-compiled year-end closes. dd[y] = max peak-to-trough drawdown within year y on the monthly path (null when no monthly data). World index is a self-built GDP-weighted synthetic of the listed countries (not MSCI); FX = WDI annual average.',
    retrieved: RETRIEVED, eq, fxEuroRebased: fxFixed, world: { ...world, kind: 'synthetic_gdp_weighted', src: 'derived(oecd,wdi)' }, gold, btc, fx, lend, listed, ppp, sigma,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'markets.json'), JSON.stringify(markets));

  // ---- M5: housing (OECD real house price index) + pensions (OECD PaG 2024)
  const houseRows = parseCsv(readFileSync(join(EXT, 'oecd_house.csv'), 'utf8'));
  const hm = new Map();
  for (const r of houseRows) { if (!isos.has(r.REF_AREA)) continue; if (!hm.has(r.REF_AREA)) hm.set(r.REF_AREA, new Map()); hm.get(r.REF_AREA).set(Number(r.TIME_PERIOD), Number(r.OBS_VALUE)); }
  const house = {};
  for (const [iso, m] of hm) { const d = dense(m, 1950, 2025); if (d && !d.v.includes(null)) house[iso] = d; }
  const pagRows = parseCsv(readFileSync(join(EXT, 'pag_DF_PAG.csv'), 'utf8'));
  const pension = {};
  for (const r of pagRows) {
    if (!isos.has(r.REF_AREA)) continue;
    const k = r.MEASURE === 'GPRR100' && r.OPTIONALITY === 'M' ? 'grr' : r.MEASURE === 'CRPLF22' ? 'age' : null;
    if (!k || !['M', 'F'].includes(r.SEX) || r.OBS_VALUE === '') continue;
    pension[r.REF_AREA] ??= {};
    pension[r.REF_AREA][k + r.SEX] = k === 'grr' ? sig(Number(r.OBS_VALUE) / 100, 4) : Number(r.OBS_VALUE);
  }
  for (const [iso, p] of Object.entries(pension)) if (!('grrM' in p && 'grrF' in p && 'ageM' in p && 'ageF' in p)) delete pension[iso];
  const med = (k) => { const xs = Object.values(pension).map((p) => p[k]).sort((a, b) => a - b); return xs[xs.length >> 1]; };
  const hp = { note: 'OECD real house price index (RHP, 2015=100; already CPI-deflated) and OECD Pensions at a Glance 2024 (gross replacement rate, mandatory schemes, average earner; current normal retirement age). Countries not listed use the OECD median, flagged 推估.',
    retrieved: RETRIEVED, house, pension, pensionMedian: { grrM: med('grrM'), grrF: med('grrF'), ageM: med('ageM'), ageF: med('ageF') } };
  writeFileSync(join(OUT, 'housing-pension.json'), JSON.stringify(hp));

  const wdiSrc = 'https://api.worldbank.org/v2/';
  writeFileSync(join(ROOT, 'pipeline/markets/ext.entries.json'), JSON.stringify({
    sources: ['oecd', 'wb-pinksheet'],
    files: [
      { path: 'markets/markets.json', sha256: '', src: ['oecd', 'wb-pinksheet', 'wdi', 'epochs-compiled'], retrieved: RETRIEVED, url: [OECD_URLS.share, PINK_URL, wdiSrc], schema: 'markets.schema.json', rows: Object.keys(eq).length },
      { path: 'markets/housing-pension.json', sha256: '', src: ['oecd'], retrieved: RETRIEVED, url: [OECD_URLS.house, OECD_URLS.pag], schema: 'housing-pension.schema.json', rows: Object.keys(house).length + Object.keys(pension).length },
    ],
  }, null, 1));
  // ---- market coverage report (year-end levels + intra-year drawdown availability)
  const cov = (name, sv) => { const n = sv.v.length, k = (sv.dd ?? []).filter((x) => x != null).length; return `| ${name} | ${sv.kind} | ${sv.from}–${sv.from + n - 1} | ${k}/${n} |`; };
  const pct = (sv, y) => { const x = sv.dd?.[y - sv.from]; return x == null ? '—' : (x * 100).toFixed(1) + '%'; };
  const KEY = [1974, 1987, 2000, 2001, 2002, 2008, 2020, 2022];
  writeFileSync(join(ROOT, 'docs/data-coverage-markets.md'), [
    `# 市場資料覆蓋（自動產生：pipeline/markets-ext.mjs，${RETRIEVED}）`, '',
    '所有水準皆為**年底值**：OECD 月股價、Pink Sheet 月金價取 12 月（12 月月平均）；TAIEX/BTC 為自行彙整年底收盤。`dd`＝當年月資料路徑的最大峰谷回撤（前一年 12 月為起始高點），無月資料者為 null → 引擎改用 Brownian bridge。引擎斷頭檢查使用 dd × DRAWDOWN_SAFETY_FACTOR（1.25，src/config.ts，推估）。', '',
    '| 序列 | kind | 年份 | 有 dd 的年數 |', '|---|---|---|---|',
    ...Object.keys(eq).sort().map((iso) => cov('eq.' + iso, eq[iso])), cov('world', { ...world, kind: 'synthetic_gdp_weighted' }), cov('gold', gold), cov('btc', btc), '',
    '## 重點年份年內最大回撤', '', `| 序列 | ${KEY.join(' | ')} |`, `|---|${KEY.map(() => '---').join('|')}|`,
    ...[['USA', eq.USA], ['GBR', eq.GBR], ['JPN', eq.JPN], ['DEU', eq.DEU], ['world', world], ['gold', gold]].filter(([, s]) => s).map(([n, s]) => `| ${n} | ${KEY.map((y) => pct(s, y)).join(' | ')} |`), '',
  ].join('\n'));
  console.log(`eq ${Object.keys(eq).length} countries; world ${world.from}–${world.from + world.v.length - 1}; gold ${gold.from}–${gold.from + gold.v.length - 1}; fx ${Object.keys(fx).length}; lend ${Object.keys(lend).length}; listed ${Object.keys(listed).length}; house ${Object.keys(house).length}; pension ${Object.keys(pension).length}`);
  console.log('sigma', JSON.stringify({ ...sigma, eqHome: undefined }), 'pensionMedian', JSON.stringify(hp.pensionMedian));
}
main().catch((e) => { console.error(e); process.exit(1); });
