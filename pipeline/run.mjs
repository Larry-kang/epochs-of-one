// Data POC pipeline (M1): raw public sources → public/data/*.json + manifest + coverage.
// Sources: UN WPP 2024 (CC BY 3.0 IGO), World Bank WDI (CC BY 4.0). See NOTICE.md.
// Usage: node pipeline/run.mjs   (downloads into data-raw/ if missing; data-raw is gitignored)
import { mkdirSync, existsSync, writeFileSync, readFileSync, createWriteStream, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { readGzCsv } from './lib/csv.mjs';
import { imputeSeries } from './lib/impute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const OUT = join(ROOT, 'public/data');
const DATA_VERSION = '2026.10.0';
const RETRIEVED = '2026-10-16';
const LT_FROM = 1950, LT_TO = 2023;      // WPP 2024 estimates
const B_FROM = 1950, B_TO = 2030;        // births/SRB kept (incl. medium-variant projection years after 2023)
const W_FROM = 1960, W_TO = 2025;        // WDI window
const WPP_BASE = 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/';
const WPP_FILES = { lt: 'WPP2024_Life_Table_Abridged_Medium_1950-2023.csv.gz', di: 'WPP2024_Demographic_Indicators_Medium.csv.gz' };
export const WDI = {
  gdpPcPpp: 'NY.GDP.PCAP.PP.KD', cpi: 'FP.CPI.TOTL.ZG', gini: 'SI.POV.GINI',
  q1: 'SI.DST.FRST.20', q2: 'SI.DST.02ND.20', q3: 'SI.DST.03RD.20', q4: 'SI.DST.04TH.20', q5: 'SI.DST.05TH.20',
  urban: 'SP.URB.TOTL.IN.ZS', unemp: 'SL.UEM.TOTL.ZS', hhCons: 'NE.CON.PRVT.ZS',
  // P0 revamp: taxes (tax revenue % GDP), schooling (gross secondary / tertiary enrolment, primary entrance age)
  tax: 'GC.TAX.TOTL.GD.ZS', secEnr: 'SE.SEC.ENRR', terEnr: 'SE.TER.ENRR', prmAge: 'SE.PRM.AGES',
};
// percent-valued indicators are stored as proportions (0..1)
const PCT = new Set(['cpi', 'gini', 'q1', 'q2', 'q3', 'q4', 'q5', 'urban', 'unemp', 'hhCons', 'tax', 'secEnr', 'terEnr']);

const sig = (x, d = 5) => (x === 0 ? 0 : Number(x.toPrecision(d)));

async function download(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function fetchWdi(code) {
  const dest = join(RAW, 'wdi', `${code}.json`);
  if (!existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true });
    const rows = [];
    for (let page = 1; ; page++) {
      const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=${W_FROM}:${W_TO}&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const [meta, data] = await res.json();
      rows.push(...(data ?? []));
      if (page >= Number(meta.pages)) break;
    }
    writeFileSync(dest, JSON.stringify(rows));
  }
  const map = new Map(); // iso3 -> Map(year -> value)
  for (const r of JSON.parse(readFileSync(dest, 'utf8'))) {
    if (r.value == null || !r.countryiso3code) continue;
    if (!map.has(r.countryiso3code)) map.set(r.countryiso3code, new Map());
    map.get(r.countryiso3code).set(Number(r.date), Number(r.value));
  }
  return map;
}

async function main() {
  await download(WPP_BASE + WPP_FILES.lt, join(RAW, 'wpp', 'lt.csv.gz'));
  await download(WPP_BASE + WPP_FILES.di, join(RAW, 'wpp', 'di.csv.gz'));

  // ---- WPP demographic indicators
  const C = new Map(); // iso -> record
  for await (const r of readGzCsv(join(RAW, 'wpp', 'di.csv.gz'))) {
    if (r.LocTypeID !== '4' || !r.ISO3_code) continue;
    const y = Number(r.Time);
    let c = C.get(r.ISO3_code);
    if (!c) {
      c = { iso: r.ISO3_code, iso2: r.ISO2_code || '', name: r.Location, sub: Number(r.ParentID), births: {}, srb: {}, e0: { T: {}, M: {}, F: {} }, q5T: {} };
      C.set(r.ISO3_code, c);
    }
    if (y >= B_FROM && y <= B_TO) { c.births[y] = Number(r.Births); c.srb[y] = Number(r.SRB); }
    if (y >= LT_FROM && y <= LT_TO) {
      c.e0.T[y] = Number(r.LEx); c.e0.M[y] = Number(r.LExMale); c.e0.F[y] = Number(r.LExFemale);
      c.q5T[y] = Number(r.Q5) / 1000;
    }
  }
  // ---- WPP abridged life tables (M, F)
  const LT = new Map(); // iso -> {M: {y: {qx[], mxLast, ax0, l5}}, F: ...}
  const AGES = [0, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  for await (const r of readGzCsv(join(RAW, 'wpp', 'lt.csv.gz'))) {
    if (!r.ISO3_code || !C.has(r.ISO3_code) || (r.SexID !== '1' && r.SexID !== '2')) continue;
    const sx = r.SexID === '1' ? 'M' : 'F';
    const y = Number(r.Time);
    if (!LT.has(r.ISO3_code)) LT.set(r.ISO3_code, { M: {}, F: {} });
    const t = (LT.get(r.ISO3_code)[sx][y] ??= { qx: new Array(22).fill(null), mxLast: null, ax0: null, l5: null });
    const i = AGES.indexOf(Number(r.AgeGrpStart));
    if (i < 0) throw new Error('unexpected age group ' + r.AgeGrp);
    t.qx[i] = Number(r.qx);
    if (i === 0) t.ax0 = Number(r.ax);
    if (i === 2) t.l5 = Number(r.lx) / 100000;
    if (i === 21) t.mxLast = Number(r.mx);
  }

  // ---- WDI
  const W = {};
  for (const [k, code] of Object.entries(WDI)) W[k] = await fetchWdi(code);

  rmSync(join(OUT, 'demography'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'demography'), { recursive: true });
  const files = [];
  const coverage = [];
  const isos = [...C.keys()].filter((iso) => LT.has(iso)).sort();
  const subOf = new Map(isos.map((iso) => [iso, C.get(iso).sub]));

  // raw arrays for imputation
  const rawSeries = {};
  for (const k of Object.keys(WDI)) {
    rawSeries[k] = new Map();
    for (const iso of isos) {
      const m = W[k].get(iso);
      const arr = [];
      for (let y = W_FROM; y <= W_TO; y++) {
        const v = m?.get(y);
        arr.push(v == null ? null : PCT.has(k) ? v / 100 : v);
      }
      rawSeries[k].set(iso, arr);
    }
  }
  const series = {}; // k -> iso -> {v, imp}
  for (const k of Object.keys(WDI)) series[k] = imputeSeries(rawSeries[k], subOf);

  const countries = [];
  for (const iso of isos) {
    const c = C.get(iso);
    const bv = [], sv = [];
    for (let y = B_FROM; y <= B_TO; y++) { bv.push(sig(c.births[y] ?? 0, 6)); sv.push(sig(c.srb[y] ?? 105, 5)); }
    const s = {};
    const cov = { iso };
    for (const k of Object.keys(WDI)) {
      const { v, imp } = series[k].get(iso);
      s[k] = { from: W_FROM, v: v.map((x) => sig(x, 5)), imp };
      cov[k] = imp.filter((f) => f === '').length;
    }
    countries.push({ iso, iso2: c.iso2, name: c.name, sub: c.sub, births: { from: B_FROM, v: bv }, srb: { from: B_FROM, v: sv }, series: s });
    coverage.push(cov);

    const lt = LT.get(iso);
    const demo = { iso, from: LT_FROM, to: LT_TO, ages: AGES, M: { qx: [], mxLast: [], ax0: [] }, F: { qx: [], mxLast: [], ax0: [] }, e0: { T: [], M: [], F: [] }, q5: { T: [], M: [], F: [] } };
    for (let y = LT_FROM; y <= LT_TO; y++) {
      for (const sx of ['M', 'F']) {
        const t = lt[sx][y];
        if (!t || t.qx.some((q) => q == null)) throw new Error(`${iso} ${sx} ${y}: incomplete life table`);
        demo[sx].qx.push(t.qx.map((q) => sig(q, 4)));
        demo[sx].mxLast.push(sig(t.mxLast, 6));
        demo[sx].ax0.push(sig(t.ax0, 5));
        demo.q5[sx].push(sig(1 - t.l5, 6));
      }
      demo.e0.T.push(c.e0.T[y]); demo.e0.M.push(c.e0.M[y]); demo.e0.F.push(c.e0.F[y]);
      demo.q5.T.push(sig(c.q5T[y], 6));
    }
    files.push(writeData(`demography/${iso}.json`, demo, ['wpp2024'], 'demography-country.schema.json', LT_TO - LT_FROM + 1));
  }
  const idx = { dataVersion: DATA_VERSION, ltYears: [LT_FROM, LT_TO], birthYears: [B_FROM, B_TO], countries };
  files.unshift(writeData('countries.json', idx, ['wpp2024', 'wdi'], 'countries.schema.json', countries.length));

  const sources = JSON.parse(readFileSync(join(ROOT, 'pipeline/sources.json'), 'utf8')).filter((s) => ['wpp2024', 'wdi'].includes(s.id));
  // extra (self-compiled market) files are appended by pipeline/markets.mjs if present
  const extra = existsSync(join(ROOT, 'pipeline/markets/manifest-entries.json')) ? JSON.parse(readFileSync(join(ROOT, 'pipeline/markets/manifest-entries.json'), 'utf8')) : null;
  if (extra) { files.push(...extra.files.map((f) => ({ ...f, sha256: sha(readFileSync(join(OUT, f.path))) }))); sources.push(...extra.sources); }
  // M4/M5 market & macro layer (pipeline/markets-ext.mjs): sources given by id
  const extPath = join(ROOT, 'pipeline/markets/ext.entries.json');
  if (existsSync(extPath)) {
    const reg = JSON.parse(readFileSync(join(ROOT, 'pipeline/sources.json'), 'utf8'));
    const ext = JSON.parse(readFileSync(extPath, 'utf8'));
    for (const id of ext.sources) if (!sources.some((s) => s.id === id)) sources.push(reg.find((s) => s.id === id));
    files.push(...ext.files.map((f) => ({ ...f, sha256: sha(readFileSync(join(OUT, f.path))), license: f.src.map((id) => reg.find((s) => s.id === id).license.id) })));
  }
  const manifest = { dataVersion: DATA_VERSION, generated: `pipeline/run.mjs @ ${RETRIEVED}`, sources, files };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  writeCoverage(coverage, countries.length);
  console.log(`wrote ${files.length} files for ${countries.length} countries`);

  function writeData(path, obj, src, schema, rows) {
    const buf = Buffer.from(JSON.stringify(obj));
    const p = join(OUT, path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, buf);
    const srcs = JSON.parse(readFileSync(join(ROOT, 'pipeline/sources.json'), 'utf8'));
    return { path, sha256: sha(buf), src, license: src.map((id) => srcs.find((s) => s.id === id).license.id), retrieved: RETRIEVED,
      url: src.map((id) => srcs.find((s) => s.id === id).url), schema, rows };
  }
}
function sha(buf) { return createHash('sha256').update(buf).digest('hex'); }

function writeCoverage(rows, n) {
  const ks = Object.keys(WDI);
  const nYears = W_TO - W_FROM + 1;
  const lines = [`# 資料覆蓋率報告（自動產生：pipeline/run.mjs，${RETRIEVED}）`, '',
    `WDI 視窗 ${W_FROM}–${W_TO}（${nYears} 年）× ${n} 國。數字＝來源原值占比；其餘依 補值（interp→region→world；邊界外延 nearest）。WPP 出生數/SRB ${B_FROM}–${B_TO}、生命表 ${LT_FROM}–${LT_TO}：全部國家 100% 原值。`, '',
    '## 各指標整體覆蓋', '', '| 指標 | WDI 代碼 | 原值比例 | 完全無原值的國家數 |', '|---|---|---|---|'];
  for (const k of ks) {
    const tot = rows.reduce((a, r) => a + r[k], 0);
    const none = rows.filter((r) => r[k] === 0).length;
    lines.push(`| ${k} | ${WDI[k]} | ${(100 * tot / (n * nYears)).toFixed(1)}% | ${none} |`);
  }
  lines.push('', '## 各國原值年數', '', '| ISO | ' + ks.join(' | ') + ' |', '|---|' + ks.map(() => '---').join('|') + '|');
  for (const r of rows) lines.push(`| ${r.iso} | ` + ks.map((k) => r[k]).join(' | ') + ' |');
  writeFileSync(join(ROOT, 'docs/data-coverage.md'), lines.join('\n') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
