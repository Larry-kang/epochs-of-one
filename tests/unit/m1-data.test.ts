import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
// @ts-expect-error untyped .mjs
import { validateData } from '../../pipeline/validate.mjs';
// @ts-expect-error untyped .mjs
import { licenseGate } from '../../pipeline/license-gate.mjs';
import type { CountryIndex, Demography } from '../../src/engine/data/types.ts';
import { annualTable, lifeExpectancy, under5 } from '../../src/engine/demography/lifeTable.ts';

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

describe('M1: data POC', () => {
  it('all data files pass JSON Schema + sha256', () => {
    const r = validateData(process.cwd());
    expect(r.errors).toEqual([]);
    expect(r.n).toBeGreaterThan(200);
  });
  it('license gate passes and every file has src/license/retrieved/url', () => {
    const manifest = read<{ files: { src: string[]; license: string[]; retrieved: string; url: string[] }[] }>('public/data/manifest.json');
    const r = licenseGate({ manifest, sources: read('pipeline/sources.json'), dataDir: 'public/data' });
    expect(r.errors).toEqual([]);
    for (const f of manifest.files) {
      expect(f.src.length).toBeGreaterThan(0);
      expect(f.license.length).toBeGreaterThan(0);
      expect(f.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.url.length).toBeGreaterThan(0);
    }
  });
  it('coverage report exists', () => {
    expect(existsSync('docs/data-coverage.md')).toBe(true);
  });
  it('e0 recomputed from stored qx matches WPP published e0 (all countries, years, sexes): worst < 2%, p99 < 1%', () => {
    let worst = 0, worstKey = '', n = 0;
    const errs: number[] = [];
    for (const f of readdirSync('public/data/demography')) {
      const d = read<Demography>(`public/data/demography/${f}`);
      for (let y = d.from; y <= d.to; y += 1) {
        for (const sx of ['M', 'F'] as const) {
          const t = annualTable(d, sx, y);
          const err = Math.abs(lifeExpectancy(t) - t.e0Published) / t.e0Published;
          n++; errs.push(err);
          if (err > worst) { worst = err; worstKey = `${d.iso} ${y} ${sx}`; }
        }
      }
    }
    expect(n).toBeGreaterThan(30000);
    errs.sort((a, b) => a - b);
    const p99 = errs[Math.floor(errs.length * 0.99)]!;
    console.log(`e0 recompute: n=${n} median=${(errs[n >> 1]! * 100).toFixed(3)}% p99=${(p99 * 100).toFixed(3)}% worst=${(worst * 100).toFixed(3)}% (${worstKey})`);
    expect(worst, `worst ${worstKey}`).toBeLessThan(0.02);
    expect(p99).toBeLessThan(0.01);
  });
  it('u5 from stored qx matches life-table q5 (M/F) within 1% relative or 0.0005 absolute', () => {
    for (const iso of ['TWN', 'USA', 'NGA', 'IND', 'JPN']) {
      const d = read<Demography>(`public/data/demography/${iso}.json`);
      for (const y of [1950, 1980, 2023]) for (const sx of ['M', 'F'] as const) {
        const ref = d.q5[sx][y - d.from]!;
        const got = under5(annualTable(d, sx, y));
        expect(Math.abs(got - ref) <= Math.max(0.01 * ref, 0.0005), `${iso} ${y} ${sx}`).toBe(true);
      }
    }
  });
  it('country index sanity: TWN present; births positive; WDI-missing TWN series imputed and flagged', () => {
    const idx = read<CountryIndex>('public/data/countries.json');
    const twn = idx.countries.find((c) => c.iso === 'TWN')!;
    expect(twn).toBeTruthy();
    expect(twn.births.v.every((b) => b > 0)).toBe(true);
    expect(twn.series.gini.imp.every((f) => f === 'region' || f === 'world')).toBe(true);
    const usa = idx.countries.find((c) => c.iso === 'USA')!;
    const shares = (['q1', 'q2', 'q3', 'q4', 'q5'] as const).map((k) => usa.series[k].v[60]!);
    expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(0.02);
  });
  it('self-compiled annual closes: TWSE-backed TAIEX years and multi-exchange BTC years are verified', () => {
    const d = read<{ series: Record<string, { rows: { year: number; close: number; verified: boolean; checked: string[] }[] }> }>('public/data/markets/annual-closes.json');
    const t = d.series.TAIEX!.rows;
    expect(t.find((r) => r.year === 2008)!.close).toBeCloseTo(4591.22, 2);
    expect(t.filter((r) => r.year >= 1999).every((r) => r.verified)).toBe(true);
    const b = d.series.BTC!.rows;
    expect(b.filter((r) => r.year >= 2013).every((r) => r.verified && r.checked.length >= 2)).toBe(true);
  });
});
