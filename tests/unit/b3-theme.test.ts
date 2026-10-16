import { describe, it, expect } from 'vitest';
import { nextTheme, parseTheme, effectiveTheme } from '../../src/ui/logic/theme.ts';
describe('b3 theme', () => {
  it('cycles auto → light → dark → auto', () => { expect(nextTheme('auto')).toBe('light'); expect(nextTheme('light')).toBe('dark'); expect(nextTheme('dark')).toBe('auto'); });
  it('parses stored values safely', () => { expect(parseTheme(null)).toBe('auto'); expect(parseTheme('dark')).toBe('dark'); expect(parseTheme('weird')).toBe('auto'); });
  it('auto follows the OS', () => { expect(effectiveTheme('auto', true)).toBe('dark'); expect(effectiveTheme('auto', false)).toBe('light'); expect(effectiveTheme('light', true)).toBe('light'); });
});
