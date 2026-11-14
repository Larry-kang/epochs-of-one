// v0.13.0: "compare with my country" card — pure helpers.
import { describe, it, expect } from 'vitest';
import { compareRows, e0Diff, DEFAULT_MY_COUNTRY } from '../../src/ui/logic/compare.ts';
import type { CountryIndex } from '../../src/engine/data/types.ts';
import type { WppExtra } from '../../src/engine/life/fertility.ts';

// from: 1990, two years of data; e0: NGA 50, USA 80; q5: NGA 120, USA 8
const wpp = { note: 'x', from: 1990, tfr: {}, e0: { NGA: [50, 51], USA: [80, 81] }, q5: { NGA: [120, 119], USA: [8, 7] } } as unknown as WppExtra;
const index = {
  countries: [
    { iso: 'NGA', series: { gdpPcPpp: { from: 1990, v: [2000, 2100], imp: ['', ''] } } },
    { iso: 'USA', series: { gdpPcPpp: { from: 1990, v: [40000, 41000], imp: ['', ''] } } },
  ],
} as unknown as CountryIndex;

describe('v0.13.0 compare', () => {
  it('returns e0, q5, gdp rows in order with the right values', () => {
    const rows = compareRows(index, wpp, 'NGA', 'USA', 1990);
    expect(rows.map((r) => r.key)).toEqual(['e0', 'q5', 'gdp']);
    expect(rows[0]).toEqual({ key: 'e0', born: 50, mine: 80 });
    expect(rows[1]).toEqual({ key: 'q5', born: 120, mine: 8 });
    expect(rows[2]).toEqual({ key: 'gdp', born: 2000, mine: 40000 });
  });
  it('uses the series year offset', () => {
    const rows = compareRows(index, wpp, 'NGA', 'USA', 1991);
    expect(rows[2]).toEqual({ key: 'gdp', born: 2100, mine: 41000 });
  });
  it('missing WPP data -> nulls; missing country -> null gdp', () => {
    const rows = compareRows(index, undefined, 'NGA', 'ZZZ', 1990);
    expect(rows.map((r) => ({ key: r.key, born: r.born, mine: r.mine }))).toEqual([
      { key: 'e0', born: null, mine: null },
      { key: 'q5', born: null, mine: null },
      { key: 'gdp', born: 2000, mine: null },
    ]);
  });
  it('e0Diff is mine - born rounded to 1 decimal, null if either missing', () => {
    expect(e0Diff(compareRows(index, wpp, 'NGA', 'USA', 1990))).toBe(30);
    expect(e0Diff(compareRows(index, undefined, 'NGA', 'USA', 1990))).toBeNull();
    const noBorn = [{ key: 'e0', born: null, mine: 80 }, { key: 'q5', born: null, mine: null }, { key: 'gdp', born: null, mine: null }] as const;
    expect(e0Diff([...noBorn])).toBeNull();
  });
  it('DEFAULT_MY_COUNTRY has one entry per UI language', () => {
    expect(Object.keys(DEFAULT_MY_COUNTRY).sort()).toEqual(['en', 'ja', 'ko', 'vi', 'zh-TW'].sort());
    expect(DEFAULT_MY_COUNTRY['zh-TW']).toBe('TWN');
    expect(DEFAULT_MY_COUNTRY.en).toBe('USA');
    expect(DEFAULT_MY_COUNTRY.ja).toBe('JPN');
    expect(DEFAULT_MY_COUNTRY.ko).toBe('KOR');
    expect(DEFAULT_MY_COUNTRY.vi).toBe('VNM');
  });
});
