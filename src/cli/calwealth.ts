// CLI: pnpm calwealth [--n 400] → docs/calibration-wealth.md (simulated vs OECD WDD) + lifetime guard table.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../engine/data/nodeLoader.ts';
import { crossSection, lifetimeGuard } from '../engine/calWealth.ts';
import { PARAMS } from '../engine/params.ts';

const nArg = process.argv.indexOf('--n');
const n = nArg > 0 ? Number(process.argv[nArg + 1]) : 400;
const data = loadBundleFromDisk();
const T = JSON.parse(readFileSync('pipeline/calibration/wealth-targets.json', 'utf8')) as { targets: { iso: string; year: number; ratioPerAdult: number }[]; adultsPerHousehold: number };
const rows = T.targets.map((t) => { const c = crossSection(data, t.iso, t.year, n); return { ...t, sim: c.median, nObs: c.n, err: Math.log(c.median / t.ratioPerAdult) }; });
const guards = [['TWN', 1980], ['JPN', 1975], ['USA', 1970], ['IND', 1985], ['ETH', 1990], ['DEU', 1965]].map(([iso, y]) => lifetimeGuard(data, iso as string, y as number, n));
const f = (x: number, d = 2) => x.toFixed(d);
const gm = Math.exp(rows.reduce((a, r) => a + r.err, 0) / rows.length);
const lines = [
  `# 財富校準報告（自動產生：\`pnpm calwealth --n ${n}\`）`, '',
  '目標：OECD Wealth Distribution Database 家戶淨資產中位數 ÷ 每戶成年人數（' + T.adultsPerHousehold + '）÷ 同年人均 GDP（當期本國幣，WDI）。',
  '模擬：每國 ' + n + ' 段比較人生（同國、出生年依 WPP 出生數抽樣、無玩家操作），在調查年份仍存活且 ≥ 25 歲者的淨資產中位數 ÷ 同年人均 GDP（PPP 實質）。',
  '校準參數：`consBase` = ' + PARAMS.consBase.value + '（核心消費占可支配所得比例，於典型所得）。', '',
  '| 國 | 調查年 | OECD 目標（每成人，×人均GDP） | 模擬中位數 | 觀測數 | 比值 模擬/目標 |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.iso} | ${r.year} | ${f(r.ratioPerAdult)} | ${f(r.sim)} | ${r.nObs} | ${f(r.sim / r.ratioPerAdult)} |`),
  '', `幾何平均 模擬/目標 = ${f(gm, 3)}。`, '',
  '## 一生財富防呆（每國 ' + n + ' 段比較人生，限活到 18 歲以上者）', '',
  '定義：比值 = 死亡時淨資產 ÷ 一生稅前總收入。測試門檻：中位數 ≤ 1，且比值 > 3 的人生占比 ≤ 2%。', '',
  '| 國 | 出生年 | 成人數 | 中位數 | P90 | P99 | >3 占比 |', '|---|---|---|---|---|---|---|',
  ...guards.map((g) => `| ${g.iso} | ${g.year} | ${g.adults} | ${f(g.median)} | ${f(g.p90)} | ${f(g.p99)} | ${(g.over3 * 100).toFixed(1)}% |`),
];
writeFileSync('docs/calibration-wealth.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
