// v0.11.1: display currency per country (display only; the engine stays in 2021 PPP international $).
import { describe, it, expect, afterEach } from 'vitest';
import cur from '../../src/content/l3-currency.json';
import { money, moneyUsd, setMoneyCountry, currencyOf, setLang } from '../../src/ui/i18n.ts';

afterEach(() => { setMoneyCountry(null); setLang('zh-TW'); });
describe('L3 currency display', () => {
  it('uses WDI PA.NUS.PPP 2021 (CC BY 4.0) and covers the main countries', () => {
    expect(cur.source).toBe('wdi'); expect(cur.indicator).toBe('PA.NUS.PPP'); expect(cur.year).toBe(2021); expect(cur.licence).toBe('CC BY 4.0');
    const r = cur.rates as Record<string, { c: string; r: number }>;
    expect(r.USA).toEqual({ c: 'USD', r: 1 }); expect(r.JPN!.c).toBe('JPY'); expect(r.KOR!.c).toBe('KRW'); expect(r.DEU!.c).toBe('EUR');
    expect(r.TWN).toBeUndefined(); // Taiwan is not in WDI → labelled US$
    for (const v of Object.values(r)) expect(v.r).toBeGreaterThan(0);
  });
  it('labels US$, converts JP ¥ and KR ₩, falls back to US$ for Taiwan', () => {
    setLang('en');
    setMoneyCountry('USA'); expect(money(1234)).toBe('US$1,234'); expect(money(-5)).toBe('−US$5');
    setMoneyCountry('JPN'); expect(money(1000)).toMatch(/^¥\d{2,3},\d{3}$/);
    expect(money(1000)).toBe(`¥${Math.round(1000 * currencyOf('JPN').rate).toLocaleString('en-US')}`);
    setMoneyCountry('KOR'); expect(money(1000)).toMatch(/^₩\d{3},\d{3}$/);
    setMoneyCountry('TWN'); expect(money(1000)).toBe('US$1,000');
    expect(money(1000, 'JPN')).toMatch(/^¥/); expect(moneyUsd(1000)).toBe('US$1,000');
  });
  it('never touches the engine amount (pure formatting)', () => {
    setMoneyCountry('KOR'); const x = 12345.678; money(x); expect(x).toBe(12345.678);
  });
});
