// L3 T1 wave A (TW/US/JP/KR): institutions data, local names (zh-TW/en + ja/ko), engine hooks, equity rules.
import { describe, it, expect } from 'vitest';
import { INST, instAt, instName, jpNonRegShare, jpRegWage, jpLifeShare, JP_NONREG_WAGE, INST_EVENT_IDS, usUninsuredCost } from '../../src/engine/life/institutions.ts';
import { occName, OCCS } from '../../src/engine/life/occupation.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry, ENGINE_EVENT_IDS } from '../../src/engine/content/registry.ts';
import table from '../../src/content/i18n/table.json' with { type: 'json' };
import local from '../../src/content/l3-local.json' with { type: 'json' };
import { readFileSync } from 'node:fs';

const ev = (table as unknown as { strings: { events: Record<string, (string | null)[]>; ui: Record<string, (string | null)[]> } }).strings;
describe('L3 institutions data', () => {
  it('covers TW, US, JP, KR with every key; rows sorted; zh-TW + en everywhere; ja for JP and ko for KR', () => {
    expect(Object.keys(INST).sort()).toEqual(['JPN', 'KOR', 'TWN', 'USA']);
    for (const [iso, c] of Object.entries(INST)) for (const k of ['school', 'hsExam', 'uniExam', 'civilExam', 'health', 'pension'] as const) {
      let prev = -Infinity;
      for (const r of c[k]) { expect(r.from).toBeGreaterThanOrEqual(prev); prev = r.from; expect(r.zh && r.en, `${iso} ${k}`).toBeTruthy();
        if (iso === 'JPN') expect(r.ja, `${iso} ${k} ja`).toBeTruthy(); if (iso === 'KOR') expect(r.ko, `${iso} ${k} ko`).toBeTruthy(); }
    }
  });
  it('key facts: TW NHI 1995, 會考 2014, 分科 2022; KR 수능 1994, NHI universal 1989, 국민연금 1988; JP 皆保険 1961, 共通テスト 2021; US Medicare 1965, ACA 2014', () => {
    expect(instAt('TWN', 'health', 1994)!.kind).toBe('partial'); expect(instAt('TWN', 'health', 1995)!.kind).toBe('nhi');
    expect(instAt('TWN', 'hsExam', 2014)!.zh).toContain('會考'); expect(instAt('TWN', 'uniExam', 2022)!.zh).toContain('分科');
    expect(instAt('KOR', 'uniExam', 1994)!.ko).toContain('수능'); expect(instAt('KOR', 'health', 1989)!.kind).toBe('universal'); expect(instAt('KOR', 'pension', 1988)!.ko).toBe('국민연금');
    expect(instAt('JPN', 'health', 1961)!.ja).toBe('国民皆保険'); expect(instAt('JPN', 'uniExam', 2021)!.ja).toContain('共通テスト');
    expect(instAt('USA', 'health', 1965)!.en).toContain('Medicare'); expect(instAt('USA', 'health', 2014)!.kind).toBe('employer-aca');
    expect(instName('KOR|uniExam|1994', 'ko')).toContain('수능'); expect(instName('KOR|uniExam|1994', 'zh-TW')).toContain('修能');
  });
  it('the shipped institutions file is in the manifest with law-fact sources only', () => {
    const m = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')) as { files: { path: string; src: string[]; license: string[] }[] };
    for (const p of ['l2/institutions.json', 'l2/conscription.json']) { const f = m.files.find((x) => x.path === p)!; expect(f, p).toBeTruthy(); expect(f.license).toEqual(['L-facts']); for (const s of f.src) expect(s).toMatch(/^law-/); }
  });
});

describe('L3 local occupation names', () => {
  it('every occupation has ja and ko names; local overrides exist for all four countries', () => {
    const n = (local as unknown as { names: Record<string, { ja: string; ko: string }> }).names;
    for (const o of OCCS) { expect(n[o.id]?.ja, o.id).toBeTruthy(); expect(n[o.id]?.ko, o.id).toBeTruthy(); }
    expect(occName('legislator', 'en', 'USA')).toBe('Member of Congress'); expect(occName('legislator', 'zh-TW', 'TWN')).toBe('立法委員');
    expect(occName('legislator', 'ja', 'JPN')).toBe('国会議員'); expect(occName('civil_servant', 'ko', 'KOR')).toContain('9급');
    expect(occName('civil_servant', 'zh-TW')).toBe('公務員'); expect(occName('sw_eng', 'vi')).toBe('Software engineer');
  });
  it('every L3 event and UI string has zh-TW + en', () => {
    for (const id of INST_EVENT_IDS) { expect(ev.events[id]?.[0], id).toBeTruthy(); expect(ev.events[id]?.[1], id).toBeTruthy(); expect(ENGINE_EVENT_IDS as readonly string[]).toContain(id); }
    for (const k of ['f_service', 'csServing', 'csAltServing', 'csEstNote', 'f_inst', 'jpReg', 'jpNonReg', 'aboutL2']) { expect(ev.ui[k]?.[0], k).toBeTruthy(); expect(ev.ui[k]?.[1], k).toBeTruthy(); }
  });
});

describe('L3 engine hooks', () => {
  const data = loadBundleFromDisk();
  const cfg = (seed: string, iso: string, year: number): LifeConfig => ({ seed, era: { kind: 'past', year }, nowYear: 2026, engineVersion: 't', occ: true,
    constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
  const lives = (iso: string, year: number, n = 60) => Array.from({ length: n }, (_, i) => runLife(data, cfg(`l3-${iso}-${i}`, iso, year), registry) as LifeState);
  const has = (a: LifeState[], id: string) => a.some((s) => s.events.some((e) => e.id === id));
  it('JP regular/non-regular split is mean-neutral over a career (career-average non-regular share s̄)', () => {
    for (const y of [1960, 1990, 2010, 2030]) { const s = jpNonRegShare(y), sb = jpLifeShare(s), R = jpRegWage(s); expect(sb).toBeLessThan(s); expect(sb * JP_NONREG_WAGE * R + (1 - sb) * R).toBeCloseTo(1, 10); }
  });
  it('JP lives get a regular / non-regular status; KR lives can take honourable early retirement; US unemployment can cost cover', () => {
    const jp = lives('JPN', 1980); expect(has(jp, 'in_jp_regular')).toBe(true); expect(has(jp, 'in_jp_nonreg')).toBe(true);
    expect(has(lives('KOR', 1960, 150), 'in_kr_early_exit')).toBe(true);
    expect(has(lives('USA', 1980), 'in_us_uninsured')).toBe(true);
    expect(usUninsuredCost(2015)).toBeLessThan(usUninsuredCost(2000));
  });
  it('TW exam / scheme events name the right exam for the era', () => {
    const tw = lives('TWN', 1990);
    const e = tw.flatMap((s) => s.events).filter((x) => x.id === 'in_uniexam' || x.id.startsWith('in_uniexam_retake'));
    expect(e.length).toBeGreaterThan(0); for (const x of e) expect(String(x.vars!.inst)).toBe('TWN|uniExam|2002');
  });
  it('equity (static): the institution code reads no sex, ethnicity, religion or caste', () => {
    const src = readFileSync('src/engine/life/institutions.ts', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/\bsex\b/); expect(src).not.toMatch(/ethnic|religion|caste/i);
  });
});
