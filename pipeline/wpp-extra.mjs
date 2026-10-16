// WPP 2024 extra layer (batch 2): period TFR (fertility calibration) and e0 / under-5 mortality (home odds table),
// one small file so the home page does not need the 237 per-country demography files.
// Source: data-raw/wpp/di.csv.gz (UN WPP 2024 demographic indicators, estimates + medium variant), CC BY 3.0 IGO.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGzCsv } from './lib/csv.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const FROM = 1950, TO = 2060;
const out = { note: 'UN DESA Population Division, World Population Prospects 2024 (estimates to 2023, medium variant after). CC BY 3.0 IGO.', from: FROM, tfr: {}, e0: {}, q5: {} };
const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
for await (const r of readGzCsv(join(ROOT, 'data-raw/wpp/di.csv.gz'))) {
  if (r.LocTypeID !== '4' || !r.ISO3_code) continue;
  if (r.Variant && r.Variant !== 'Medium') continue;
  const y = Number(r.Time); if (y < FROM || y > TO) continue;
  const iso = r.ISO3_code, i = y - FROM;
  for (const [k, v] of [['tfr', r2(Number(r.TFR))], ['e0', r1(Number(r.LEx))], ['q5', r1(Number(r.Q5))]]) { (out[k][iso] ??= [])[i] = v; }
}
for (const k of ['tfr', 'e0', 'q5']) for (const [iso, v] of Object.entries(out[k])) if (v.length !== TO - FROM + 1 || v.some((x) => x == null || !Number.isFinite(x))) throw new Error(`${k} ${iso} incomplete`);
const buf = Buffer.from(JSON.stringify(out));
writeFileSync(join(ROOT, 'public/data/wpp-extra.json'), buf);
const mp = join(ROOT, 'public/data/manifest.json');
const m = JSON.parse(readFileSync(mp, 'utf8'));
const src = m.sources.find((s) => s.id === 'wpp2024');
const entry = { path: 'wpp-extra.json', sha256: createHash('sha256').update(buf).digest('hex'), src: ['wpp2024'], license: [src.license.id], retrieved: src.retrieved, url: [src.url], schema: 'wpp-extra.schema.json', rows: Object.keys(out.tfr).length };
m.files = m.files.filter((f) => f.path !== entry.path).concat(entry);
writeFileSync(mp, JSON.stringify(m, null, 1) + '\n');
console.log(`wpp-extra: ${entry.rows} countries, ${buf.length} bytes`);
