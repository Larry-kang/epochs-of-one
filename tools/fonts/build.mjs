// Self-hosted OFL fonts, subset to the glyphs the app can show (offline SW precaches public/fonts).
// Usage: PYFTSUBSET=/path/to/pyftsubset FONT_SRC=/dir/with/ttfs node tools/fonts/build.mjs
// Sources + licences: licences/ASSETS.md. Re-run after adding UI/content text.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const PY = process.env.PYFTSUBSET ?? 'pyftsubset';
const SRC = process.env.FONT_SRC ?? '/tmp/fonts';
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
let text = '';
for (const f of [...walk('src').filter((p) => /\.(ts|json)$/.test(p)), 'index.html']) text += readFileSync(f, 'utf8');
const idx = JSON.parse(readFileSync('public/data/countries.json', 'utf8'));
const dn = new Intl.DisplayNames(['zh-Hant-TW', 'zh-Hant'], { type: 'region' });
for (const c of idx.countries) { try { text += dn.of(c.iso2) ?? ''; } catch { /* */ } text += c.name; }
for (let i = 0x20; i < 0x7f; i++) text += String.fromCharCode(i);
text += '·—–…「」『』（）、，。：；！？％＋−×÷←→↑↓▾▸★☆†✓…‧';
const chars = [...new Set([...text])].filter((ch) => ch.codePointAt(0) >= 0x20).join('');
writeFileSync('/tmp/fontchars.txt', chars);
console.log('glyph set', chars.length);
const jobs = [
  ['NotoSerifTC[wght].ttf', 'serif-tc.woff2', '--text-file=/tmp/fontchars.txt'],
  ['Fraunces-VariableFont_SOFT,WONK,opsz,wght.ttf', 'fraunces.woff2', '--unicodes=U+0020-007E,U+00B7,U+2013-2014,U+2190-2193'],
  ['Inter-VariableFont_opsz,wght.ttf', 'inter.woff2', '--unicodes=U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2026,U+2190-2193,U+2212'],
  ['JetBrainsMono-VariableFont_wght.ttf', 'mono.woff2', '--unicodes=U+0020-007E,U+00B7,U+2212,U+00D7'],
];
for (const [src, out, sel] of jobs) {
  execFileSync(PY, [join(SRC, src), sel, '--flavor=woff2', '--layout-features=*', `--output-file=public/fonts/${out}`], { stdio: 'inherit' });
  console.log(out, statSync(`public/fonts/${out}`).size);
}
