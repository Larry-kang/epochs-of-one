// v0.11.1: merge hand-written en/ja/ko content translations (tools/l3/tr/*.psv: section|key|en|ja|ko; "=" keeps the existing cell)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const P = 'src/content/i18n/table.json';
const tab = JSON.parse(readFileSync(P, 'utf8'));
let n = 0;
for (const f of readdirSync('tools/l3/tr').filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of readFileSync('tools/l3/tr/' + f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const [sec, key, en, ja, ko] = line.split('|');
    const row = tab.strings[sec]?.[key];
    if (!row || ko === undefined) throw new Error(`${f}: bad row ${line.slice(0, 80)}`);
    const ph = (x) => [...new Set(x.match(/\{\w+\}/g) ?? [])].sort().join();
    for (const v of [en, ja, ko]) if (v !== '=' && ph(v) !== ph(row[0])) throw new Error(`${f}: placeholders differ in ${key}: ${v}`);
    if (/[|]/.test(row[0])) throw new Error('pipe in zh ' + key);
    [en, ja, ko].forEach((v, i) => { if (v !== '=') row[i + 1] = v.trim(); });
    n++;
  }
}
writeFileSync(P, JSON.stringify(tab, null, 2).replace(/^ +/gm, '') + '\n');
console.log('merged', n);
