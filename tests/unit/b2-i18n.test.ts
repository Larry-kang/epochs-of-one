// Batch 2 X1: one translation table, five languages, consistent placeholders, fallbacks, locale formatting.
import { describe, it, expect, afterEach } from 'vitest';
import table from '../../src/content/i18n/table.json';
import { t, setLang, eventText, coverage, money, LANGS } from '../../src/ui/i18n.ts';

const ui = table.strings.ui as Record<string, (string | null)[]>;
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
afterEach(() => setLang('zh-TW'));

describe('B2 i18n', () => {
  it('has the five languages as columns of one table', () => {
    expect(table.langs).toEqual(['zh-TW', 'en', 'ja', 'ko', 'vi']);
    expect([...LANGS]).toEqual(table.langs);
    for (const g of Object.values(table.strings)) for (const r of Object.values(g as Record<string, unknown[]>)) expect(r.length).toBe(5);
  });
  it('every UI string has zh-TW and English; translated cells keep the same placeholders', () => {
    for (const [k, r] of Object.entries(ui)) {
      if (k === 'rn_none') continue;
      expect(r[0], k).toBeTruthy(); expect(r[1], k).toBeTruthy();
      for (const c of r.slice(1)) if (c) expect(vars(c), `${k}: ${c}`).toBe(vars(r[0]!));
    }
  });
  it('English is complete; Japanese, Korean and Vietnamese cover the core screens', () => {
    expect(coverage('en')).toBe(1);
    for (const l of ['ja', 'ko', 'vi'] as const) expect(coverage(l)).toBeGreaterThan(0.25);
  });
  it('switches language, falls back to English for untranslated UI and to zh-TW for content', () => {
    expect(t('pause')).toBe('暫停');
    setLang('en'); expect(t('pause')).toBe('Pause'); expect(t('years', { n: 3 })).toBe('3 y');
    setLang('ja'); expect(t('pause')).toBe('一時停止'); expect(t('houseTitle')).toBe('Home');
    expect(eventText('fl_first_steps')).toBe(eventText('fl_first_steps'));
    setLang('vi'); expect(money(1234567)).toMatch(/1\.234\.567/);
  });
});

import { contentLang, contentLangAttr, setLang as setLang3 } from '../../src/ui/i18n.ts';
describe('b3 content fallback is marked', () => {
  it('zh-TW/en/ja/ko: no attribute (translated in v0.11.1); vi marks zh-Hant fallback', () => {
    setLang3('zh-TW'); expect(contentLang()).toBe(''); expect(contentLangAttr()).toBe('');
    setLang3('ja'); expect(contentLang()).toBe(''); setLang3('vi'); expect(contentLang()).toBe('zh-Hant'); expect(contentLangAttr()).toBe(' lang="zh-Hant"');
    setLang3('zh-TW');
  });
});
