// Item 2 (v0.19.0): Taiwan lives show NT$ via the World Bank ICP 2021 GDP PPP for "Taiwan, China" (CC BY 4.0),
// the same indicator family as the WDI PA.NUS.PPP factors used for every other country. Display only.
import { describe, it, expect, afterEach } from 'vitest';
import cur from '../../src/content/l3-currency.json';
import { money, setMoneyCountry, setLang } from '../../src/ui/i18n.ts';

afterEach(() => { setMoneyCountry(null); setLang('zh-TW'); });
describe('item 2: NT$ for Taiwan', () => {
  it('carries a sourced, dated TWD factor', () => {
    const r = cur.rates as Record<string, { c: string; r: number }>;
    expect(r.TWN).toEqual({ c: 'TWD', r: 14.3962 });
    const s = (cur as unknown as { supplements: { iso: string; source: string; url: string; licence: string; retrieved: string }[] }).supplements;
    const tw = s.find((x) => x.iso === 'TWN')!;
    expect(tw.source).toMatch(/ICP 2021/); expect(tw.licence).toBe('CC BY 4.0'); expect(tw.retrieved).toBe('2026-11-21');
    expect(tw.url).toMatch(/^https:\/\/api\.worldbank\.org\/v2\/sources\/90\//);
  });
  it('formats Taiwan amounts as NT$', () => {
    setLang('en'); setMoneyCountry('TWN');
    expect(money(1000)).toBe('NT$14,396');
    expect(money(-10)).toBe('−NT$144');
  });
});
