// L1 data pipeline (localization-plan L1): ILOSTAT ISCO×sex + informality, UIS (separate CC BY-SA file), PaG 2025 with
// third-party filtering, WDI per-indicator licence audit, and manifest provenance (source, URL, licence, retrieval date,
// transform) for EVERY shipped data file. Runs after pipeline/run.mjs (+ wpp-extra) and patches public/data/manifest.json.
// Usage: node pipeline/l1.mjs            (uses data-raw/ caches; --fetch re-downloads them)
// Licence rules (approved 2026-10-17): WB only CC BY catalog/indicator licences; UIS = CC BY-SA 4.0 in its own file; no WHO,
// no ISSA, no OECD third-party series, no CN/NG national statistics (→ 推估), KR KOGL Type 1 only; ILOSTAT CC BY 4.0.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw');
const OUT = join(ROOT, 'public/data');
export const L1_RETRIEVED = '2026-10-17';
export const URLS = {
  iloOcu: 'https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_OCU_NB/.A..SEX_M+SEX_F.?startPeriod=1960&format=csvfilewithlabels',
  iloInf: 'https://sdmx.ilo.org/rest/data/ILO,DF_EMP_NIFL_SEX_RT/?startPeriod=1990&format=csvfilewithlabels',
  uis: 'https://api.uis.unesco.org/api/public/data/indicators?indicator=GER.5T8&start=1970&end=2025',
  pag: 'https://sdmx.oecd.org/public/rest/data/OECD.ELS.SPD,DSD_PAG@DF_PAG,1.0/all?format=csvfilewithlabels',
  wdiMeta: (code) => `https://api.worldbank.org/v2/sources/2/series/${code}/metadata?format=json`,
};
/** PaG measures kept: OECD's own pension-model outputs (computed by the OECD from legislation). Dropped (decision: OECD
 *  third-party series): indicators built from national surveys / other agencies (exit ages from national LFS, LE/FR/OAWAR
 *  from UN WPP, old-age incomes and poverty from national household surveys, average wage, employment rates, spending). */
export const PAG_KEEP = { CRPLF22: 'current normal retirement age (entry at 22)', FRPLF22: 'future normal retirement age (entry at 22)', GPRR100: 'gross replacement rate, average earner', NPRR100: 'net replacement rate, average earner' };
export const PAG_DROP = ['ELMEA', 'EYLME', 'LE', 'FR', 'OAWAR', 'EDIOP', 'EIOP', 'CIOP', 'OCOP', 'PTOP', 'OAIP', 'AWGW', 'ER', 'PEP', 'PPEP', 'ATRAEP', 'ATRPPAE', 'ATRW', 'GPRR50', 'GPRR200', 'NPRR50', 'NPRR200', 'GPW50', 'GPW100', 'GPW200', 'NPW50', 'NPW100', 'NPW200'];
/** national statistics without an open licence: never used as a source; values for these countries come from ILO/WB/UIS
 *  only, and anything else is 推估 */
export const NO_NATIONAL = ['CHN', 'NGA'];
const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];
const sig = (x, d = 4) => (x === 0 ? 0 : Number(x.toPrecision(d)));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const isIso = (s) => /^[A-Z]{3}$/.test(s) && !/^X\d\d$/.test(s) && s !== 'XA1';

async function dl(url, dest) {
  if (existsSync(dest) && !process.argv.includes('--fetch')) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url); if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}
/** nearest observation to each decade anchor (±5 y), so the shipped table is small and documented */
function byDecade(years) {
  const out = {};
  for (const d of DECADES) {
    let best = null; for (const y of years) if (Math.abs(y - d) <= 5 && (best === null || Math.abs(y - d) < Math.abs(best - d) || (Math.abs(y - d) === Math.abs(best - d) && y > best))) best = y;
    if (best !== null) out[d] = best;
  }
  return out;
}

export function buildIloOcc(csv) {
  // iso -> year -> class -> sex -> major -> count (thousands)
  const T = new Map();
  for (const r of parseCsv(csv)) {
    if (!isIso(r.REF_AREA)) continue;
    const m = /^OCU_(ISCO08|ISCO88)_(\d)$/.exec(r.OCU); if (!m || r.OBS_VALUE === '') continue;
    const sx = r.SEX === 'SEX_M' ? 'M' : r.SEX === 'SEX_F' ? 'F' : null; if (!sx) continue;
    const y = Number(r.TIME_PERIOD);
    const a = (((T.get(r.REF_AREA) ?? T.set(r.REF_AREA, new Map()).get(r.REF_AREA)).get(y) ?? T.get(r.REF_AREA).set(y, {}).get(y))[m[1]] ??= { M: new Array(10).fill(0), F: new Array(10).fill(0) });
    a[sx][Number(m[2])] += Number(r.OBS_VALUE);
  }
  const out = {};
  for (const [iso, ym] of [...T].sort()) {
    const ok = [...ym].filter(([, c]) => { const k = c.ISCO08 ? 'ISCO08' : 'ISCO88'; return c[k].M.reduce((a, b) => a + b, 0) > 0 && c[k].F.reduce((a, b) => a + b, 0) > 0; }).map(([y]) => y);
    const pick = byDecade(ok); if (!Object.keys(pick).length) continue;
    out[iso] = {};
    for (const [d, y] of Object.entries(pick)) {
      const c = ym.get(y); const cls = c.ISCO08 ? 'ISCO08' : 'ISCO88';
      const M = c[cls].M, F = c[cls].F; const tot = M.reduce((a, b) => a + b, 0) + F.reduce((a, b) => a + b, 0);
      // employment share of each (sex, ISCO major group 0–9) in total employment of known occupation
      out[iso][d] = { y, cls, M: M.map((v) => sig(v / tot)), F: F.map((v) => sig(v / tot)) };
    }
  }
  return out;
}

export function buildIloInf(csv) {
  const T = new Map();
  for (const r of parseCsv(csv)) {
    if (!isIso(r.REF_AREA) || r.OBS_VALUE === '') continue;
    const sx = { SEX_T: 'T', SEX_M: 'M', SEX_F: 'F' }[r.SEX]; if (!sx) continue;
    const y = Number(r.TIME_PERIOD); if (!Number.isInteger(y)) continue; const m = T.get(r.REF_AREA) ?? T.set(r.REF_AREA, new Map()).get(r.REF_AREA);
    (m.get(y) ?? m.set(y, {}).get(y))[sx] = sig(Number(r.OBS_VALUE) / 100);
  }
  const out = {};
  for (const [iso, m] of [...T].sort()) {
    const ok = [...m].filter(([, v]) => v.M != null && v.F != null).map(([y]) => y); if (!ok.length) continue;
    const pick = byDecade(ok); const latest = Math.max(...ok); out[iso] = {};
    for (const [d, y] of Object.entries(pick)) out[iso][d] = { y, ...m.get(y) };
    out[iso].latest = { y: latest, ...m.get(latest) };
  }
  return out;
}

export function buildUis(json) {
  const T = new Map();
  for (const r of JSON.parse(json).records) { if (!isIso(r.geoUnit) || r.value == null) continue; (T.get(r.geoUnit) ?? T.set(r.geoUnit, new Map()).get(r.geoUnit)).set(r.year, sig(r.value / 100)); }
  const out = {};
  for (const [iso, m] of [...T].sort()) { const pick = byDecade([...m.keys()]); if (!Object.keys(pick).length) continue; out[iso] = Object.fromEntries(Object.entries(pick).map(([d, y]) => [d, { y, ger: m.get(y) }])); }
  return out;
}

export function buildPag(csv) {
  const out = {}; const dropped = new Set();
  for (const r of parseCsv(csv)) {
    if (!isIso(r.REF_AREA) || r.OBS_VALUE === '') continue;
    if (!(r.MEASURE in PAG_KEEP)) { dropped.add(r.MEASURE); continue; }
    if (!['M', 'F'].includes(r.SEX)) continue;
    if (r.MEASURE.includes('PRR') && r.OPTIONALITY !== 'M') continue; // mandatory schemes only
    const y = Number(r.TIME_PERIOD); const k = r.MEASURE + '_' + r.SEX; const cur = (out[r.REF_AREA] ??= {})[k];
    if (!cur || y > cur.y) out[r.REF_AREA][k] = { y, v: r.MEASURE.includes('PRR') ? sig(Number(r.OBS_VALUE) / 100) : Number(r.OBS_VALUE) };
  }
  return { out, dropped: [...dropped].sort() };
}

/** per-indicator licence for every WDI code the project ships (World Bank metadata field License_Type) */
export async function wdiLicences(codes) {
  const p = join(ROOT, 'pipeline/l1/wdi-licences.json');
  const cache = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { retrieved: L1_RETRIEVED, indicators: {} };
  for (const c of codes) {
    if (cache.indicators[c] && !process.argv.includes('--fetch')) continue;
    const d = await (await fetch(URLS.wdiMeta(c))).json();
    const m = Object.fromEntries(d.source[0].concept[0].variable[0].metatype.map((x) => [x.id, x.value]));
    cache.indicators[c] = { license: m.License_Type ?? 'MISSING', licenseUrl: m.License_URL ?? '', source: (m.Source ?? '').split('\n')[0].slice(0, 160) };
  }
  writeFileSync(p, JSON.stringify(cache, null, 1) + '\n');
  return cache;
}

/** transform text for files written by earlier pipeline steps (kept here so the manifest always says how a file was made) */
const TRANSFORM = [
  [/^countries\.json$/, 'pipeline/run.mjs: WPP 2024 demographic indicators + WDI series 1960–2025 → per-country record; % → proportion; gaps imputed (interp → region → world, docs/data-imputation.md), imputed cells flagged est[]'],
  [/^demography\//, 'pipeline/run.mjs: WPP 2024 abridged life tables (M/F, 1950–2023) + births/SRB 1950–2030 → per-country JSON; values copied, no modelling'],
  [/^wpp-extra\.json$/, 'pipeline/wpp-extra.mjs: WPP 2024 TFR / mean age at childbearing → per-country series; values copied'],
  [/^markets\/annual-closes\.json$/, 'pipeline/markets.mjs: self-compiled year-end closes (TAIEX, BTC/USD) cross-checked against several public sources'],
  [/^markets\/markets\.json$/, 'pipeline/markets-ext.mjs: OECD share prices (Dec level, monthly drawdown), WB Pink Sheet commodity prices, WDI rates/CPI → real annual returns per country'],
  [/^markets\/housing-pension\.json$/, 'pipeline/markets-ext.mjs: OECD real house price index (RHP) + PaG GPRR100 (mandatory, ÷100) and CRPLF22 per sex; non-listed countries use the OECD median (推估)'],
];

async function main() {
  await dl(URLS.iloOcu, join(RAW, 'ilostat/emp_ocu.csv'));
  await dl(URLS.iloInf, join(RAW, 'ilostat/infl.csv'));
  await dl(URLS.uis, join(RAW, 'uis/ger58.json'));
  await dl(URLS.pag, join(RAW, 'ext/pag_DF_PAG.csv'));
  const reg = JSON.parse(readFileSync(join(ROOT, 'pipeline/sources.json'), 'utf8'));
  const R = (id) => { const s = reg.find((x) => x.id === id); if (!s) throw new Error('unregistered source ' + id); return s; };

  const occ = buildIloOcc(readFileSync(join(RAW, 'ilostat/emp_ocu.csv'), 'utf8'));
  const inf = buildIloInf(readFileSync(join(RAW, 'ilostat/infl.csv'), 'utf8'));
  const uis = buildUis(readFileSync(join(RAW, 'uis/ger58.json'), 'utf8'));
  const { out: pag, dropped } = buildPag(readFileSync(join(RAW, 'ext/pag_DF_PAG.csv'), 'utf8'));
  const codes = ['NY.GDP.PCAP.PP.KD', 'FP.CPI.TOTL.ZG', 'SI.POV.GINI', 'SI.DST.FRST.20', 'SI.DST.02ND.20', 'SI.DST.03RD.20', 'SI.DST.04TH.20', 'SI.DST.05TH.20', 'SP.URB.TOTL.IN.ZS', 'SL.UEM.TOTL.ZS', 'NE.CON.PRVT.ZS', 'GC.TAX.TOTL.GD.ZS', 'SE.SEC.ENRR', 'SE.TER.ENRR', 'SE.PRM.AGES', 'CM.MKT.LDOM.NO', 'FR.INR.LEND', 'NY.GDP.MKTP.CD', 'PA.NUS.FCRF', 'PA.NUS.PPP'];
  await wdiLicences(codes);

  const ilo = R('ilostat'), uisS = R('uis'), pagS = R('oecd-pag');
  const attr = (s) => `${s.name}. Licence: ${s.license.id} (${s.license.url}). Retrieved ${s.retrieved}. Adapted by Epochs of One: see "transform"; the source owner does not endorse this adaptation.`;
  const files = [
    { path: 'l1/ilostat-occ.json', src: ['ilostat'], url: [URLS.iloOcu], schema: 'l1-ilostat-occ.schema.json',
      transform: 'pipeline/l1.mjs: ILOSTAT EMP_TEMP by sex × occupation (ISCO-08 major groups, ISCO-88 where -08 missing), thousands → share of total employment of known occupation per (sex, major 0–9); one observation per decade anchor (nearest year ±5)',
      body: { attribution: attr(ilo), note: 'M[i]/F[i] = share of total employment in ISCO major group i (0 = armed forces) held by men/women; y = observation year; cls = classification', data: occ } },
    { path: 'l1/ilostat-informality.json', src: ['ilostat'], url: [URLS.iloInf], schema: 'l1-ilostat-inf.schema.json',
      transform: 'pipeline/l1.mjs: ILOSTAT EMP_NIFL informal employment rate by sex, % → proportion; one observation per decade anchor (±5 y) plus the latest year',
      body: { attribution: attr(ilo), note: 'T/M/F = informal employment rate (proportion) total/men/women; y = observation year', data: inf } },
    { path: 'l1/pag2025.json', src: ['oecd-pag'], url: [URLS.pag], schema: 'l1-pag.schema.json',
      transform: `pipeline/l1.mjs: OECD PaG (DF_PAG) latest year per measure × sex; kept only OECD pension-model outputs ${Object.keys(PAG_KEEP).join(', ')} (mandatory schemes, % → proportion); dropped third-party-derived measures ${dropped.join(', ')}`,
      body: { attribution: attr(pagS) + ' OECD disclaimer: this is an adaptation of an original work by the OECD; opinions and arguments expressed in the adaptation should not be reported as representing the official views of the OECD or of its Member countries.', keep: PAG_KEEP, dropped, data: pag } },
    { path: 'sa/uis-tertiary.json', src: ['uis'], url: [URLS.uis], schema: 'l1-uis.schema.json',
      transform: 'pipeline/l1.mjs: UIS GER.5T8 gross tertiary enrolment ratio, % → proportion; one observation per decade anchor (±5 y). Share-alike: this file only, CC BY-SA 4.0',
      body: { licence: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). This file — and only this file — is licensed CC BY-SA 4.0 because it is derived from UNESCO UIS data; it is not covered by the project licence.', attribution: `Source: UNESCO Institute for Statistics (UIS), ${uisS.url}, retrieved ${uisS.retrieved}. Adapted (rounded, % → proportion, decade sampling).`, data: uis } },
  ];
  rmSync(join(OUT, 'l1'), { recursive: true, force: true }); rmSync(join(OUT, 'sa'), { recursive: true, force: true });
  const mpath = join(OUT, 'manifest.json'); const man = JSON.parse(readFileSync(mpath, 'utf8'));
  man.files = man.files.filter((f) => !f.path.startsWith('l1/') && !f.path.startsWith('sa/'));
  for (const f of man.files) if (!f.transform) { const t = TRANSFORM.find(([re]) => re.test(f.path)); if (t) f.transform = t[1]; }
  for (const f of files) {
    const buf = Buffer.from(JSON.stringify(f.body)); const p = join(OUT, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf);
    man.files.push({ path: f.path, sha256: sha(buf), src: f.src, license: f.src.map((id) => R(id).license.id), retrieved: L1_RETRIEVED, url: f.url, schema: f.schema, transform: f.transform, rows: Object.keys(f.body.data).length });
  }
  for (const id of ['ilostat', 'uis', 'oecd-pag']) { man.sources = man.sources.filter((s) => s.id !== id); man.sources.push(R(id)); }
  writeFileSync(mpath, JSON.stringify(man, null, 1));
  console.log(`l1: ILOSTAT occ ${Object.keys(occ).length} countries, informality ${Object.keys(inf).length}, PaG ${Object.keys(pag).length}, UIS ${Object.keys(uis).length}; PaG dropped ${dropped.length} measures`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
