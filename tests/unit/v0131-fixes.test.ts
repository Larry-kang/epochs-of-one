import { describe, it, expect, afterEach } from 'vitest';
import { showInvestPrompt } from '../../src/engine/life/spend.ts';
import { koParticles, setLang, t } from '../../src/ui/i18n.ts';
import { enCountry } from '../../src/ui/logic/story-grammar.ts';

const st = (cash: number, target: Record<string, number> = {}) => ({ econ: { cash }, portfolio: { target } });

describe('v0.13.1 fixes', () => {
  afterEach(() => setLang('zh-TW'));

  it('hides the invest prompt when savings are zero or negative', () => {
    expect(showInvestPrompt(st(-5000), true)).toBe(false);
    expect(showInvestPrompt(st(0), true)).toBe(false);
    expect(showInvestPrompt(st(1000), true)).toBe(true);
    expect(showInvestPrompt(st(1000), false)).toBe(false);
    expect(showInvestPrompt(st(1000, { eq: 1 }), true)).toBe(false);
  });

  it('picks Korean particles from the final consonant', () => {
    expect(koParticles('김다은은(는) 왔다')).toBe('김다은은 왔다');
    expect(koParticles('정혜진와(과) 결혼')).toBe('정혜진과 결혼');
    expect(koParticles('이수지와(과) 결혼')).toBe('이수지와 결혼');
    expect(koParticles('민수이(가)')).toBe('민수가');
    expect(koParticles('은행을(를)')).toBe('은행을');
    expect(koParticles('서울(으)로')).toBe('서울로');
    expect(koParticles('부산(으)로')).toBe('부산으로');
    expect(koParticles('Eve와(과)')).toBe('Eve와(과)');
  });

  it('applies Korean particles in ko t() and leaves other languages alone', () => {
    setLang('ko');
    expect(t('ds_family_spouse', { spouse: '정혜진' })).toBe('정혜진과 한평생을 함께했습니다.');
    expect(t('ds_family_spouse', { spouse: '이수지' })).toBe('이수지와 한평생을 함께했습니다.');
    setLang('en');
    expect(t('ds_family_spouse', { spouse: 'Eve' })).toBe('Shared a life with Eve.');
  });

  it('adds "the" to English country names that need it', () => {
    expect(enCountry('United States')).toBe('the United States');
    expect(enCountry('United Kingdom')).toBe('the United Kingdom');
    expect(enCountry('Philippines')).toBe('the Philippines');
    expect(enCountry('Netherlands')).toBe('the Netherlands');
    expect(enCountry('Nigeria')).toBe('Nigeria');
    expect(enCountry('the Gambia')).toBe('the Gambia');
  });

  it('has a no-schooling death line in every language', () => {
    for (const l of ['zh-TW', 'en', 'ja', 'ko'] as const) {
      setLang(l);
      const s = t('ds_edu_none');
      expect(s).not.toBe('ds_edu_none');
      expect(s).not.toMatch(/No schooling|未受正式教育/);
    }
  });
});
