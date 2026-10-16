// C0 calibration helper: realised working-age mix per income group vs GROUP_TARGET → suggested GROUP_ADJ.
// Run: npx vitest run -c tools/c0/vitest.config.ts
import { it } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife } from '../../src/engine/life/sim.ts';
import { GROUP_TARGET, GROUP_ADJ, ENTRY_GROUPS } from '../../src/engine/life/occupation.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
import { writeFileSync } from 'node:fs';
it('calibrate', () => {
  const data = loadBundleFromDisk();
  const cnt: Record<string, Record<string, number>> = {}; const incOn: Record<string, number> = {}, incOff: Record<string, number> = {};
  const cases: [string, number][] = [['IND', 1960], ['IND', 1975], ['IND', 1990], ['NGA', 1970], ['NGA', 1990], ['BRA', 1960], ['BRA', 1980], ['TWN', 1950], ['TWN', 1965], ['TWN', 1985], ['USA', 1960], ['USA', 1985], ['DEU', 1970], ['KOR', 1960], ['KOR', 1985], ['CHN', 1970], ['CHN', 1990], ['ETH', 1980], ['MEX', 1975], ['IDN', 1975]];
  for (const [iso, y] of cases) for (let i = 0; i < 150; i++) {
    const mk = (occ: boolean) => runLife(data, { seed: `cal-${iso}-${y}-${i}`, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, registry) as LifeState;
    const s = mk(true); const s0 = mk(false);
    const ig = s.flags.occIg as string | undefined; if (!ig || typeof s.flags.occYears !== 'string') continue;
    incOn[ig] = (incOn[ig] ?? 0) + s.years.reduce((a, r) => a + r.income, 0); incOff[ig] = (incOff[ig] ?? 0) + s0.years.reduce((a, r) => a + r.income, 0);
    for (const [a, g] of Object.entries(JSON.parse(s.flags.occYears) as Record<string, string>)) { if (+a < 25 || +a > 64) continue; (cnt[ig] ??= {})[g] = (cnt[ig]![g] ?? 0) + 1; }
  }
  const out: Record<string, Record<string, number>> = {};
  for (const ig of Object.keys(GROUP_TARGET) as (keyof typeof GROUP_TARGET)[]) {
    const c = cnt[ig] ?? {}; const tot = Object.values(c).reduce((a, b) => a + b, 0);
    out[ig] = Object.fromEntries(ENTRY_GROUPS.map((g) => { const obs = tot ? (c[g] ?? 0) / tot : 0; const adj = GROUP_ADJ[ig][g]! * (obs > 0 ? Math.min(10, Math.max(0.1, GROUP_TARGET[ig][g]! / obs)) : 2); return [g, +adj.toFixed(3)]; }));
    out[ig + '_inc'] = { ratio: +((incOn[ig] ?? 1) / (incOff[ig] ?? 1)).toFixed(4) };
    out[ig + '_obs'] = Object.fromEntries(ENTRY_GROUPS.map((g) => [g, tot ? +((c[g] ?? 0) / tot).toFixed(3) : 0])); out[ig + '_n'] = { n: tot };
  }
  writeFileSync('c0-adj.json', JSON.stringify(out, null, 1));
}, 3_600_000);
