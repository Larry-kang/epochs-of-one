// Item 3: official help resources per UI language, each with a checked source URL.
import { describe, it, expect } from 'vitest';
import { HELP, helpOrder } from '../../src/ui/logic/help.ts';
import { LANGS } from '../../src/ui/i18n.ts';

describe('help resources', () => {
  it('lists the UI language country first', () => {
    expect(helpOrder('zh-TW')[0]!.tel).toBe('1925');
    expect(helpOrder('en')[0]!.tel).toBe('988');
    expect(helpOrder('ja')[0]!.tel).toBe('0570-064-556');
    expect(helpOrder('ko')[0]!.tel).toBe('109');
    expect(helpOrder('vi')[0]!.tel).toBe('111');
    expect(helpOrder('ko')).toHaveLength(HELP.length);
  });
  it('every entry is sourced, dated and named in every language', () => {
    expect(HELP.length).toBeGreaterThanOrEqual(7);
    for (const h of HELP) {
      expect(h.url).toMatch(/^https:\/\//);
      expect(h.checked).toBe('2026-11-21');
      for (const l of LANGS) expect(h.name[l]?.length).toBeGreaterThan(0);
    }
  });
});
