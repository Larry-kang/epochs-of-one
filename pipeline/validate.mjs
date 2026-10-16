// Validate public/data against JSON Schemas (2020-12, Ajv) + sha256 integrity.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export function makeAjv(root) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTuples: false });
  for (const s of ['series', 'manifest', 'countries', 'demography-country', 'annual-closes', 'markets', 'housing-pension', 'wpp-extra', 'l1-ilostat-occ', 'l1-ilostat-inf', 'l1-pag', 'l1-uis']) {
    ajv.addSchema(JSON.parse(readFileSync(join(root, 'schemas', `${s}.schema.json`), 'utf8')));
  }
  return ajv;
}

export function validateData(root) {
  const ajv = makeAjv(root);
  const errors = [];
  const dataDir = join(root, 'public/data');
  const mpath = join(dataDir, 'manifest.json');
  if (!existsSync(mpath)) return { ok: false, errors: ['manifest.json missing'], n: 0 };
  const manifest = JSON.parse(readFileSync(mpath, 'utf8'));
  if (!ajv.validate('manifest.schema.json', manifest)) errors.push('manifest: ' + ajv.errorsText());
  for (const f of manifest.files) {
    const p = join(dataDir, f.path);
    if (!existsSync(p)) { errors.push(`${f.path}: missing`); continue; }
    const buf = readFileSync(p);
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== f.sha256) errors.push(`${f.path}: sha256 mismatch`);
    const doc = JSON.parse(buf.toString('utf8'));
    if (!ajv.validate(f.schema, doc)) errors.push(`${f.path}: ${ajv.errorsText()}`);
  }
  return { ok: errors.length === 0, errors, n: manifest.files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const r = validateData(root);
  if (!r.ok) { console.error('SCHEMA VALIDATION FAILED:\n  ' + r.errors.slice(0, 50).join('\n  ')); process.exit(1); }
  console.log(`validate: PASS (${r.n} files)`);
}
