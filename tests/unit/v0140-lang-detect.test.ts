// v0.14.0: first visit preselects the UI language from the browser's languages.
import { describe, it, expect } from 'vitest';
import { pickLang } from '../../src/ui/i18n.ts';

describe('v0.14.0 pickLang', () => {
  it('maps browser languages to a supported UI language', () => {
    expect(pickLang(['ja-JP', 'en-US'])).toBe('ja');
    expect(pickLang(['ko'])).toBe('ko');
    expect(pickLang(['en-GB'])).toBe('en');
    expect(pickLang(['vi-VN'])).toBe('vi');
    expect(pickLang(['zh-TW'])).toBe('zh-TW');
    expect(pickLang(['zh-Hant-HK'])).toBe('zh-TW');
    expect(pickLang(['zh-CN'])).toBe('zh-TW');
  });
  it('takes the first supported language in preference order', () => {
    expect(pickLang(['fr-FR', 'vi-VN', 'en'])).toBe('vi');
    expect(pickLang(['de', 'ko-KR'])).toBe('ko');
  });
  it('falls back to English for unsupported languages, zh-TW when unknown', () => {
    expect(pickLang(['fr-FR', 'de'])).toBe('en');
    expect(pickLang([])).toBe('zh-TW');
    expect(pickLang(undefined)).toBe('zh-TW');
  });
});
