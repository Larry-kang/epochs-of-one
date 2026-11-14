import { describe, it, expect, afterEach } from 'vitest';
import { t, esc, setLang, money, eventText } from '../../src/ui/i18n.ts';
import { lineChart } from '../../src/ui/charts.ts';
import { lifeMapTitle } from '../../src/ui/lifemap-title.ts';

describe('v0.12.1 fixes', () => {
  afterEach(() => setLang('zh-TW'));

  it('uses localized years on chart ticks in zh/en/ja/ko', () => {
    const values = [10, 20, 30, 40];
    for (const lang of ['zh-TW', 'en', 'ja', 'ko'] as const) {
      setLang(lang);
      const html = lineChart(values, { label: 'test', color: 'red' });
      expect(html).toContain(esc(t('years', { n: 0 })));
      expect(html).toContain(esc(t('years', { n: values.length - 1 })));
      if (lang !== 'zh-TW') expect(html).not.toContain('歲');
    }
  });

  it('shows a formatted real event amount without placeholders', () => {
    setLang('zh-TW');
    const title = lifeMapTitle(22, eventText('first_paycheck', { amount: money(12345, 'TWN') }));
    expect(title).toContain(money(12345, 'TWN'));
    expect(title).not.toContain('…');
    expect(title).not.toMatch(/[{}]/);
  });

  it('escapes title content once', () => {
    const title = lifeMapTitle(3, 'A"<&B');
    expect(title).toContain('A&quot;&lt;&amp;B');
    expect(title).not.toContain('&amp;quot;');
    expect(title).not.toContain('&amp;lt;');
    expect(title).not.toContain('&amp;amp;');
  });
});
