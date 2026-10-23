// v0.11.1: build src/content/l3-person-names.json from tools/l3/person-names.tsv (en/ja/ko renderings of every
// zh-TW name in src/engine/content/names.ts). Display only — the engine keeps the zh-TW strings it always drew.
import { readFileSync, writeFileSync } from 'node:fs';
const out = {};
for (const line of readFileSync('tools/l3/person-names.tsv', 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [region, zh, en, ja, ko] = line.split('\t');
  if (!ko) throw new Error('bad row: ' + line);
  (out[region] ??= {})[zh] = [en, ja, ko];
}
writeFileSync('src/content/l3-person-names.json', JSON.stringify(out) + '\n');
console.log('l3-person-names:', Object.values(out).reduce((a, r) => a + Object.keys(r).length, 0), 'tokens');
