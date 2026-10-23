import { describe, it, expect } from 'vitest';
import table from '../../src/content/i18n/table.json';
import { setLang, contentLang, eventText } from '../../src/ui/i18n.ts';

type Row = (string | null)[];
const S = (table as unknown as { strings: Record<string, Record<string, Row>> }).strings;
const ph = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(',');
const SECTIONS = ['events', 'decisions', 'pool'] as const;
const COLS = { en: 1, ja: 2, ko: 3 } as const;

describe('v0.11.1 content translations', () => {
  for (const sec of SECTIONS) for (const [l, i] of Object.entries(COLS)) it(`${sec}: every row has ${l} with the zh placeholder set`, () => {
    const bad: string[] = [];
    for (const [k, r] of Object.entries(S[sec]!)) {
      if (!r[0]) continue;
      const v = r[i];
      if (!v) bad.push(`${k}: missing`);
      else if (ph(v) !== ph(r[0])) bad.push(`${k}: ${ph(v)} vs ${ph(r[0])}`);
    }
    expect(bad).toEqual([]);
  });
  it('en and ko content has no Han characters', () => {
    for (const sec of SECTIONS) for (const [k, r] of Object.entries(S[sec]!)) for (const i of [1, 3]) expect(/[\u4e00-\u9fff]/.test(r[i] ?? ''), `${sec}.${k}[${i}]`).toBe(false);
  });
  it('contentLang: no zh fallback attribute for en/ja/ko, still zh-Hant for vi', () => {
    for (const l of ['zh-TW', 'en', 'ja', 'ko'] as const) { setLang(l); expect(contentLang()).toBe(''); }
    setLang('vi'); expect(contentLang()).toBe('zh-Hant');
    setLang('en'); expect(eventText('first_paycheck', { amount: 'US$1' })).toContain('US$1');
    setLang('zh-TW');
  });
});
