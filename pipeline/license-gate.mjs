// License gate : any data file whose source has
// license.class ∈ {nc, restricted, unknown} (or an unregistered source) fails the build.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = new Set(['open', 'attribution']);

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
export function licenseGate({ manifest, sources, dataDir }) {
  const errors = [];
  const reg = new Map(sources.map((s) => [s.id, s]));
  for (const ms of manifest.sources) {
    const r = reg.get(ms.id);
    if (!r) errors.push(`manifest source '${ms.id}' is not registered in pipeline/sources.json`);
    else if (r.license.class !== ms.license.class) errors.push(`source '${ms.id}': manifest class '${ms.license.class}' ≠ registry '${r.license.class}'`);
  }
  const lines = ['| file | src | license class | result |', '|---|---|---|---|'];
  for (const f of manifest.files) {
    for (const id of f.src) {
      const s = reg.get(id);
      const cls = s ? s.license.class : 'unregistered';
      const ok = !!s && ALLOWED.has(cls);
      if (!ok) errors.push(`${f.path}: source '${id}' has license class '${cls}' (blocked)`);
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
  });
  if (!res.ok) {
    console.error('LICENSE GATE FAILED:\n  ' + res.errors.join('\n  '));
    process.exit(1);
  }
  console.log(`license-gate: PASS (${res.checked} files, all sources ∈ {open, attribution})`);
}
