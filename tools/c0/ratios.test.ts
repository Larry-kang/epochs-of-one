// C0 diagnostic: lifetime income / net worth ratio (occ on vs off) and working-age mix for TWN/USA/IND/NGA × 1970/1990.
// Run: npx vitest run -c tools/c0/vitest.config.ts tools/c0/ratios.test.ts  → c0-ratios.json
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife } from '../../src/engine/life/sim.ts';
import { ENTRY_GROUPS, COUNTRY_K } from '../../src/engine/life/occupation.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
it('ratios', () => {
  const data = loadBundleFromDisk(); const out: Record<string, unknown> = {};
  const N = Number(process.env.C0N ?? 200);
  const kOn: Record<string, number> = {}, kOff: Record<string, number> = {};
  const cases: [string, number][] = (process.env.C0FIT ? [['IND', 1960], ['IND', 1975], ['IND', 1990], ['NGA', 1970], ['NGA', 1990], ['BRA', 1960], ['BRA', 1980], ['TWN', 1950], ['TWN', 1965], ['TWN', 1985], ['USA', 1960], ['USA', 1985], ['DEU', 1970], ['KOR', 1960], ['KOR', 1985], ['CHN', 1970], ['CHN', 1990], ['ETH', 1980], ['MEX', 1975], ['IDN', 1975]] as [string, number][] : []);
  for (const iso of ['TWN', 'USA', 'IND', 'NGA']) for (const y of [1970, 1990]) cases.push([iso, y]);
  for (const [iso, y] of cases) {
    const mk = (i: number, occ: boolean) => runLife(data, { seed: `c0-${iso}-${i}`, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, registry) as LifeState;
    const on = Array.from({ length: N }, (_, i) => mk(i, true)), off = Array.from({ length: N }, (_, i) => mk(i, false));
    const m = (a: number[]) => a.reduce((x, z) => x + z, 0) / a.length;
    const inc = (a: LifeState[]) => m(a.map((s) => s.years.reduce((x, r) => x + r.income, 0)));
    const nw = (a: LifeState[]) => m(a.map((s) => s.years.at(-1)!.netWorth));
    const e0 = (a: LifeState[]) => m(a.map((s) => s.death!.age + s.death!.frac));
    on.forEach((s, i) => { const k = iso; void s.flags.occIg; kOn[k] = (kOn[k] ?? 0) + s.years.reduce((x, r) => x + r.income, 0); kOff[k] = (kOff[k] ?? 0) + off[i]!.years.reduce((x, r) => x + r.income, 0); });
    const cnt: Record<string, number> = {}; let tot = 0;
    for (const s of on) for (const [a, g] of Object.entries(typeof s.flags.occYears === 'string' ? JSON.parse(s.flags.occYears) as Record<string, string> : {})) { if (+a < 25 || +a > 64 || !ENTRY_GROUPS.includes(g as never)) continue; cnt[g] = (cnt[g] ?? 0) + 1; tot++; }
    out[`${iso}${y}`] = { inc: +(inc(on) / inc(off)).toFixed(3), nw: +(nw(on) / nw(off)).toFixed(3), e0: +(e0(on) / e0(off)).toFixed(4), ig: on[0]!.flags.occIg, mix: Object.fromEntries(ENTRY_GROUPS.map((g) => [g, +((cnt[g] ?? 0) / Math.max(1, tot)).toFixed(3)])) };
  }
  writeFileSync('c0-k.json', JSON.stringify(Object.fromEntries(Object.keys(kOn).filter((k) => !k.endsWith('undefined')).map((k) => [k, +((COUNTRY_K[k] ?? 1) * kOn[k]! / kOff[k]!).toFixed(4)]))));
  writeFileSync('c0-ratios.json', JSON.stringify(out));
}, 3_600_000);
