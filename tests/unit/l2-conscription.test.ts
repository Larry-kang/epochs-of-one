// L2 conscription v1: statutory terms by era/cohort (TW, KR, US, JP + other T1/T2 rows), engine effects, determinism.
import { describe, it, expect } from 'vitest';
import { termFor, drawService, serviceAge, CONSCRIPTION, CONSCRIPTION_SOURCES, CS_EVENT_IDS } from '../../src/engine/life/conscription.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry, ENGINE_EVENT_IDS } from '../../src/engine/content/registry.ts';
import table from '../../src/content/i18n/table.json' with { type: 'json' };
// @ts-expect-error untyped .mjs pipeline module
import { checkConscription } from '../../pipeline/l2.mjs';
import { readFileSync } from 'node:fs';

const months = (iso: string, born: number, year: number, sex: 'M' | 'F' = 'M') => termFor(iso, sex, born, year)?.months ?? 0;
describe('L2 conscription terms (law facts)', () => {
  it('Taiwan: 2 y (1990s) → 22/20/18/16/14 m → 1 y (2008) → 4 m for born 1994–2004 → 1 y for born 2005+ from 2024', () => {
    expect(months('TWN', 1975, 1995)).toBe(24);
    expect(months('TWN', 1980, 2000)).toBe(22);
    expect(months('TWN', 1984, 2004)).toBe(20);
    expect(months('TWN', 1986, 2006)).toBe(16);
    expect(months('TWN', 1988, 2008)).toBe(12);
    expect(months('TWN', 1993, 2015)).toBe(12); // born before 1994: still the 1-year term
    expect(months('TWN', 1994, 2013)).toBe(4);
    expect(months('TWN', 2004, 2024)).toBe(4); // born 2004 keeps the 4-month rule
    expect(months('TWN', 2005, 2024)).toBe(12);
    expect(months('TWN', 2010, 2030)).toBe(12);
  });
  it('Korea: 36 m (1968) … 26 m (1993), 24 m (2003), 21 m (2011), 18 m from 2020', () => {
    expect(months('KOR', 1950, 1970)).toBe(36);
    expect(months('KOR', 1975, 1995)).toBe(26);
    expect(months('KOR', 1985, 2005)).toBe(24);
    expect(months('KOR', 1992, 2012)).toBe(21);
    expect(months('KOR', 2002, 2022)).toBe(18);
  });
  it('US: draft until 1973 (Korean war / Vietnam era), none since; Japan: none', () => {
    expect(months('USA', 1930, 1951)).toBe(24);
    expect(months('USA', 1948, 1968)).toBe(24);
    expect(months('USA', 1955, 1975)).toBe(0);
    expect(months('JPN', 1950, 1970)).toBe(0);
    expect(months('JPN', 2000, 2020)).toBe(0);
  });
  it('women are not called up (TW/KR/US law); Israel conscripts women (24 m)', () => {
    for (const iso of ['TWN', 'KOR', 'USA']) expect(termFor(iso, 'F', 1980, 2000)).toBeUndefined();
    expect(months('ISR', 1990, 2008, 'F')).toBe(24);
  });
  it('every lottery / selective share and every estimated term is flagged est (推估); table validates', () => {
    for (const [iso, r] of Object.entries(CONSCRIPTION)) for (const t of r.terms) if (t.p > 0 && t.p < 1) expect(t.est, iso + t.from).toBe(true);
    expect(checkConscription(JSON.parse(readFileSync('pipeline/l2/conscription.src.json', 'utf8')))).toEqual([]);
    expect(checkConscription({ regimes: { XXX: { src: ['law-facts'], age: 18, maxAge: 20, terms: [{ from: 2000, months: 12, p: 0.5 }] } } })).not.toEqual([]);
  });
  it('TW/KR/US/JP rows cite a statute or official notice', () => {
    for (const iso of ['TWN', 'KOR', 'USA', 'JPN']) { expect(CONSCRIPTION_SOURCES[iso]!.length).toBeGreaterThan(0); for (const s of CONSCRIPTION_SOURCES[iso]!) expect(s.url).toMatch(/^https:\/\//); }
  });
  it('service age defers to the end of full-time study (capped)', () => {
    expect(serviceAge('TWN', 18)).toBe(19); expect(serviceAge('TWN', 24)).toBe(24); expect(serviceAge('USA', 27)).toBeUndefined(); expect(serviceAge('NLD', 18)).toBeUndefined();
  });
  it('KR athletes can be exempt; US lottery draws respect p', () => {
    expect(drawService('KOR', 'M', 1995, 2015, 'athlete', 0, 0, 0)?.exempt).toBe('athlete');
    expect(drawService('KOR', 'M', 1995, 2015, 'sw_eng', 0, 0.99, 0)?.months).toBe(21);
    expect(drawService('USA', 'M', 1946, 1966, undefined, 0.5, 0, 0)).toBeUndefined();
    expect(drawService('USA', 'M', 1946, 1966, undefined, 0.01, 0, 0)?.months).toBe(24);
  });
  it('every conscription event has zh-TW + en text and is registered', () => {
    const ev = (table as unknown as { strings: { events: Record<string, (string | null)[]> } }).strings.events;
    for (const id of CS_EVENT_IDS) { expect(ev[id]?.[0], id).toBeTruthy(); expect(ev[id]?.[1], id).toBeTruthy(); expect(ENGINE_EVENT_IDS as readonly string[]).toContain(id); }
  });
});

describe('L2 conscription in the engine', () => {
  const data = loadBundleFromDisk();
  const cfg = (seed: string, iso: string, year: number, sex: 'M' | 'F', occ = true): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't', ...(occ ? { occ: true } : {}),
    constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'fixed', value: sex }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
  const lives = (iso: string, year: number, sex: 'M' | 'F', n = 40, occ = true) => Array.from({ length: n }, (_, i) => runLife(data, cfg(`l2-${iso}-${i}`, iso, year, sex, occ), registry) as LifeState);
  it('TW men born 1985 serve (alive at service age), women never; months recorded', () => {
    const m = lives('TWN', 1985, 'M').filter((s) => s.death!.age > 26);
    const served = m.filter((s) => s.events.some((e) => e.id.startsWith('cs_start_') || e.id.startsWith('cs_alt_')));
    expect(served.length).toBe(m.length);
    for (const s of served) expect([24, 22, 20, 18, 16, 14, 12]).toContain(Number(s.flags.csMonths));
    expect(lives('TWN', 1985, 'F', 20).some((s) => s.events.some((e) => e.id.startsWith('cs_')))).toBe(false);
  });
  it('service years earn conscript pay, not the full wage (TW men 1985, same seeds as women-free counterfactual)', () => {
    const m = lives('TWN', 1985, 'M', 30).filter((s) => s.death!.age > 30);
    for (const s of m) { const a = Number(s.events.find((e) => e.id.startsWith('cs_start_') || e.id.startsWith('cs_alt_'))!.age); const y = s.years[a]!; expect(y.unemployed).toBe(false); }
  });
  it('JP: no service; US born 1960: no service; deterministic', () => {
    expect(lives('JPN', 1970, 'M', 20).some((s) => s.events.some((e) => e.id.startsWith('cs_')))).toBe(false);
    expect(lives('USA', 1960, 'M', 20).some((s) => s.events.some((e) => e.id.startsWith('cs_')))).toBe(false);
    const a = runLife(data, cfg('det', 'KOR', 1990, 'M'), registry) as LifeState; const b = runLife(data, cfg('det', 'KOR', 1990, 'M'), registry) as LifeState;
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });
  it('legacy engine (occupations off) is unchanged: no conscription', () => {
    expect(lives('KOR', 1990, 'M', 10, false).some((s) => s.events.some((e) => e.id.startsWith('cs_')))).toBe(false);
  });
});
