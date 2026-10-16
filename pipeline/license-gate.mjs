// License gate : any data file whose source has
// license.class ∈ {nc, restricted, unknown} (or an unregistered source) fails the build.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = new Set(['open', 'attribution']);
/** share-alike data may ship only in its own file under public/data/sa/ (UIS: CC BY-SA 4.0), never mixed with other sources */
export const SA_CLASS = 'share-alike', SA_DIR = 'sa/';
/** licence ids allowed in shipped data (localization-plan build gate + already-shipped WPP CC BY 3.0 IGO / OECD terms) */
export const LICENCE_ALLOW = new Set(['CC-BY-4.0', 'CC-BY-3.0-IGO', 'CC-BY-SA-4.0', 'OGDL-TW-1.0', 'JP-PDL-1.0', 'DL-DE-BY-2.0', 'OGL-UK-3.0',
  'Licence-Ouverte-2.0', 'KOGL-1', 'US-PD', 'L-facts', 'self-compiled facts', 'OECD-terms-data (attribution; CC BY 4.0 open-by-default)']);
/** World Bank indicators must carry the catalog licence CC BY 4.0 (metadata field License_Type) */
export const WB_OK = new Set(['CC BY-4.0', 'CC BY 4.0', 'CC-BY-4.0']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** @returns {{ok: boolean, errors: string[], checked: number, report: string}} */
export function licenseGate({ manifest, sources, dataDir, wdi }) {
  const errors = [];
  if (wdi) for (const [code, m] of Object.entries(wdi.indicators ?? {})) if (!WB_OK.has(m.license)) errors.push(`WDI ${code}: World Bank licence '${m.license}' is not CC BY 4.0 (blocked)`);
  const reg = new Map(sources.map((s) => [s.id, s]));
  for (const ms of manifest.sources) {
    const r = reg.get(ms.id);
    if (!r) errors.push(`manifest source '${ms.id}' is not registered in pipeline/sources.json`);
    else if (r.license.class !== ms.license.class) errors.push(`source '${ms.id}': manifest class '${ms.license.class}' ≠ registry '${r.license.class}'`);
  }
  const lines = ['| file | src | license class | result |', '|---|---|---|---|'];
  for (const f of manifest.files) {
    // provenance: every dataset needs source, URL, licence, retrieval date and transform
    if (!f.src?.length) errors.push(`${f.path}: no source`);
    if (!f.url?.length || f.url.some((u) => !/^https:\/\//.test(u))) errors.push(`${f.path}: missing/invalid source URL`);
    if (!DATE.test(f.retrieved ?? '')) errors.push(`${f.path}: missing retrieval date`);
    if (!f.transform || f.transform.length < 10) errors.push(`${f.path}: missing transform`);
    if (!f.license?.length) errors.push(`${f.path}: missing licence`);
    const inSa = f.path.startsWith(SA_DIR);
    for (const id of f.src ?? []) {
      const s = reg.get(id);
      const cls = s ? s.license.class : 'unregistered';
      let ok = !!s && (ALLOWED.has(cls) || (cls === SA_CLASS && inSa && f.src.length === 1));
      if (s && !LICENCE_ALLOW.has(s.license.id)) { ok = false; errors.push(`${f.path}: source '${id}' licence '${s.license.id}' is not on the allowlist`); }
      if (s && !(f.license ?? []).includes(s.license.id)) { ok = false; errors.push(`${f.path}: manifest licence list does not name '${s.license.id}' for '${id}'`); }
      if (cls === SA_CLASS && !(inSa && f.src.length === 1)) errors.push(`${f.path}: share-alike source '${id}' must be alone in a file under ${SA_DIR}`);
      if (inSa && cls !== SA_CLASS) errors.push(`${f.path}: only share-alike data may live in ${SA_DIR}`);
      if (!ok && !(s && ALLOWED.has(cls)) && !(cls === SA_CLASS)) errors.push(`${f.path}: source '${id}' has license class '${cls}' (blocked)`);
      lines.push(`| ${f.path} | ${id} | ${cls} | ${ok ? 'PASS' : 'FAIL'} |`);
    }
  }
  if (dataDir && existsSync(dataDir)) {
    const listed = new Set(manifest.files.map((f) => f.path));
    for (const p of walk(dataDir)) {
      const rel = relative(dataDir, p).split('\\').join('/');
      if (rel === 'manifest.json') continue;
      if (!listed.has(rel)) errors.push(`${rel}: present in public/data but not traceable in manifest`);
    }
  }
  return { ok: errors.length === 0, errors, checked: manifest.files.length, report: lines.join('\n') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const dataDir = join(root, 'public/data');
  const mpath = join(dataDir, 'manifest.json');
  if (!existsSync(mpath)) {
    console.error('license-gate: public/data/manifest.json missing — run `pnpm data`');
    process.exit(1);
  }
  const res = licenseGate({
    manifest: JSON.parse(readFileSync(mpath, 'utf8')),
    sources: JSON.parse(readFileSync(join(root, 'pipeline/sources.json'), 'utf8')),
    dataDir,
    wdi: JSON.parse(readFileSync(join(root, 'pipeline/l1/wdi-licences.json'), 'utf8')),
  });
  if (!res.ok) {
    console.error('LICENSE GATE FAILED:\n  ' + res.errors.join('\n  '));
    process.exit(1);
  }
  console.log(`license-gate: PASS (${res.checked} files, sources ∈ {open, attribution, share-alike in sa/ only}; licences on the allowlist; provenance complete; WDI indicators CC BY 4.0)`);
}
