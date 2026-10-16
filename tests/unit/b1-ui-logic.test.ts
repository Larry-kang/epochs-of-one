import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CountryIndex } from '../../src/engine/data/types.ts';
import { birthShares, sharePct, allShares } from '../../src/ui/logic/odds.ts';
import { resolveEra, oddsRange } from '../../src/ui/logic/era.ts';
import { rollIntervals, rollSequence } from '../../src/ui/logic/roll.ts';
import { registryNo, folioLines } from '../../src/ui/logic/cert.ts';
import { SPEEDS, speedForKey, autoCountdownSec } from '../../src/ui/logic/play.ts';
import { portraitGrid, ageBand } from '../../src/ui/logic/portrait.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { drawBirth } from '../../src/engine/life/sim.ts';

const index = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryIndex;

describe('H4/H5 odds card', () => {
  it('top 9 + other sum to 1; India/China lead in 2026; sorted desc', () => {
    const o = birthShares(index, 2026, 2026);
    expect(o.rows).toHaveLength(9);
    expect(o.rows.reduce((a, r) => a + r.share, 0) + o.otherShare).toBeCloseTo(1, 9);
    expect(['IND', 'CHN']).toContain(o.rows[0]!.iso);
    for (let i = 1; i < 9; i++) expect(o.rows[i - 1]!.share).toBeGreaterThanOrEqual(o.rows[i]!.share);
    expect(o.otherN).toBe(allShares(index, 2026, 2026).length - 9);
  });
  it('recomputes per range (1960 differs from 2026)', () => {
    expect(birthShares(index, 1960, 1960).rows.map((r) => r.iso)).not.toEqual(birthShares(index, 2026, 2026).rows.map((r) => r.iso));
  });
  it('percent format: 1 decimal, 2 below 1 %', () => { expect(sharePct(0.176)).toBe('17.6%'); expect(sharePct(0.0034)).toBe('0.34%'); });
});

describe('H6 era', () => {
  it('maps the four choices; any spreads over three eras', () => {
    expect(resolveEra('now', 'random', 0)).toEqual({ kind: 'now' });
    expect(resolveEra('past', 1980, 0)).toEqual({ kind: 'past', year: 1980 });
    expect(resolveEra('future', 'random', 0).kind).toBe('future');
    expect(new Set([0.1, 0.5, 0.9].map((u) => resolveEra('any', 'random', u).kind))).toEqual(new Set(['past', 'now', 'future']));
    expect(oddsRange('future', 'random', 2026, [1950, 2030])).toEqual([2027, 2030]);
  });
  it('future era draws a birth year after now (engine)', () => {
    const d = loadBundleFromDisk();
    for (let i = 0; i < 20; i++) { const b = drawBirth(d.index, { seed: 'fut' + i, era: { kind: 'future', year: 'random' }, nowYear: 2026, engineVersion: 't' }); if ('infeasible' in b) throw new Error(); expect(b.year).toBeGreaterThan(2026); expect(b.year).toBeLessThanOrEqual(2030); }
  });
});

describe('B1 roll', () => {
  it('26 frames, eases 40→250 ms, ~2.5 s total, ends on the drawn country', () => {
    const iv = rollIntervals();
    expect(iv).toHaveLength(26); expect(iv[0]).toBe(40); expect(iv[25]).toBe(250);
    const tot = iv.reduce((a, b) => a + b, 0); expect(tot).toBeGreaterThan(2000); expect(tot).toBeLessThan(3200);
    for (let i = 1; i < iv.length; i++) expect(iv[i]!).toBeGreaterThanOrEqual(iv[i - 1]!);
    let k = 0; const seq = rollSequence([{ iso: 'IND', share: 0.5 }, { iso: 'CHN', share: 0.5 }], 'TWN', () => ((k = (k * 9301 + 49297) % 233280) / 233280));
    expect(seq).toHaveLength(26); expect(seq.at(-1)).toBe('TWN');
  });
});

describe('B2/P6 certificate ids', () => {
  it('registry number is deterministic and kind-specific; folio lines are 30 chars', () => {
    expect(registryNo('TWN', 1990, 'abc')).toBe(registryNo('TWN', 1990, 'abc'));
    expect(registryNo('TWN', 1990, 'abc')).toMatch(/^B-TWN-1990-\d{6}$/);
    expect(registryNo('TWN', 1990, 'abc', 'D')).not.toBe(registryNo('TWN', 1990, 'abc'));
    const [a, b] = folioLines('Chen Mei', 'TWN', 1990, 'F', 's'); expect(a).toHaveLength(30); expect(b).toHaveLength(30); expect(a).toContain('TWN');
  });
});

describe('P2/P4 speeds & auto-choice', () => {
  it('speeds 1–16×, keys 1–6', () => {
    expect([...SPEEDS]).toEqual([1, 2, 4, 8, 12, 16]);
    expect(speedForKey('6')).toBe(16); expect(speedForKey('7')).toBeNull(); expect(speedForKey('a')).toBeNull();
  });
  it('countdown = clamp(len/9, 5, 14) ÷ √speed, ≥ 1.2 s (v0.7.1)', () => {
    expect(autoCountdownSec(9, 1)).toBe(5); expect(autoCountdownSec(90, 1)).toBe(10); expect(autoCountdownSec(900, 1)).toBe(14);
    expect(autoCountdownSec(90, 4)).toBe(5); expect(autoCountdownSec(9, 16)).toBe(1.25); expect(autoCountdownSec(0, 64)).toBe(1.2);
  });
});

describe('P6 pixel portrait', () => {
  it('16×16, changes with age band, sex and skin; deterministic', () => {
    const a = portraitGrid({ age: 30, sex: 'F', skin: 1, outfit: 0 });
    expect(a).toHaveLength(16); a.forEach((r) => expect(r).toHaveLength(16));
    expect(portraitGrid({ age: 30, sex: 'F', skin: 1, outfit: 0 })).toEqual(a);
    expect(portraitGrid({ age: 1, sex: 'F', skin: 1, outfit: 0 })).not.toEqual(a);
    expect(portraitGrid({ age: 70, sex: 'F', skin: 1, outfit: 0 })).not.toEqual(a);
    expect(portraitGrid({ age: 30, sex: 'M', skin: 1, outfit: 0 })).not.toEqual(a);
    expect([0, 5, 15, 30, 55, 80].map(ageBand)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

import { factFor } from '../../src/ui/logic/facts.ts';
describe('P16 fact boxes cite allowed sources', () => {
  it('every choice id yields a fact naming WPP or WDI with its licence', () => {
    const d = loadBundleFromDisk(); const c = d.country('JPN'); const demo = d.demography('JPN');
    for (const id of ['vaccine', 'school', 'hs', 'uni', 'grad', 'career', 'move', 'marry', 'child', 'parents', 'treat']) {
      const f = factFor(id, c, '日本', 2000, demo)!;
      expect(f, id).not.toBeNull();
      expect(f.cite).toMatch(/CC BY (3\.0 IGO|4\.0)/);
      expect(f.text).not.toMatch(/NaN|undefined/);
    }
  });
});
