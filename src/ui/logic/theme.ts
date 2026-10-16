// batch 3 #5: light/dark theme. 'auto' follows the OS; the choice is stored on this device only.
export type Theme = 'auto' | 'light' | 'dark';
export const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];
export const nextTheme = (t: Theme): Theme => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]!;
export const parseTheme = (v: string | null): Theme => (v === 'light' || v === 'dark' ? v : 'auto');
/** the theme actually shown, given the OS preference */
export const effectiveTheme = (t: Theme, osDark: boolean): 'light' | 'dark' => (t === 'auto' ? (osDark ? 'dark' : 'light') : t);
