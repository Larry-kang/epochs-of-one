// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Shared rule: Math.random is banned everywhere. All randomness must come from seeded streams. */
export const noMathRandom = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded RNG streams (src/engine/rng) — Math.random is banned.' },
  ],
};

export default tseslint.config(
  { ignores: ['dist/**', '.cache/**', 'node_modules/**', 'public/**', 'playwright-report/**', 'test-results/**', 'data-raw/**', 'shots/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { ...noMathRandom },
  },
);
