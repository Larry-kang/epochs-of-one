// M4/M5 market & macro layer (build-time only; the game never calls an API at runtime).
// Inputs (cached in data-raw/ext, gitignored):
//   (v0.10.0) OECD share prices are NO LONGER USED: the underlying indices belong to third-party index providers (decision:
//   no OECD third-party series). US / world equity levels are now a 推估 model on WDI nominal GDP (CC BY 4.0), see below.
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

async function main() {
  await dl(OECD_URLS.house, join(EXT, 'oecd_house.csv'));
  await dl(OECD_URLS.pag, join(EXT, 'pag_DF_PAG.csv'));
  await dl(PINK_URL, join(EXT, 'cmo_m.xlsx'));
  const W = {};
  for (const [k, c] of Object.entries(WDI_EXTRA)) W[k] = await wdi(c);
  const countries = JSON.parse(readFileSync(join(ROOT, 'public/data/countries.json'), 'utf8')).countries;
  const isos = new Set(countries.map((c) => c.iso));

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
  // ---- equities (v0.10.0): no openly licensed equity index exists for the US or the world (OECD share prices carry
  // third-party index-provider rights; WDI CM.MKT.INDX.ZG is S&P data). Fallback model (推估, kind 'model_ngdp'): the
  // equity PRICE level tracks nominal GDP in USD (WDI NY.GDP.MKTP.CD, CC BY 4.0) — long-run price returns ≈ nominal
  // growth (market cap / GDP is stationary over long horizons). eq.USA = USA GDP, world = WLD GDP. No intra-year path
  // (dd = null → Brownian bridge with the design σ below). Every other country without its own open series proxies the
  // world index (already flagged 推估 by the engine). TWN keeps the self-compiled TAIEX closes.
  const eq = {};
  const ngdp = (code) => { const d = dense(W.gdpUsd.get(code), 1960, 2025); if (!d || d.v.includes(null)) throw new Error('gap in GDP ' + code); return { ...d, dd: d.v.map(() => null), kind: 'model_ngdp', src: 'wdi', est: true }; };
  eq.USA = ngdp('USA');
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
  // ---- world index (v0.10.0): 推估 model on WDI world nominal GDP in USD (see the equity note above)
  const world = { ...ngdp('WLD'), n: undefined };
  delete world.n;
  // ---- historical annual sigma of real-ish log returns (for Brownian-bridge intra-year minimum, )
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
  const logr = (s) => s.v.slice(1).map((x, i) => Math.log(x / s.v[i]));
  // design σ (推估) for the modelled equity series: annual volatility of broad equity price indices is ≈ 15–17%; the
  // GDP-tracking model itself is smooth, so σ drives only the Brownian-bridge intra-year low
  const SIGMA_MODEL = { eqUS: 0.16, eqWorld: 0.15 };
  const sigma = { eqUS: SIGMA_MODEL.eqUS, eqWorld: SIGMA_MODEL.eqWorld, gold: sig(sd(logr({ v: gold.v.slice(1972 - gold.from) })), 4), btc: sig(sd(logr(btc)), 4), eqHomeMedian: 0 };
  const homeS = Object.entries(eq).map(([iso, s]) => [iso, s.kind === 'model_ngdp' ? SIGMA_MODEL.eqUS : sig(sd(logr(s)), 4)]);
  sigma.eqHome = Object.fromEntries(homeS);
  sigma.eqHomeMedian = 0.25; // 推估: ≈ median σ of the former OECD home indices (0.254); used only for a home series without its own σ

  const markets = {
    note: 'Annual market/macro layer for the game engine. v0.10.0: US and world equity levels are a 推估 model (kind model_ngdp, est=true): the price level tracks nominal GDP in USD (WDI NY.GDP.MKTP.CD, CC BY 4.0) because no openly licensed equity index is available; OECD share prices were removed (third-party index rights). TAIEX/BTC are self-compiled year-end closes; gold = Pink Sheet December monthly average. dd[y] = max peak-to-trough drawdown within year y on the monthly path (null → Brownian bridge with sigma). FX = WDI annual average.',
    retrieved: RETRIEVED, eq, fxEuroRebased: fxFixed, world, gold, btc, fx, lend, listed, ppp, sigma,
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
      { path: 'markets/markets.json', sha256: '', src: ['wb-pinksheet', 'wdi', 'epochs-compiled'], retrieved: RETRIEVED, url: [PINK_URL, wdiSrc, 'https://www.twse.com.tw/'], schema: 'markets.schema.json', rows: Object.keys(eq).length },
      { path: 'markets/housing-pension.json', sha256: '', src: ['oecd'], retrieved: RETRIEVED, url: [OECD_URLS.house, OECD_URLS.pag], schema: 'housing-pension.schema.json', rows: Object.keys(house).length + Object.keys(pension).length },
    ],
  }, null, 1));
  // ---- market coverage report (year-end levels + intra-year drawdown availability)
  const cov = (name, sv) => { const n = sv.v.length, k = (sv.dd ?? []).filter((x) => x != null).length; return `| ${name} | ${sv.kind} | ${sv.from}–${sv.from + n - 1} | ${k}/${n} |`; };
  const pct = (sv, y) => { const x = sv.dd?.[y - sv.from]; return x == null ? '—' : (x * 100).toFixed(1) + '%'; };
  const KEY = [1974, 1987, 2000, 2001, 2002, 2008, 2020, 2022];
  writeFileSync(join(ROOT, 'docs/data-coverage-markets.md'), [
    `# 市場資料覆蓋（自動產生：pipeline/markets-ext.mjs，${RETRIEVED}）`, '',
    'v0.10.0：美國與世界股價改為**推估模型**（kind model_ngdp：股價水準追蹤 WDI 名目 GDP〔美元〕，CC BY 4.0），OECD 股價因指數商第三方權利移除。Pink Sheet 月金價取 12 月（12 月月平均）；TAIEX/BTC 為自行彙整年底收盤。`dd`＝當年月資料路徑的最大峰谷回撤（前一年 12 月為起始高點），無月資料者為 null → 引擎改用 Brownian bridge。引擎斷頭檢查使用 dd × DRAWDOWN_SAFETY_FACTOR（1.25，src/config.ts，推估）。', '',
    '| 序列 | kind | 年份 | 有 dd 的年數 |', '|---|---|---|---|',
    ...Object.keys(eq).sort().map((iso) => cov('eq.' + iso, eq[iso])), cov('world', world), cov('gold', gold), cov('btc', btc), '',
    '## 重點年份年內最大回撤', '', `| 序列 | ${KEY.join(' | ')} |`, `|---|${KEY.map(() => '---').join('|')}|`,
    ...[['USA', eq.USA], ['GBR', eq.GBR], ['JPN', eq.JPN], ['DEU', eq.DEU], ['world', world], ['gold', gold]].filter(([, s]) => s).map(([n, s]) => `| ${n} | ${KEY.map((y) => pct(s, y)).join(' | ')} |`), '',
  ].join('\n'));
  console.log(`eq ${Object.keys(eq).length} countries; world ${world.from}–${world.from + world.v.length - 1}; gold ${gold.from}–${gold.from + gold.v.length - 1}; fx ${Object.keys(fx).length}; lend ${Object.keys(lend).length}; listed ${Object.keys(listed).length}; house ${Object.keys(house).length}; pension ${Object.keys(pension).length}`);
  console.log('sigma', JSON.stringify({ ...sigma, eqHome: undefined }), 'pensionMedian', JSON.stringify(hp.pensionMedian));
}
main().catch((e) => { console.error(e); process.exit(1); });
