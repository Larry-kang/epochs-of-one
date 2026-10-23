// L2/L3 (v0.11.0): conscription terms and T1 wave-A institutions (TW/US/JP/KR) as cited law facts.
// Inputs: pipeline/l2/conscription.src.json, pipeline/l2/institutions.src.json (hand-compiled parameters; every row cites a
// statute or official notice — no text is copied; non-statutory values are flagged est = 推估).
// Output: public/data/l2/conscription.json, public/data/l2/institutions.json + manifest entries (licence L-facts).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT = join(ROOT, 'public/data');
export const L2_RETRIEVED = '2026-10-17';
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** validation: rows sorted, months ≥ 0, p ∈ [0,1], any p < 1 flagged est, sources registered */
export function checkConscription(src) {
  const errs = [];
  for (const [iso, r] of Object.entries(src.regimes)) {
    if (!r.src?.length) errs.push(`${iso}: no source`);
    if (!(r.age >= 16 && r.maxAge >= r.age)) errs.push(`${iso}: bad ages`);
    let prev = -Infinity;
    for (const t of r.terms) {
      if (t.from < prev) errs.push(`${iso}: rows not sorted`); prev = t.from;
      if (!(t.months >= 0 && t.months <= 48)) errs.push(`${iso} ${t.from}: months out of range`);
      if (!(t.p >= 0 && t.p <= 1)) errs.push(`${iso} ${t.from}: p out of range`);
      if (t.p > 0 && t.p < 1 && !t.est) errs.push(`${iso} ${t.from}: lottery/selective share must be flagged est (推估)`);
    }
  }
  return errs;
}

function main() {
  const sources = JSON.parse(readFileSync(join(ROOT, 'pipeline/sources.json'), 'utf8'));
  const R = (id) => { const s = sources.find((x) => x.id === id); if (!s) throw new Error('unregistered source ' + id); return s; };
  const cs = JSON.parse(readFileSync(join(ROOT, 'pipeline/l2/conscription.src.json'), 'utf8'));
  const inst = JSON.parse(readFileSync(join(ROOT, 'pipeline/l2/institutions.src.json'), 'utf8'));
  const errs = checkConscription(cs); if (errs.length) throw new Error('conscription table: ' + errs.join('; '));
  const csSrc = [...new Set(Object.values(cs.regimes).flatMap((r) => r.src))].sort();
  const inSrc = [...new Set(Object.values(inst.countries).flatMap((r) => r.src))].sort();
  const files = [
    { path: 'l2/conscription.json', src: csSrc, url: csSrc.map((id) => R(id).url), schema: 'l2-conscription.schema.json',
      transform: 'pipeline/l2.mjs: statutory conscription terms (months) by first service year and birth cohort, compiled by hand from the cited statutes/notices; call-up shares under lotteries, branch mix and conscript pay (share of mean wage) are design estimates flagged est (推估)',
      body: { note: 'Facts (terms, years) cited per country in `note`; est rows = 推估. Not a copy of any law text.', regimes: cs.regimes } },
    { path: 'l2/institutions.json', src: inSrc, url: inSrc.map((id) => R(id).url), schema: 'l2-institutions.schema.json',
      transform: 'pipeline/l2.mjs: T1 wave-A institutions (school system, exams, health insurance, pensions, labour features) by start year, compiled by hand from the cited statutes; names are our own wording',
      body: { note: 'Start years and scheme names are facts; wording is our own. Exam pass rates are 推估 (not shipped as data).', countries: inst.countries } },
  ];
  rmSync(join(OUT, 'l2'), { recursive: true, force: true });
  const mpath = join(OUT, 'manifest.json'); const man = JSON.parse(readFileSync(mpath, 'utf8'));
  man.files = man.files.filter((f) => !f.path.startsWith('l2/'));
  for (const f of files) {
    const buf = Buffer.from(JSON.stringify(f.body)); const p = join(OUT, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf);
    man.files.push({ path: f.path, sha256: sha(buf), src: f.src, license: [...new Set(f.src.map((id) => R(id).license.id))], retrieved: L2_RETRIEVED, url: f.url, schema: f.schema, transform: f.transform, rows: Object.keys(f.body.regimes ?? f.body.countries).length });
  }
  const used = new Set([...csSrc, ...inSrc]);
  man.sources = man.sources.filter((s) => !used.has(s.id)); for (const id of used) man.sources.push(R(id));
  writeFileSync(mpath, JSON.stringify(man, null, 1));
  console.log(`l2: conscription ${Object.keys(cs.regimes).length} countries, institutions ${Object.keys(inst.countries).length}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
