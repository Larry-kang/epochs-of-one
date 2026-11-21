// Item 4 (v0.17.0): optional birthplace draw weighted by mid-year population (WPP 2024 TPopulation1July, CC BY 3.0 IGO).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { drawBirth, newLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { WppExtra } from '../../src/engine/life/fertility.ts';

const wpp = JSON.parse(readFileSync('public/data/wpp-extra.json', 'utf8')) as WppExtra & { pop?: Record<string, number[]> };
const data = loadBundleFromDisk(process.cwd());
const cfg = (seed: string, by?: 'pop'): LifeConfig => ({ seed, era: { kind: 'past', year: 2020 }, nowYear: 2026, engineVersion: 'x', ...(by ? { by } : {}) });

describe('item 4: population-weighted birthplace', () => {
  it('wpp-extra carries mid-year population in thousands', () => {
    const at = (iso: string, y: number) => wpp.pop![iso]![y - wpp.from]!;
    expect(at('TWN', 2020)).toBeGreaterThan(23000 * 0.95);
    expect(at('TWN', 2020)).toBeLessThan(23900 * 1.05);
    expect(at('IND', 2020)).toBeGreaterThan(at('USA', 2020) * 3);
    expect(Object.keys(wpp.pop!).length).toBe(Object.keys(wpp.tfr).length);
  });
  it('pop mode follows population shares (2020, 4000 draws)', () => {
    const n = new Map<string, number>(); const N = 4000;
    for (let i = 0; i < N; i++) { const b = drawBirth(data.index, cfg('p' + i, 'pop'), undefined, wpp); if (!('infeasible' in b)) n.set(b.iso, (n.get(b.iso) ?? 0) + 1); }
    const sh = (iso: string) => (n.get(iso) ?? 0) / N;
    // world 2020 ≈ 7.86 bn: CHN ≈ 18.2 %, JPN ≈ 1.6 %; births-weighted JPN would be ≈ 0.6 %
    expect(sh('CHN')).toBeGreaterThan(0.155); expect(sh('CHN')).toBeLessThan(0.21);
    expect(sh('JPN')).toBeGreaterThan(0.011);
  });
  it('default mode is unchanged and a fixed country still wins', () => {
    for (const s of ['a', 'b', 'c', 'd']) expect(drawBirth(data.index, cfg(s), undefined, wpp)).toEqual(drawBirth(data.index, cfg(s)));
    const fx = drawBirth(data.index, { ...cfg('z', 'pop'), constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } }, undefined, wpp);
    expect('infeasible' in fx ? '' : fx.iso).toBe('TWN');
  });
  it('pop mode is deterministic per seed and refuses to draw without population data', () => {
    for (const s of ['r1', 'r2', 'r3']) expect(drawBirth(data.index, cfg(s, 'pop'), undefined, wpp)).toEqual(drawBirth(data.index, cfg(s, 'pop'), undefined, wpp));
    const r = drawBirth(data.index, cfg('nodata', 'pop'));
    expect('infeasible' in r && r.field).toBe('country');
  });
  it('newLife uses the bundle population in pop mode', () => {
    const s = newLife(data, cfg('nl', 'pop'));
    expect('infeasible' in s).toBe(false);
  });
});
