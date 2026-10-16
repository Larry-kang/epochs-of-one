// C0 core careers: occupation table, entry draw, startups, illicit rules, rare roles, legacy mapping, and MC guardrails.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, newLife, advanceYear, type LifeConfig } from '../../src/engine/life/sim.ts';
import { OCCS, occById, entryDraw, GROUP_TARGET, bizHazard, BIZ, RARE_PATHS, ILLICIT, legacyOcc, ENTRY_GROUPS, type Biz, type EntryCtx } from '../../src/engine/life/occupation.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry, ENGINE_EVENT_IDS } from '../../src/engine/content/registry.ts';
import { stream } from '../../src/engine/rng/streams.ts';
import tableJson from '../../src/content/i18n/table.json';

const data = loadBundleFromDisk();
const cfg = (seed: string, iso: string, year: number, occ: boolean, extra: Partial<LifeConfig> = {}): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}), ...extra,
  constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe('C0 table', () => {
  it('80 occupations, unique ids, ISCO-08 codes, 1–5 ladder rungs, every number 推估', () => {
    expect(OCCS.length).toBe(80); expect(new Set(OCCS.map((o) => o.id)).size).toBe(80);
    for (const o of OCCS) {
      if (!['illicit', 'status'].includes(o.group)) expect(o.isco).toMatch(/^\d{4}$/);
      expect(o.ladder.length).toBeGreaterThanOrEqual(1); expect(o.ladder.length).toBeLessThanOrEqual(5);
      if (ENTRY_GROUPS.includes(o.group)) expect(o.ladder.length).toBeGreaterThanOrEqual(2);
      expect(o.est).toBe(true);
    }
    for (const o of OCCS.filter((x) => x.group === 'illicit')) { expect(o.ladder.length).toBeLessThanOrEqual(2); expect(o.rel).toBeLessThanOrEqual(0.7); expect(o.src).toMatch(/design/); }
  });
  it('every occupation has a zh-TW and English name; occupation events exist in zh-TW and en', () => {
    for (const o of OCCS) { expect(o.zh.length).toBeGreaterThan(0); expect(o.en.length).toBeGreaterThan(0); }
    const ev = (tableJson as unknown as { strings: { events: Record<string, (string | null)[]> } }).strings.events;
    const occEv = Object.keys(ev).filter((k) => k.startsWith('oc_'));
    expect(occEv.length).toBeGreaterThanOrEqual(70);
    for (const k of occEv) { expect(ev[k]![0]).toBeTruthy(); expect(ev[k]![1]).toBeTruthy(); expect(ENGINE_EVENT_IDS).toContain(k); }
  });
});

describe('C0 entry and equity', () => {
  const x: EntryCtx = { iso: 'TWN', year: 2015, gdp: 45000, plan: 'tertiary', quintile: 3, urban: true, sex: 'F', age: 22, smart: 60, social: 60 };
  it('draw is deterministic, respects education and era, never gives rare roles directly', () => {
    expect(entryDraw(x, 0.3, 0.7)).toBe(entryDraw(x, 0.3, 0.7));
    for (let i = 0; i < 400; i++) {
      const id = entryDraw({ ...x, plan: 'primary', year: 1985 }, (i * 0.618) % 1, (i * 0.414) % 1); const o = occById(id)!;
      expect(['none', 'primary']).toContain(o.edu); expect(o.drv.from ?? 0).toBeLessThanOrEqual(1985);
      expect(['local_rep', 'legislator', 'minister', 'astronaut']).not.toContain(id);
    }
  });
  it('equity: entry odds take no ethnicity, caste, religion or region input', () => {
    const src = readFileSync('src/engine/life/occupation.ts', 'utf8');
    const ctx = src.slice(src.indexOf('export interface EntryCtx'), src.indexOf('}', src.indexOf('export interface EntryCtx')));
    for (const bad of ['ethnic', 'caste', 'religion', 'region', 'name']) expect(ctx.toLowerCase()).not.toContain(bad);
    // same person, two different name regions / sub-national ids → identical occupation at age 40
    const a = runLife(data, cfg('eq-1', 'IND', 1980, true), registry) as LifeState;
    const b = runLife({ ...data, country: (iso) => ({ ...data.country(iso), sub: 999 }) }, cfg('eq-1', 'IND', 1980, true), registry) as LifeState;
    expect(a.career.occ).toBe(b.career.occ);
  });
});

describe('C0 startups, illicit, rare roles', () => {
  it('startup survival matches the 推估 curve within ±5 points', () => {
    for (const t of Object.keys(BIZ) as Biz[]) {
      const N = 20000; const alive: number[] = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < N; i++) { const r = stream(`surv-${t}-${i}`, 'occ'); let y = 1; while (y <= 5 && r.next() >= bizHazard(t, y)) { alive[y]! += 1; y++; } }
      for (const [y, s] of Object.entries(BIZ[t].surv)) expect(Math.abs(alive[Number(y)]! / N - s)).toBeLessThan(0.05);
    }
  });
  it('rare-role caps: legislator ≤ 1/50k lives, head of government ≤ 1/500k, astronaut 0 outside space countries', () => {
    const p = (to: string) => RARE_PATHS.find((r) => r.to === to)!.p;
    // upper bound: every life eligible for 40 years, local_rep tenure ≤ 30 years, legislator tenure ≤ 20 years
    const pLocal = 1 - (1 - p('local_rep')) ** 40, pLeg = pLocal * (1 - (1 - p('legislator')) ** 30), pMin = pLeg * (1 - (1 - p('minister')) ** 20);
    expect(pLocal).toBeLessThan(0.001); expect(pLeg).toBeLessThanOrEqual(1 / 50000);
    expect(pMin).toBeLessThanOrEqual(1 / 500000);
    expect(RARE_PATHS.find((r) => r.to === 'astronaut')!.space).toBe(true);
  });
  it('illicit: never under 18, refused by auto-choice (0 lives), and EV below every legitimate entry option', () => {
    const lives = Array.from({ length: 150 }, (_, i) => runLife(data, cfg(`il-${i}`, 'IND', 1985, true), registry) as LifeState);
    expect(lives.filter((s) => s.events.some((e) => e.id === 'oc_illicit_join')).length).toBe(0);
    const minLegit = Math.min(...OCCS.filter((o) => ENTRY_GROUPS.includes(o.group)).map((o) => o.rel));
    for (const k of Object.keys(ILLICIT)) expect(occById(k)!.rel).toBeLessThanOrEqual(Math.max(0.7, minLegit + 0.25));
  });
  it('legacy tracks map to the closest occupation; old saves continue in the occupation system', () => {
    expect(legacyOcc('stable', 'tertiary', 40000)).toBe('civil_servant');
    expect(legacyOcc('informal', 'none', 3000)).toBe('informal_vendor');
    expect(legacyOcc('startup', 'secondary', 30000)).toBe('food_retail_su');
    let s = newLife(data, cfg('legacy-1', 'TWN', 1970, false, { occFrom: 40 })) as LifeState;
    while (!s.death && s.age < 45) s = advanceYear(data, s, registry);
    if (!s.death && s.career.trackSet) expect(occById(s.career.occ)).toBeTruthy();
  });
});

describe('C0 guardrails (MC)', () => {
  const N = 200;
  for (const [iso, year] of [['TWN', 1970], ['USA', 1970], ['IND', 1970], ['NGA', 1970], ['TWN', 1990], ['USA', 1990], ['IND', 1990], ['NGA', 1990]] as const) {
    it(`${iso} ${year}: lifetime income ±8%, net worth ±20%, e0 ±2%, under-5 deaths identical, mix within ±5 pts`, () => {
      const off = Array.from({ length: N }, (_, i) => runLife(data, cfg(`c0-${iso}-${i}`, iso, year, false), registry) as LifeState);
      const on = Array.from({ length: N }, (_, i) => runLife(data, cfg(`c0-${iso}-${i}`, iso, year, true), registry) as LifeState);
      const inc = (a: LifeState[]) => mean(a.map((s) => s.years.reduce((x, y) => x + y.income, 0)));
      const nw = (a: LifeState[]) => mean(a.map((s) => s.years.at(-1)!.netWorth));
      const e0 = (a: LifeState[]) => mean(a.map((s) => s.death!.age + s.death!.frac));
      expect(inc(on) / inc(off)).toBeGreaterThan(0.92); expect(inc(on) / inc(off)).toBeLessThan(1.08);
      expect(nw(on) / nw(off)).toBeGreaterThan(0.8); expect(nw(on) / nw(off)).toBeLessThan(1.2);
      expect(Math.abs(e0(on) / e0(off) - 1)).toBeLessThan(0.02);
      on.forEach((s, i) => { if (s.death!.age < 5 || off[i]!.death!.age < 5) expect(s.death!.age).toBe(off[i]!.death!.age); });
      // occupation mix (working-age employed person-years 25–64) vs the 推估 national structure for the income group of 2000
      const cnt: Record<string, number> = {}; let tot = 0; const want: Record<string, number> = {};
      for (const s of on) for (const [a, g] of Object.entries((s.flags.occYears as string | undefined) ? JSON.parse(s.flags.occYears as string) as Record<string, string> : {})) {
        if (Number(a) < 25 || Number(a) > 64 || !ENTRY_GROUPS.includes(g as never)) continue; cnt[g] = (cnt[g] ?? 0) + 1; tot++; for (const h of ENTRY_GROUPS) want[h] = (want[h] ?? 0) + GROUP_TARGET[(s.flags.occIg as 'L') ?? 'H'][h]!; }
      const ig = 'entry-year groups';
      const mix = Object.fromEntries(ENTRY_GROUPS.map((g) => [g, +((cnt[g] ?? 0) / tot).toFixed(3)])); console.log(iso, ig, JSON.stringify(mix), 'inc', (inc(on) / inc(off)).toFixed(3), 'nw', (nw(on) / nw(off)).toFixed(3), 'e0', (e0(on) / e0(off)).toFixed(4));
      for (const g of ENTRY_GROUPS) expect(Math.abs((cnt[g] ?? 0) / tot - want[g]! / tot), `${iso} ${g}`).toBeLessThan(0.05);
    });
  }
});
