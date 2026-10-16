// C0 pooled multi-seed guardrail (shared by tests/unit/c0-guardrail-<iso>.test.ts; one file per country so vitest runs them in parallel).
// SETS independent seed sets × N lives, occupations on vs off (same seed): set 0 = c0-<ISO>-<i>, set j = c0s<j>-<ISO>-<i>, i.e. the
// first SETS of the 20 sets in tools/c0/multiseed.test.ts. The MEAN of the per-set ratios must be within the band:
// lifetime income ±8%, net worth ±20%, e0 ±1%; under-5 deaths identical; occupation mix within ±5 pts of the 推估 structure POOLED over the same SETS seed sets (CEO decision, v0.10.0 / L1:
// replaces the set-0-only check; same ±5-pt band, not loosened). Set-0 mix is still logged for comparison.
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { GROUP_TARGET, ENTRY_GROUPS } from '../../src/engine/life/occupation.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';

export const GUARD_N = 200, GUARD_SETS = 8;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const cfg = (seed: string, iso: string, year: number, occ: boolean): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}),
  constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });

export function guardrail(iso: string, years: number[] = [1970, 1990], N = GUARD_N, SETS = GUARD_SETS): void {
  const data = loadBundleFromDisk();
  describe(`C0 guardrails ${iso} (pooled, ${SETS} seed sets × N=${N})`, () => {
    for (const year of years) {
      it(`${iso} ${year}: mean income ratio ±8%, net worth ±20%, e0 ±1%, under-5 deaths identical, mix ±5 pts pooled`, () => {
        const rInc: number[] = [], rNw: number[] = [], rE0: number[] = [];
        const cnt: Record<string, number> = {}; let tot = 0; const want: Record<string, number> = {}; // mix: set 0 (as before rc4)
        const pc: Record<string, number> = {}; let ptot = 0; const pw: Record<string, number> = {}; // mix pooled over all sets (reported)
        const inc = (a: LifeState[]) => mean(a.map((s) => s.years.reduce((x, y) => x + y.income, 0)));
        const nw = (a: LifeState[]) => mean(a.map((s) => s.years.at(-1)!.netWorth));
        const e0 = (a: LifeState[]) => mean(a.map((s) => s.death!.age + s.death!.frac));
        for (let j = 0; j < SETS; j++) {
          const sd = (i: number) => (j === 0 ? `c0-${iso}-${i}` : `c0s${j}-${iso}-${i}`);
          const off = Array.from({ length: N }, (_, i) => runLife(data, cfg(sd(i), iso, year, false), registry) as LifeState);
          const on = Array.from({ length: N }, (_, i) => runLife(data, cfg(sd(i), iso, year, true), registry) as LifeState);
          rInc.push(inc(on) / inc(off)); rNw.push(nw(on) / nw(off)); rE0.push(e0(on) / e0(off));
          on.forEach((s, i) => { if (s.death!.age < 5 || off[i]!.death!.age < 5) expect(s.death!.age).toBe(off[i]!.death!.age); });
          for (const s of on) for (const [a, g] of Object.entries((s.flags.occYears as string | undefined) ? JSON.parse(s.flags.occYears as string) as Record<string, string> : {})) {
            if (Number(a) < 25 || Number(a) > 64 || !ENTRY_GROUPS.includes(g as never)) continue;
            const tg = GROUP_TARGET[(s.flags.occIg as 'L') ?? 'H'];
            pc[g] = (pc[g] ?? 0) + 1; ptot++; for (const h of ENTRY_GROUPS) pw[h] = (pw[h] ?? 0) + tg[h]!;
            if (j === 0) { cnt[g] = (cnt[g] ?? 0) + 1; tot++; for (const h of ENTRY_GROUPS) want[h] = (want[h] ?? 0) + tg[h]!; } }
        }
        const mInc = mean(rInc), mNw = mean(rNw), mE0 = mean(rE0);
        const mix = Object.fromEntries(ENTRY_GROUPS.map((g) => [g, +(((cnt[g] ?? 0) - want[g]!) / tot).toFixed(3)]));
        const pmix = Object.fromEntries(ENTRY_GROUPS.map((g) => [g, +(((pc[g] ?? 0) - pw[g]!) / ptot).toFixed(3)]));
        const line = JSON.stringify({ iso, year, inc: +mInc.toFixed(4), sets: rInc.map((x) => +x.toFixed(3)), nw: +mNw.toFixed(3), e0: +mE0.toFixed(4), mixSet0: mix, mixPooled: pmix });
        console.log(line); if (process.env.C0GUARD_OUT) appendFileSync(process.env.C0GUARD_OUT, line + '\n');
        expect(mInc).toBeGreaterThan(0.92); expect(mInc).toBeLessThan(1.08);
        expect(mNw).toBeGreaterThan(0.8); expect(mNw).toBeLessThan(1.2);
        expect(Math.abs(mE0 - 1)).toBeLessThan(0.01);
        for (const g of ENTRY_GROUPS) expect(Math.abs(pmix[g]!), `${iso} ${year} ${g} (pooled ${SETS} sets)`).toBeLessThan(0.05);
      }, 900_000); // CI runners are ~2–4× slower than the dev box; one cell is ≈ 70 s locally
    }
  });
}
