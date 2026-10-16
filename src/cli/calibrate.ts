// CLI: pnpm calibrate [--n 100000]  → docs/calibration-report.md
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../engine/data/nodeLoader.ts';
import { calibrate } from '../engine/calibrate.ts';
import { CAL_TARGETS } from '../engine/calTargets.ts';

const nArg = process.argv.indexOf('--n');
const n = nArg > 0 ? Number(process.argv[nArg + 1]) : 100000;
const data = loadBundleFromDisk();
const rows = CAL_TARGETS.map(([iso, y]) => calibrate(data, iso, y, n));
const pct = (x: number) => (x * 100).toFixed(2) + '%';
const lines = [
  `# 校準報告：e0 / u5 vs UN WPP 2024（N=${n.toLocaleString('en')} 每組）`, '',
  '自動產生：`pnpm calibrate`。模擬：同國同年出生、依 WPP SRB 抽性別、使用出生年的期間生命表（abridged → 單歲機率），死亡時點於年內均勻（0 歲用 WPP ax0）。',
  'e0 目標 = WPP `LEx`（兩性）；u5 目標 = WPP `Q5`/1000。驗收：e0 相對誤差 < 2%；u5 相對誤差 < 2%，或當 2% 低於抽樣解析度時 < 3·SE。', '',
  '| 國 | 年 | e0 模擬 | e0 WPP | 誤差 | u5 模擬 | u5 WPP | 誤差 | u5 3·SE | 結果 |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.iso} | ${r.year} | ${r.e0Sim.toFixed(2)} | ${r.e0Wpp.toFixed(2)} | ${pct(r.e0Err)} | ${r.u5Sim.toFixed(5)} | ${r.u5Wpp.toFixed(5)} | ${pct(r.u5Err)} | ${(3 * r.u5Se).toFixed(5)} | ${r.pass ? 'PASS' : 'FAIL'} |`),
  '', `總結：${rows.filter((r) => r.pass).length}/${rows.length} PASS；|e0 誤差| 最大 ${pct(Math.max(...rows.map((r) => Math.abs(r.e0Err))))}。`,
];
writeFileSync('docs/calibration-report.md', lines.join('\n') + '\n');
console.log(lines.slice(5).join('\n'));
if (rows.some((r) => !r.pass)) process.exit(1);
