// Focus-strategy Monte Carlo. Usage: MC_N=400 MC_LABEL=current npx vitest run --dir scripts scripts/focus-mc.test.ts
import { loadBundleFromDisk } from '../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../src/engine/life/sim.ts';
import { contentEvents as registry } from '../src/engine/content/registry.ts';
import { FOCUS_FROM } from '../src/engine/life/focus.ts';
import type { LifeState, Action } from '../src/engine/life/state.ts';

import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
// v0.10.0: N=400 per cell (CEO decision; N=200 medians were too noisy for NGA)
const N = Number(process.env.MC_N ?? 400); const label = process.env.MC_LABEL ?? 'current';
it('focus MC', () => {
const data = loadBundleFromDisk();
const COUNTRIES = (process.env.MC_COUNTRIES ? process.env.MC_COUNTRIES.split(',') : ['TWN', 'USA', 'IND']) as readonly string[];
// one recorded focus at age 6, persisting all life; mapToStage moves chips the stage lacks to the nearest chip
const STRATS: Record<string, Action[] | 'auto'> = {
  work: [{ t: 'focus', age: FOCUS_FROM, w: { work: 1 } }],
  family: [{ t: 'focus', age: FOCUS_FROM, w: { family: 1 } }],
  learn: [{ t: 'focus', age: FOCUS_FROM, w: { learn: 1 } }],
  health: [{ t: 'focus', age: FOCUS_FROM, w: { health: 1 } }],
  balance: [{ t: 'focus', age: FOCUS_FROM, w: { balance: 1 } }], // v0.8.1 single-select: the balance chip alone
  auto: 'auto',
};
const cfg = (seed: string, iso: string, autoFocus: boolean): LifeConfig => ({ seed, era: { kind: 'past', year: 1990 }, nowYear: 2026, engineVersion: 'mc', autoSpend: true, ...(process.env.MC_OCC ? { occ: true } : {}), ...(autoFocus ? { autoFocus } : {}),
  constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo]! + (s[Math.ceil(i)]! - s[lo]!) * (i - lo); };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const out: Record<string, Record<string, Record<string, number>>> = {};
for (const iso of COUNTRIES) {
  out[iso] = {};
  for (const [name, st] of Object.entries(STRATS)) {
    const lives = Array.from({ length: N }, (_, i) => runLife(data, cfg(`fmc-${i}`, iso, st === 'auto'), registry, st === 'auto' ? [] : st) as LifeState);
    const inc = lives.map((s) => s.years.reduce((a, y) => a + y.income, 0));
    const nw = lives.map((s) => s.years.at(-1)!.netWorth);
    out[iso][name] = {
      incP10: q(inc, 0.1), incMed: q(inc, 0.5), incP90: q(inc, 0.9), incMean: mean(inc),
      nwP10: q(nw, 0.1), nwMed: q(nw, 0.5), nwP90: q(nw, 0.9), nwMean: mean(nw),
      life: mean(lives.map((s) => s.death!.age)), health: mean(lives.map((s) => s.stats.health)),
      married: mean(lives.map((s) => (s.events.some((e) => e.id === 'ch_marry_marry') || s.family.spouse ? 1 : 0))),
      kids: mean(lives.map((s) => s.family.children.length)),
      promos: mean(lives.map((s) => s.career.promotions)),
      inc2534: mean(lives.map((s) => s.years.filter((y) => y.age >= 25 && y.age <= 34).reduce((a, y) => a + y.income, 0))),
      inc4554: mean(lives.map((s) => s.years.filter((y) => y.age >= 45 && y.age <= 54).reduce((a, y) => a + y.income, 0))),
      divorced: mean(lives.map((s) => (s.events.some((e) => e.id === 'divorce') ? 1 : 0))),
    };
  }
}
const k = (v: number) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1e3).toFixed(0) + 'k');
let md = `### ${label} (N=${N}/cell, born 1990, seeds fmc-0..${N - 1})\n\n| Country | Strategy | Income P10 | Income median | Income P90 | Net worth P10 | Net worth median | Net worth P90 | Mean lifespan | Mean final health | Ever married | Mean children | Mean promotions |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const iso of COUNTRIES) for (const [n, r] of Object.entries(out[iso]!)) md += `| ${iso} | ${n} | ${k(r.incP10!)} | ${k(r.incMed!)} | ${k(r.incP90!)} | ${k(r.nwP10!)} | ${k(r.nwMed!)} | ${k(r.nwP90!)} | ${r.life!.toFixed(1)} | ${r.health!.toFixed(1)} | ${(100 * r.married!).toFixed(0)}% | ${r.kids!.toFixed(2)} | ${r.promos!.toFixed(2)} |\n`;
md += `\n| Country | Work vs family median lifetime income | Work vs family mean income |\n|---|---|---|\n`;
for (const iso of COUNTRIES) { const w = out[iso]!.work!, f = out[iso]!.family!; md += `| ${iso} | ${(100 * (w.incMed! / f.incMed! - 1)).toFixed(1)}% | ${(100 * (w.incMean! / f.incMean! - 1)).toFixed(1)}% |\n`; }
md += `\n| Country | learn/work income age 25–34 | learn/work income age 45–54 | divorce share work / family |\n|---|---|---|---|\n`;
for (const iso of COUNTRIES) { const w = out[iso]!.work!, l = out[iso]!.learn!, f = out[iso]!.family!; md += `| ${iso} | ${(l.inc2534! / w.inc2534!).toFixed(3)} | ${(l.inc4554! / w.inc4554!).toFixed(3)} | ${(100 * w.divorced!).toFixed(0)}% / ${(100 * f.divorced!).toFixed(0)}% |\n`; }
writeFileSync(process.env.MC_OUT ?? 'focus-mc-' + label + '.md', md); writeFileSync((process.env.MC_OUT ?? 'focus-mc-' + label) + '.json', JSON.stringify(out, null, 1));
}, 3_600_000);
