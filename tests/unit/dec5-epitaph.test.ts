// Item 5 P1 / v0.22.0 (C1): local memorial hall — epitaphs live only in localStorage, cleaned and capped.
import { describe, it, expect } from 'vitest';
import { EPITAPH_MAX, epitaphKey, cleanEpitaph } from '../../src/ui/logic/epitaph.ts';

describe('epitaph', () => {
  it('is keyed per life id under the app prefix', () => {
    expect(epitaphKey('epochs', 'abc')).toBe('epochs.epitaph.abc');
  });
  it('collapses whitespace and trims', () => {
    expect(cleanEpitaph('  一生\n\t平凡  ')).toBe('一生 平凡');
    expect(cleanEpitaph(' \n\t ')).toBe('');
  });
  it('drops control and bidi-override characters', () => {
    expect(cleanEpitaph('a\u0000b\u0007c\u202Ed\u2066e')).toBe('abcde');
  });
  it(`caps at ${EPITAPH_MAX} characters, counted by code point`, () => {
    expect(EPITAPH_MAX).toBe(60);
    const out = cleanEpitaph('🌸'.repeat(61));
    expect(Array.from(out)).toHaveLength(60);
    expect(out).toBe('🌸'.repeat(60));
  });
});
